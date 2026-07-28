const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { requireAuth, requireRole } = require('../middleware/auth');
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
// GET /api/trainings - list all active trainings
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        t.id, t.title, t.category, t.description, t.instructor, t.location,
        to_char(t.session_date, 'YYYY-MM-DD') as session_date,
        to_char(t.end_date, 'YYYY-MM-DD') as end_date,
        t.start_time, t.end_time, t.duration_hours, t.seat_capacity,
        t.no_seat_limit, t.cost, t.training_type, t.is_required,
        t.is_out_of_state, t.is_archived, t.is_closed, t.section_number, t.compliance_tag, t.instructor_id, t.created_by, t.created_at, t.updated_at,
        (SELECT json_agg(json_build_object('id', u.id, 'first_name', u.first_name, 'last_name', u.last_name, 'full_name', u.full_name))
         FROM training_instructors ti JOIN users u ON ti.user_id = u.id
         WHERE ti.training_id = t.id) as instructors,
        COUNT(er.id) FILTER (WHERE er.status IN ('approved', 'enrolled')) AS enrolled_count
      FROM trainings t
      LEFT JOIN enrollment_requests er ON t.id = er.training_id
      WHERE t.is_archived = false AND (t.session_date >= CURRENT_DATE OR t.session_date IS NULL)
      GROUP BY t.id
      ORDER BY t.session_date ASC
    `);
    res.json({ trainings: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch trainings' });
  }
});

// GET /api/trainings/all - all trainings including past (coordinator only)
router.get('/all', requireAuth, requireRole('coordinator', 'instructor'), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        t.id, t.title, t.category, t.description, t.instructor, t.location,
        to_char(t.session_date, 'YYYY-MM-DD') as session_date,
        to_char(t.end_date, 'YYYY-MM-DD') as end_date,
        t.start_time, t.end_time, t.duration_hours, t.seat_capacity,
        t.no_seat_limit, t.cost, t.training_type, t.is_required,
        t.is_out_of_state, t.is_archived, t.is_closed, t.section_number, t.compliance_tag, t.instructor_id, t.created_by, t.created_at, t.updated_at,
        (SELECT json_agg(json_build_object('id', u.id, 'first_name', u.first_name, 'last_name', u.last_name, 'full_name', u.full_name))
         FROM training_instructors ti JOIN users u ON ti.user_id = u.id
         WHERE ti.training_id = t.id) as instructors,
        COUNT(er.id) FILTER (WHERE er.status IN ('approved', 'enrolled')) AS enrolled_count
      FROM trainings t
      LEFT JOIN enrollment_requests er ON t.id = er.training_id
      WHERE t.is_archived = false
      GROUP BY t.id
      ORDER BY t.session_date DESC
    `);
    res.json({ trainings: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch trainings' });
  }
});

// GET /api/trainings/calendar - all trainings for calendar view (any authenticated user)
router.get('/calendar', requireAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        t.id, t.title, t.training_type, t.is_required,
        to_char(t.session_date, 'YYYY-MM-DD') as session_date,
        to_char(t.end_date, 'YYYY-MM-DD') as end_date,
        t.is_archived, t.is_closed
      FROM trainings t
      WHERE t.is_archived = false
      ORDER BY t.session_date ASC
    `);
    res.json({ trainings: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch trainings' });
  }
});

// GET /api/trainings/:id - single training detail
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const training = await db.query(`
      SELECT 
        t.id, t.title, t.category, t.description, t.instructor, t.location,
        to_char(t.session_date, 'YYYY-MM-DD') as session_date,
        to_char(t.end_date, 'YYYY-MM-DD') as end_date,
        t.start_time, t.end_time, t.duration_hours, t.seat_capacity,
        t.no_seat_limit, t.cost, t.training_type, t.is_required,
        t.is_out_of_state, t.is_archived, t.is_closed, t.section_number, t.compliance_tag, t.instructor_id,
        t.created_by, t.created_at, t.updated_at,
        (SELECT json_agg(json_build_object('id', u.id, 'first_name', u.first_name, 'last_name', u.last_name, 'full_name', u.full_name))
         FROM training_instructors ti JOIN users u ON ti.user_id = u.id
         WHERE ti.training_id = t.id) as instructors,
        COUNT(er.id) FILTER (WHERE er.status IN ('approved', 'enrolled')) AS enrolled_count
      FROM trainings t
      LEFT JOIN enrollment_requests er ON t.id = er.training_id
      WHERE t.id = $1
      GROUP BY t.id
    `, [req.params.id]);

    if (!training.rows[0]) {
      return res.status(404).json({ error: 'Training not found' });
    }

    // Supervisors and coordinators can see who is enrolled
    let enrollments = [];
    if (req.user.role === 'supervisor' || req.user.role === 'coordinator' || req.user.role === 'instructor') {
      const result = await db.query(`
        SELECT er.*, u.full_name, u.badge_number, u.unit
        FROM enrollment_requests er
        JOIN users u ON er.officer_id = u.id
        WHERE er.training_id=$1
        ORDER BY u.full_name ASC
      `, [req.params.id]);
      enrollments = result.rows;
    }

    res.json({ training: training.rows[0], enrollments });
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
    const result = await db.query(`
      INSERT INTO trainings 
        (title, category, description, instructor, instructor_id, location, 
         session_date, start_time, duration_hours, seat_capacity, 
         is_required, is_out_of_state, training_type, section_number, compliance_tag, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *
    `, [
      title, category, description, instructor || null, instructor_id || null,
      location, session_date, start_time,
      duration_hours, seat_capacity,
      is_required || false, is_out_of_state || false, training_type || 'internal', section_number || null, compliance_tag || null, req.user.id
    ]);

    // Save instructors
    if (instructor_ids && instructor_ids.length > 0) {
      for (const userId of instructor_ids) {
        await db.query(
          'INSERT INTO training_instructors (training_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [result.rows[0].id, userId]
        );
      }
    }
    res.status(201).json({ training: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create training' });
  }
});

// PUT /api/trainings/:id - update a training (coordinator only)
router.put('/:id', requireAuth, requireRole('coordinator'), async (req, res) => {
  const { title, category, description, instructor, instructor_id, instructor_ids, location, session_date, end_date, start_time, end_time, duration_hours, seat_capacity, no_seat_limit, cost, training_type, is_required, is_out_of_state, section_number, compliance_tag } = req.body;
    try {
      const result = await db.query(`
      UPDATE trainings SET
        title=$1, category=$2, description=$3, instructor=$4, instructor_id=$5, location=$6,
        session_date=$7, end_date=$8, start_time=$9, end_time=$10,
        duration_hours=$11, seat_capacity=$12, no_seat_limit=$13,
        cost=$14, training_type=$15, is_out_of_state=$16, is_required=$17,
        section_number=$18, compliance_tag=$19
      WHERE id=$20 AND is_archived=false
    RETURNING *
  `, [
    title, category, description, instructor, instructor_id || null, location,
    session_date || null, end_date || null, start_time || null, end_time || null,
    duration_hours || null, seat_capacity || null, no_seat_limit || false,
    cost || null, training_type, is_out_of_state || false, is_required || false,
    section_number || null, compliance_tag || null, req.params.id
  ]);
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Training not found' });
    }

    // Update instructors
    await db.query('DELETE FROM training_instructors WHERE training_id = $1', [req.params.id]);
    if (instructor_ids && instructor_ids.length > 0) {
      for (const userId of instructor_ids) {
        await db.query(
          'INSERT INTO training_instructors (training_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [req.params.id, userId]
        );
      }
    }

    res.json({ training: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update training' });
  }
});

// DELETE /api/trainings/:id - archive a training (coordinator only)
router.delete('/:id', requireAuth, requireRole('coordinator'), async (req, res) => {
  try {
    const result = await db.query(`
      UPDATE trainings SET is_archived = true
      WHERE id = $1
      RETURNING *
    `, [req.params.id]);

    if (!result.rows[0]) {
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
    const training = await db.query('SELECT * FROM trainings WHERE id = $1', [req.params.id]);
    if (!training.rows[0]) {
      return res.status(404).json({ error: 'Training not found' });
    }

    const enrollments = await db.query(`
      SELECT 
        u.post_license_number,
        er.attended
      FROM enrollment_requests er
      JOIN users u ON er.officer_id = u.id
      WHERE er.training_id = $1 AND er.attended = true
      ORDER BY u.last_name ASC, u.first_name ASC
    `, [req.params.id]);

    const t = training.rows[0];
    const startDate = t.session_date ? new Date(t.session_date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : '';
    const endDate = t.end_date ? new Date(t.end_date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : startDate;

    const lines = [];
    lines.push('Username,Section,Status,StartDate,EndDate,ExitDate,Grade,Assignments,AssignmentsCompleted,cf_GunQual');

    for (const row of enrollments.rows) {
      lines.push(`"${row.post_license_number || ''}","${t.section_number || t.title}","COMPLETED","${startDate}","${endDate}","${endDate}","100","","",""`);
    }

    const filename = `${t.title.replace(/[^a-z0-9]/gi, '_')}_roster.csv`;
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
      const result = await db.query(`
        INSERT INTO training_files (training_id, filename, original_name, mimetype, size, uploaded_by, file_type)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [req.params.id, file.filename, file.originalname, file.mimetype, file.size, req.user.id, req.body.file_type || 'attachment']);
      inserted.push(result.rows[0]);
    }

    // Save instructors
    if (instructor_ids && instructor_ids.length > 0) {
      for (const userId of instructor_ids) {
        await db.query(
          'INSERT INTO training_instructors (training_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [result.rows[0].id, userId]
        );
      }
    }

res.status(201).json({ training: result.rows[0] });

    
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

// GET /api/trainings/:id/files - list files for a training
router.get('/:id/files', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM training_files WHERE training_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json({ files: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// GET /api/trainings/:id/files/:fileId - download a file
router.get('/:id/files/:fileId', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM training_files WHERE id = $1 AND training_id = $2',
      [req.params.fileId, req.params.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = result.rows[0];
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
    const result = await db.query(
      'DELETE FROM training_files WHERE id = $1 AND training_id = $2 RETURNING *',
      [req.params.fileId, req.params.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'File not found' });
    }

    const filePath = path.join(uploadDir, result.rows[0].filename);
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
    const result = await db.query(
      'UPDATE trainings SET is_closed = $1 WHERE id = $2 RETURNING *',
      [is_closed, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Training not found' });
    res.json({ training: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update training' });
  }
});

module.exports = router;

