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
        t.*,
        COUNT(er.id) FILTER (WHERE er.status IN ('approved', 'enrolled')) AS enrolled_count
      FROM trainings t
      LEFT JOIN enrollment_requests er ON t.id = er.training_id
      WHERE t.is_archived = false
      GROUP BY t.id
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
        t.*,
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
    if (req.user.role === 'supervisor' || req.user.role === 'coordinator') {
      const result = await db.query(`
        SELECT er.*, u.full_name, u.badge_number, u.unit
        FROM enrollment_requests er
        JOIN users u ON er.officer_id = u.id
        WHERE er.training_id=$1 AND er.attended = true
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
    title, category, description, instructor,
    location, session_date, start_time,
    duration_hours, seat_capacity, is_required
  } = req.body;

  if (!title || !session_date) {
    return res.status(400).json({ error: 'Title and session date are required' });
  }

  try {
    const result = await db.query(`
      INSERT INTO trainings 
        (title, category, description, instructor, location, 
         session_date, start_time, duration_hours, seat_capacity, 
         is_required, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, [
      title, category, description, instructor,
      location, session_date, start_time,
      duration_hours, seat_capacity,
      is_required || false, req.user.id
    ]);

    res.status(201).json({ training: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create training' });
  }
});

// PUT /api/trainings/:id - update a training (coordinator only)
router.put('/:id', requireAuth, requireRole('coordinator'), async (req, res) => {
  const {
    title, category, description, instructor,
    location, session_date, start_time,
    duration_hours, seat_capacity, is_required
  } = req.body;

  try {
    const result = await db.query(`
      UPDATE trainings SET
        title = $1, category = $2, description = $3,
        instructor = $4, location = $5, session_date = $6,
        start_time = $7, duration_hours = $8, seat_capacity = $9,
        is_required = $10
      WHERE id = $11 AND is_archived = false
      RETURNING *
    `, [
      title, category, description, instructor,
      location, session_date, start_time,
      duration_hours, seat_capacity,
      is_required || false, req.params.id
    ]);

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Training not found' });
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
        u.full_name, u.badge_number, u.rank, u.unit,
        er.request_type, er.status, er.attended
      FROM enrollment_requests er
      JOIN users u ON er.officer_id = u.id
      WHERE er.training_id=$1 AND er.attended = true
      ORDER BY u.full_name ASC
    `, [req.params.id]);

    const t = training.rows[0];
    const lines = [];
    lines.push('Full Name,Badge Number,Rank,Unit,Enrollment Type,Status,Attended');

    for (const row of enrollments.rows) {
      lines.push(
        `"${row.full_name}","${row.badge_number}","${row.rank}","${row.unit}","${row.request_type}","${row.status}","${row.attended === true ? 'Yes' : row.attended === false ? 'No' : 'N/A'}"`
      );
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
        INSERT INTO training_files (training_id, filename, original_name, mimetype, size, uploaded_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [req.params.id, file.filename, file.originalname, file.mimetype, file.size, req.user.id]);
      inserted.push(result.rows[0]);
    }

    res.status(201).json({ files: inserted });
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

module.exports = router;

