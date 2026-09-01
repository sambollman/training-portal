const express = require('express');
const router = express.Router();
const { db } = require('../db/connection');
const { requireAuth, requireRole } = require('../middleware/auth');
const { isDuplicateKeyError } = require('../db/errors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = '/app/uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// The list of training columns shared by every "list a training" query
// below, with session_date/end_date converted to plain YYYY-MM-DD text
// at the database layer (matching the original Postgres to_char(...)
// behavior) so the frontend gets clean date strings either way.
const TRAINING_COLUMNS = [
  't.id', 't.title', 't.category', 't.description', 't.instructor', 't.location',
  db.raw("CONVERT(varchar(10), t.session_date, 23) as session_date"),
  db.raw("CONVERT(varchar(10), t.end_date, 23) as end_date"),
  't.start_time', 't.end_time', 't.duration_hours', 't.seat_capacity',
  't.no_seat_limit', 't.cost', 't.training_type', 't.is_required',
  't.is_out_of_state', 't.is_archived', 't.is_closed', 't.section_number',
  't.compliance_tag', 't.instructor_id', 't.created_by', 't.created_at', 't.updated_at',
];

// enrolled_count as a correlated subquery rather than a LEFT JOIN +
// GROUP BY. The original Postgres version grouped by t.id alone and
// relied on Postgres inferring every other t.* column is functionally
// dependent on the primary key — SQL Server doesn't make that
// inference and would require every selected column listed in GROUP BY
// instead. A subquery sidesteps the whole issue and is simpler besides.
const ENROLLED_COUNT = db.raw(
  "(SELECT COUNT(*) FROM enrollment_requests er2 WHERE er2.training_id = t.id AND er2.status IN ('approved', 'enrolled')) as enrolled_count"
);

// Fetch the instructor list for a batch of trainings in one query, then
// group the results in JS and attach them to each training row.
//
// The original Postgres version built this with a correlated
// json_agg(json_build_object(...)) subquery, returning either a JSON
// array or NULL (never an empty array) per row. SQL Server's equivalent
// (FOR JSON PATH) is awkward to work with generically and returns a
// JSON *string* that would need parsing back out — doing the grouping
// here in plain JS is simpler to read and easier to get right, and
// preserves the same array-or-null contract the frontend already
// expects.
async function attachInstructors(trainings) {
  if (trainings.length === 0) return trainings;

  const trainingIds = trainings.map((t) => t.id);
  const rows = await db('training_instructors as ti')
    .join('users as u', 'ti.user_id', 'u.id')
    .whereIn('ti.training_id', trainingIds)
    .select('ti.training_id', 'u.id', 'u.first_name', 'u.last_name', 'u.full_name');

  const instructorsByTrainingId = {};
  for (const row of rows) {
    const list = instructorsByTrainingId[row.training_id] || (instructorsByTrainingId[row.training_id] = []);
    list.push({ id: row.id, first_name: row.first_name, last_name: row.last_name, full_name: row.full_name });
  }

  for (const training of trainings) {
    training.instructors = instructorsByTrainingId[training.id] || null;
  }
  return trainings;
}

// Insert rows into training_instructors, silently skipping any that
// already exist (mirrors the original "ON CONFLICT DO NOTHING", which
// SQL Server has no direct equivalent for — Knex can't generate an
// upsert for mssql, so this just tries each insert and ignores the
// specific case of a duplicate-key error).
async function insertInstructorsIgnoringDuplicates(trainingId, instructorIds) {
  for (const userId of instructorIds) {
    try {
      await db('training_instructors').insert({ training_id: trainingId, user_id: userId });
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
    }
  }
}

// GET /api/trainings - list all active trainings
router.get('/', requireAuth, async (req, res) => {
  try {
    const trainings = await db('trainings as t')
      .select(...TRAINING_COLUMNS, ENROLLED_COUNT)
      .where('t.is_archived', false)
      .andWhere((builder) => {
        builder.where('t.session_date', '>=', db.raw('CAST(GETDATE() AS DATE)')).orWhereNull('t.session_date');
      })
      .orderBy('t.session_date', 'asc');

    await attachInstructors(trainings);
    res.json({ trainings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch trainings' });
  }
});

// GET /api/trainings/all - all trainings including past (coordinator only)
router.get('/all', requireAuth, requireRole('coordinator', 'instructor'), async (req, res) => {
  try {
    const fullHistory = req.query.fullHistory === 'true';

    let query = db('trainings as t')
      .select(...TRAINING_COLUMNS, ENROLLED_COUNT)
      .where('t.is_archived', false)
      .orderBy('t.session_date', 'desc')
      .limit(1000);

    if (!fullHistory) {
      query = query.andWhere((builder) => {
        builder
          .whereNull('t.session_date')
          .orWhere('t.session_date', '>=', db.raw('DATEADD(day, -90, CAST(GETDATE() AS DATE))'));
      });
    }

    const trainings = await query;
    await attachInstructors(trainings);
    res.json({ trainings, fullHistory });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch trainings' });
  }
});

// GET /api/trainings/calendar - all trainings for calendar view (any authenticated user)
router.get('/calendar', requireAuth, async (req, res) => {
  try {
    const trainings = await db('trainings as t')
      .select(
        't.id', 't.title', 't.training_type', 't.is_required',
        db.raw("CONVERT(varchar(10), t.session_date, 23) as session_date"),
        db.raw("CONVERT(varchar(10), t.end_date, 23) as end_date"),
        't.is_archived', 't.is_closed'
      )
      .where('t.is_archived', false)
      .orderBy('t.session_date', 'asc');

    res.json({ trainings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch trainings' });
  }
});

// GET /api/trainings/:id - single training detail
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const [training] = await db('trainings as t')
      .select(...TRAINING_COLUMNS, ENROLLED_COUNT)
      .where('t.id', req.params.id);

    if (!training) {
      return res.status(404).json({ error: 'Training not found' });
    }
    await attachInstructors([training]);

    // Supervisors and coordinators can see who is enrolled
    let enrollments = [];
    if (req.user.role === 'supervisor' || req.user.role === 'coordinator' || req.user.role === 'instructor') {
      enrollments = await db('enrollment_requests as er')
        .join('users as u', 'er.officer_id', 'u.id')
        .select('er.*', 'u.full_name', 'u.badge_number', 'u.unit')
        .where('er.training_id', req.params.id)
        .orderBy('u.full_name', 'asc');
    }

    res.json({ training, enrollments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch training' });
  }
});

// POST /api/trainings - create a training (coordinator only)
router.post('/', requireAuth, requireRole('coordinator'), async (req, res) => {
  const {
    title, category, description, instructor, instructor_id, instructor_ids,
    location, session_date, start_time,
    duration_hours, seat_capacity, is_required, is_out_of_state, training_type, section_number, compliance_tag
  } = req.body;

  if (!title || !session_date) {
    return res.status(400).json({ error: 'Title and session date are required' });
  }

  try {
    const [training] = await db('trainings')
      .insert({
        title, category, description,
        instructor: instructor || null,
        instructor_id: instructor_id || null,
        location, session_date, start_time,
        duration_hours, seat_capacity,
        is_required: is_required || false,
        is_out_of_state: is_out_of_state || false,
        training_type: training_type || 'internal',
        section_number: section_number || null,
        compliance_tag: compliance_tag || null,
        created_by: req.user.id,
      })
      .returning('*');

    if (instructor_ids && instructor_ids.length > 0) {
      await insertInstructorsIgnoringDuplicates(training.id, instructor_ids);
    }

    res.status(201).json({ training });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create training' });
  }
});

// PUT /api/trainings/:id - update a training (coordinator only)
router.put('/:id', requireAuth, requireRole('coordinator'), async (req, res) => {
  const { title, category, description, instructor, instructor_id, instructor_ids, location, session_date, end_date, start_time, end_time, duration_hours, seat_capacity, no_seat_limit, cost, training_type, is_required, is_out_of_state, section_number, compliance_tag } = req.body;

  try {
    // Note: no .returning() here — trainings has an AFTER UPDATE
    // trigger (for updated_at), and SQL Server disallows OUTPUT on an
    // UPDATE against a table with a matching trigger. See the note in
    // db/connection.js. Affected-row count doubles as the not-found
    // check, then the row is fetched separately.
    const affectedRows = await db('trainings')
      .where({ id: req.params.id, is_archived: false })
      .update({
        title, category, description, instructor,
        instructor_id: instructor_id || null,
        location,
        session_date: session_date || null,
        end_date: end_date || null,
        start_time: start_time || null,
        end_time: end_time || null,
        duration_hours: duration_hours || null,
        seat_capacity: seat_capacity || null,
        no_seat_limit: no_seat_limit || false,
        cost: cost || null,
        training_type,
        is_out_of_state: is_out_of_state || false,
        is_required: is_required || false,
        section_number: section_number || null,
        compliance_tag: compliance_tag || null,
      });

    if (affectedRows === 0) {
      return res.status(404).json({ error: 'Training not found' });
    }

    // Replace the instructor list wholesale: clear it out, then
    // re-insert whatever was submitted.
    await db('training_instructors').where({ training_id: req.params.id }).delete();
    if (instructor_ids && instructor_ids.length > 0) {
      await insertInstructorsIgnoringDuplicates(req.params.id, instructor_ids);
    }

    const training = await db('trainings').where({ id: req.params.id }).first();
    res.json({ training });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update training' });
  }
});

// DELETE /api/trainings/:id - archive a training (coordinator only)
router.delete('/:id', requireAuth, requireRole('coordinator'), async (req, res) => {
  try {
    // Same OUTPUT-vs-trigger restriction as above — no .returning().
    const affectedRows = await db('trainings')
      .where({ id: req.params.id })
      .update({ is_archived: true });

    if (affectedRows === 0) {
      return res.status(404).json({ error: 'Training not found' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to archive training' });
  }
});

// GET /api/trainings/:id/roster - download CSV (supervisor+)
router.get('/:id/roster', requireAuth, requireRole('supervisor', 'coordinator'), async (req, res) => {
  try {
    const training = await db('trainings').where({ id: req.params.id }).first();
    if (!training) {
      return res.status(404).json({ error: 'Training not found' });
    }

    const enrollments = await db('enrollment_requests as er')
      .join('users as u', 'er.officer_id', 'u.id')
      .select('u.post_license_number', 'er.attended')
      .where({ 'er.training_id': req.params.id, 'er.attended': true })
      .orderBy('u.last_name', 'asc')
      .orderBy('u.first_name', 'asc');

    const startDate = training.session_date ? new Date(training.session_date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : '';
    const endDate = training.end_date ? new Date(training.end_date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : startDate;

    const lines = [];
    lines.push('Username,Section,Status,StartDate,EndDate,ExitDate,Grade,Assignments,AssignmentsCompleted,cf_GunQual');

    for (const row of enrollments) {
      lines.push(`"${row.post_license_number || ''}","${training.section_number || training.title}","COMPLETED","${startDate}","${endDate}","${endDate}","100","","",""`);
    }

    const filename = `${training.title.replace(/[^a-z0-9]/gi, '_')}_roster.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(lines.join('\n'));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate roster' });
  }
});

// POST /api/trainings/:id/files - upload files
router.post('/:id/files', requireAuth, requireRole('coordinator'), upload.array('files', 10), async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const inserted = [];
    for (const file of files) {
      const [record] = await db('training_files')
        .insert({
          training_id: req.params.id,
          filename: file.filename,
          original_name: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          uploaded_by: req.user.id,
          file_type: req.body.file_type || 'attachment',
        })
        .returning('*');
      inserted.push(record);
    }

    // Note: the original version of this route had a leftover block
    // here that referenced instructor_ids and result — neither of
    // which exists in this route (that code belongs to the
    // create/update training routes, not file upload). It would have
    // thrown a ReferenceError any time this endpoint was actually hit
    // with files attached. Removed as part of this conversion; the
    // response below now correctly returns the uploaded file records.
    res.status(201).json({ files: inserted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

// GET /api/trainings/:id/files - list files for a training
router.get('/:id/files', requireAuth, async (req, res) => {
  try {
    const files = await db('training_files')
      .where({ training_id: req.params.id })
      .orderBy('created_at', 'asc');
    res.json({ files });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// GET /api/trainings/:id/files/:fileId - download a file
router.get('/:id/files/:fileId', requireAuth, async (req, res) => {
  try {
    const file = await db('training_files')
      .where({ id: req.params.fileId, training_id: req.params.id })
      .first();

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const filePath = path.join(uploadDir, file.filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${file.original_name}"`);
    res.sendFile(filePath);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// DELETE /api/trainings/:id/files/:fileId - delete a file
router.delete('/:id/files/:fileId', requireAuth, requireRole('coordinator'), async (req, res) => {
  try {
    // training_files has no update trigger, so .returning() here is
    // fine — the OUTPUT-vs-trigger restriction only applies to UPDATE
    // statements on tables with a matching trigger, and this is a
    // DELETE against a table with no triggers at all.
    const [deleted] = await db('training_files')
      .where({ id: req.params.fileId, training_id: req.params.id })
      .delete()
      .returning('*');

    if (!deleted) {
      return res.status(404).json({ error: 'File not found' });
    }

    const filePath = path.join(uploadDir, deleted.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// PATCH /api/trainings/:id/close - toggle closed status
router.patch('/:id/close', requireAuth, requireRole('coordinator'), async (req, res) => {
  const { is_closed } = req.body;
  try {
    // Same OUTPUT-vs-trigger restriction as the other trainings updates
    // above — no .returning().
    const affectedRows = await db('trainings').where({ id: req.params.id }).update({ is_closed });
    if (affectedRows === 0) return res.status(404).json({ error: 'Training not found' });

    const training = await db('trainings').where({ id: req.params.id }).first();
    res.json({ training });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update training' });
  }
});

module.exports = router;
