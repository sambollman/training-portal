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

    const formatted = await db.query(`
      SELECT tr.*,
        to_char(tr.training_date, 'YYYY-MM-DD') as training_date,
        to_char(tr.end_date, 'YYYY-MM-DD') as end_date,
        to_char(tr.completion_date, 'YYYY-MM-DD') as completion_date,
        to_char(tr.certification_expiration, 'YYYY-MM-DD') as certification_expiration
      FROM training_records tr WHERE tr.id = $1
    `, [req.params.recordId]);
    res.json({ record: formatted.rows[0] });
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

const PDFDocument = require('pdfkit');

// GET /api/transcript/:officerId/pdf - generate PDF transcript
router.get('/:officerId/pdf', requireAuth, async (req, res) => {
  const { officerId } = req.params;

  if (req.user.role === 'officer' && req.user.id !== officerId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const userResult = await db.query('SELECT * FROM users WHERE id = $1', [officerId]);
    if (!userResult.rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }
    const officer = userResult.rows[0];

    const records = await db.query(`
      SELECT tr.*,
        to_char(tr.training_date, 'MM/DD/YYYY') as training_date_fmt,
        to_char(tr.end_date, 'MM/DD/YYYY') as end_date_fmt,
        to_char(tr.completion_date, 'MM/DD/YYYY') as completion_date_fmt,
        to_char(tr.certification_expiration, 'MM/DD/YYYY') as cert_expiration_fmt
      FROM training_records tr
      WHERE tr.officer_id = $1
      ORDER BY tr.training_date DESC NULLS LAST
    `, [officerId]);

    const doc = new PDFDocument({ margin: 50 });
    const filename = `transcript_${officer.last_name}_${officer.first_name}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('Training Transcript', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(14).font('Helvetica').text(`${officer.first_name} ${officer.last_name}`, { align: 'center' });
    if (officer.rank) doc.fontSize(11).text(officer.rank + (officer.unit ? ` — ${officer.unit}` : ''), { align: 'center' });
    if (officer.badge_number) doc.fontSize(11).text(`Badge #${officer.badge_number}`, { align: 'center' });
    doc.moveDown(0.5);

    const totalHours = records.rows.reduce((sum, r) => sum + (parseFloat(r.hours) || 0), 0);
    doc.fontSize(11).text(`Total Training Hours: ${totalHours.toFixed(1)}`, { align: 'center' });
    doc.fontSize(10).fillColor('#888888').text(`Generated: ${new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'long', day: 'numeric', year: 'numeric' })}`, { align: 'center' });
    doc.fillColor('#000000');
    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
    doc.moveDown(0.5);

    if (records.rows.length === 0) {
      doc.fontSize(11).text('No training records found.', { align: 'center' });
    } else {
      for (const r of records.rows) {
        // Training title and badges
        doc.fontSize(12).font('Helvetica-Bold').text(r.training_title);
        doc.font('Helvetica');

        const badges = [];
        if (r.source === 'portal') badges.push('Portal');
        if (r.source === 'external') badges.push('External');
        if (r.source === 'manual') badges.push('Manual Entry');
        if (r.source === 'import') badges.push('Imported');
        if (r.certified) badges.push('Certified');
        if (badges.length > 0) {
          doc.fontSize(9).fillColor('#555555').text(badges.join(' · '));
          doc.fillColor('#000000');
        }

        doc.moveDown(0.3);

        // Details in two columns
        const details = [];
        if (r.training_date_fmt) details.push(['Date', r.training_date_fmt + (r.end_date_fmt ? ` – ${r.end_date_fmt}` : '')]);
        if (r.location) details.push(['Location', r.location]);
        if (r.instructor) details.push(['Instructor', r.instructor]);
        if (r.hours) details.push(['Hours', r.hours.toString()]);
        if (r.status) details.push(['Status', r.status]);
        if (r.score) details.push(['Score', r.score]);
        if (r.cost) details.push(['Cost', `$${parseFloat(r.cost).toFixed(2)}`]);
        if (r.certification_name) details.push(['Certification', r.certification_name]);
        if (r.certification_hours) details.push(['Cert Hours', r.certification_hours.toString()]);
        if (r.cert_expiration_fmt) details.push(['Cert Expires', r.cert_expiration_fmt]);

        const colWidth = 250;
        const left = 50;
        const right = 310;
        let col = 0;
        let startY = doc.y;

        for (const [label, value] of details) {
          const x = col === 0 ? left : right;
          if (col === 0 && details.indexOf([label, value]) > 0) startY = doc.y;
          doc.fontSize(9).fillColor('#666666').text(label.toUpperCase(), x, doc.y, { continued: true, width: 80 });
          doc.fillColor('#000000').text(' ' + value, { width: colWidth - 80 });
          col = col === 0 ? 1 : 0;
          if (col === 0) doc.moveDown(0.1);
        }

        if (r.remarks) {
          doc.moveDown(0.3);
          doc.fontSize(9).fillColor('#555555').text('Remarks: ', { continued: true });
          doc.fillColor('#000000').text(r.remarks);
        }

        doc.moveDown(0.5);
        doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor('#cccccc').stroke();
        doc.strokeColor('#000000');
        doc.moveDown(0.5);

        // Page break check
        if (doc.y > 700) {
          doc.addPage();
        }
      }
    }

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

module.exports = router;
