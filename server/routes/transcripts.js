const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { requireAuth, requireRole } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = '/app/uploads/certificates';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// GET /api/transcript/:officerId - get transcript for an officer
router.get('/:officerId', requireAuth, async (req, res) => {
  const { officerId } = req.params;

  // Officers can only see their own transcript
  if (req.user.role === 'officer' && req.user.id !== officerId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const records = await db.query(`
      SELECT tr.*,
        to_char(tr.training_date, 'YYYY-MM-DD') as training_date,
        to_char(tr.end_date, 'YYYY-MM-DD') as end_date,
        to_char(tr.completion_date, 'YYYY-MM-DD') as completion_date,
        to_char(tr.certification_expiration, 'YYYY-MM-DD') as certification_expiration
      FROM training_records tr
      WHERE tr.officer_id = $1
      ORDER BY tr.training_date DESC NULLS LAST
    `, [officerId]);

    // Get certificates for each record
    const recordIds = records.rows.map(r => r.id);
    let certificates = [];
    if (recordIds.length > 0) {
      const certResult = await db.query(`
        SELECT * FROM training_certificates
        WHERE training_record_id = ANY($1)
        ORDER BY created_at ASC
      `, [recordIds]);
      certificates = certResult.rows;
    }

    // Attach certificates to records
    const recordsWithCerts = records.rows.map(r => ({
      ...r,
      certificates: certificates.filter(c => c.training_record_id === r.id)
    }));

    res.json({ records: recordsWithCerts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch transcript' });
  }
});

// PUT /api/transcript/record/:recordId - update a training record
router.put('/record/:recordId', requireAuth, requireRole('supervisor', 'coordinator'), async (req, res) => {
  const {
    training_title, training_type, training_date, end_date, completion_date,
    location, instructor, hours, cost,
    status, certified, certification_name, certification_expiration,
    certification_hours, score, remarks
  } = req.body;

  try {
    const result = await db.query(`
      UPDATE training_records SET
        training_title = $1, training_type = $2, training_date = $3,
        end_date = $4, completion_date = $5, location = $6,
        instructor = $7, hours = $8, cost = $9, status = $10,
        certified = $11, certification_name = $12,
        certification_expiration = $13, certification_hours = $14,
        score = $15, remarks = $16
      WHERE id = $17
      RETURNING *
    `, [
      training_title, training_type || 'internal',
      training_date || null, end_date || null, completion_date || null,
      location || null, instructor || null, hours || null, cost || null,
      status || 'attended', certified || false, certification_name || null,
      certification_expiration || null, certification_hours || null,
      score || null, remarks || null, req.params.recordId
    ]);

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Record not found' });
    }

    res.json({ record: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update record' });
  }
});

// POST /api/transcript/:officerId/record - manually add a training record
router.post('/:officerId/record', requireAuth, requireRole('supervisor', 'coordinator'), async (req, res) => {
  const {
    training_title, training_type, training_date, end_date, completion_date,
    location, instructor, hours, cost,
    status, certified, certification_name, certification_expiration,
    certification_hours, score, remarks
  } = req.body;

  if (!training_title) {
    return res.status(400).json({ error: 'Training title is required' });
  }

  try {
    const result = await db.query(`
      INSERT INTO training_records (
        officer_id, training_title, training_type, training_date, end_date,
        completion_date, location, instructor, hours, cost, status,
        certified, certification_name, certification_expiration,
        certification_hours, score, remarks, source, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'manual',$18)
      RETURNING *
    `, [
      req.params.officerId, training_title, training_type || 'internal',
      training_date || null, end_date || null, completion_date || null,
      location || null, instructor || null, hours || null, cost || null,
      status || 'attended', certified || false, certification_name || null,
      certification_expiration || null, certification_hours || null,
      score || null, remarks || null, req.user.id
    ]);

    res.status(201).json({ record: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create record' });
  }
});

// POST /api/transcript/record/:recordId/certificates - upload certificates
router.post('/record/:recordId/certificates', requireAuth, upload.array('certificates', 10), async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const inserted = [];
    for (const file of files) {
      const result = await db.query(`
        INSERT INTO training_certificates (training_record_id, filename, original_name, mimetype, size, uploaded_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [req.params.recordId, file.filename, file.originalname, file.mimetype, file.size, req.user.id]);
      inserted.push(result.rows[0]);
    }

    res.status(201).json({ certificates: inserted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to upload certificates' });
  }
});

// GET /api/transcript/record/:recordId/certificates/:certId - download certificate
router.get('/record/:recordId/certificates/:certId', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM training_certificates WHERE id = $1 AND training_record_id = $2',
      [req.params.certId, req.params.recordId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    const cert = result.rows[0];
    const filePath = path.join(uploadDir, cert.filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${cert.original_name}"`);
    res.sendFile(filePath);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to download certificate' });
  }
});

// DELETE /api/transcript/record/:recordId/certificates/:certId - delete certificate
router.delete('/record/:recordId/certificates/:certId', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM training_certificates WHERE id = $1 AND training_record_id = $2 RETURNING *',
      [req.params.certId, req.params.recordId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    const filePath = path.join(uploadDir, result.rows[0].filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete certificate' });
  }
});

module.exports = router;
