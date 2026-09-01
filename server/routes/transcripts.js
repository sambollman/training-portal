const express = require('express');
const router = express.Router();
const { db } = require('../db/connection');
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

// Postgres supports "ORDER BY x DESC NULLS LAST" directly. SQL Server
// has no equivalent syntax, so this achieves the same result with a
// CASE expression that sorts NULL dates to the end regardless of the
// DESC direction on the real sort key.
const TRAINING_DATE_DESC_NULLS_LAST = 'CASE WHEN tr.training_date IS NULL THEN 1 ELSE 0 END, tr.training_date DESC';

// Explicit column list for training_records, deliberately excluding
// training_date/end_date/completion_date/certification_expiration —
// those four are always added separately via CONVERT() so they come
// back as plain text instead of native DATE values (see the notes
// further down on why that matters for TIME/DATE columns generally).
//
// This list exists specifically to avoid a subtle bug: selecting
// 'tr.*' alongside a same-named CONVERT(...) as training_date column
// puts two columns named "training_date" in the result set — one the
// native value, one the converted text — and which one actually wins
// in the row object the driver builds back in Node is ambiguous rather
// than a documented, reliable behavior. Listing columns explicitly
// sidesteps that ambiguity entirely rather than depending on it.
const TRAINING_RECORD_COLUMNS = [
  'tr.id', 'tr.officer_id', 'tr.training_title', 'tr.hours', 'tr.status',
  'tr.certified', 'tr.certification_name', 'tr.training_type', 'tr.location',
  'tr.cost', 'tr.instructor', 'tr.certification_hours', 'tr.score', 'tr.remarks',
  'tr.source', 'tr.enrollment_request_id', 'tr.external_request_id',
  'tr.created_by', 'tr.created_at', 'tr.updated_at',
];

// GET /api/transcript/:officerId - get transcript for an officer
router.get('/:officerId', requireAuth, async (req, res) => {
  const { officerId } = req.params;

  // Officers can only see their own transcript
  if (req.user.role === 'officer' && req.user.id !== officerId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const records = await db('training_records as tr')
      .select(
        ...TRAINING_RECORD_COLUMNS,
        db.raw("CONVERT(varchar(10), tr.training_date, 23) as training_date"),
        db.raw("CONVERT(varchar(10), tr.end_date, 23) as end_date"),
        db.raw("CONVERT(varchar(10), tr.completion_date, 23) as completion_date"),
        db.raw("CONVERT(varchar(10), tr.certification_expiration, 23) as certification_expiration")
      )
      .where('tr.officer_id', officerId)
      .orderByRaw(TRAINING_DATE_DESC_NULLS_LAST);

    // Get certificates for each record
    const recordIds = records.map((r) => r.id);
    let certificates = [];
    if (recordIds.length > 0) {
      certificates = await db('training_certificates')
        .whereIn('training_record_id', recordIds)
        .orderBy('created_at', 'asc');
    }

    // Attach certificates to records
    const recordsWithCerts = records.map((r) => ({
      ...r,
      certificates: certificates.filter((c) => c.training_record_id === r.id),
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
    // training_records has no update trigger, so .returning() is fine here.
    const [record] = await db('training_records')
      .where({ id: req.params.recordId })
      .update({
        training_title,
        training_type: training_type || 'internal',
        training_date: training_date || null,
        end_date: end_date || null,
        completion_date: completion_date || null,
        location: location || null,
        instructor: instructor || null,
        hours: hours || null,
        cost: cost || null,
        status: status || 'attended',
        certified: certified || false,
        certification_name: certification_name || null,
        certification_expiration: certification_expiration || null,
        certification_hours: certification_hours || null,
        score: score || null,
        remarks: remarks || null,
      })
      .returning('*');

    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }

    // Re-select with the same date formatting used elsewhere, so the
    // response shape matches what the frontend expects (plain text
    // dates rather than whatever the driver's native type would be).
    const formatted = await db('training_records as tr')
      .select(
        ...TRAINING_RECORD_COLUMNS,
        db.raw("CONVERT(varchar(10), tr.training_date, 23) as training_date"),
        db.raw("CONVERT(varchar(10), tr.end_date, 23) as end_date"),
        db.raw("CONVERT(varchar(10), tr.completion_date, 23) as completion_date"),
        db.raw("CONVERT(varchar(10), tr.certification_expiration, 23) as certification_expiration")
      )
      .where('tr.id', req.params.recordId)
      .first();

    res.json({ record: formatted });
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
    const [record] = await db('training_records')
      .insert({
        officer_id: req.params.officerId,
        training_title,
        training_type: training_type || 'internal',
        training_date: training_date || null,
        end_date: end_date || null,
        completion_date: completion_date || null,
        location: location || null,
        instructor: instructor || null,
        hours: hours || null,
        cost: cost || null,
        status: status || 'attended',
        certified: certified || false,
        certification_name: certification_name || null,
        certification_expiration: certification_expiration || null,
        certification_hours: certification_hours || null,
        score: score || null,
        remarks: remarks || null,
        source: 'manual',
        created_by: req.user.id,
      })
      .returning('*');

    res.status(201).json({ record });
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
      const [record] = await db('training_certificates')
        .insert({
          training_record_id: req.params.recordId,
          filename: file.filename,
          original_name: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          uploaded_by: req.user.id,
        })
        .returning('*');
      inserted.push(record);
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
    const cert = await db('training_certificates')
      .where({ id: req.params.certId, training_record_id: req.params.recordId })
      .first();

    if (!cert) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

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
    const [deleted] = await db('training_certificates')
      .where({ id: req.params.certId, training_record_id: req.params.recordId })
      .delete()
      .returning('*');

    if (!deleted) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    const filePath = path.join(uploadDir, deleted.filename);
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
    const officer = await db('users').where({ id: officerId }).first();
    if (!officer) {
      return res.status(404).json({ error: 'User not found' });
    }

    const records = await db('training_records as tr')
      .select(
        'tr.*',
        db.raw("CONVERT(varchar(10), tr.training_date, 101) as training_date_fmt"),
        db.raw("CONVERT(varchar(10), tr.end_date, 101) as end_date_fmt"),
        db.raw("CONVERT(varchar(10), tr.completion_date, 101) as completion_date_fmt"),
        db.raw("CONVERT(varchar(10), tr.certification_expiration, 101) as cert_expiration_fmt")
      )
      .where('tr.officer_id', officerId)
      .orderByRaw(TRAINING_DATE_DESC_NULLS_LAST);

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

    const totalHours = records.reduce((sum, r) => sum + (parseFloat(r.hours) || 0), 0);
    doc.fontSize(11).text(`Total Training Hours: ${totalHours.toFixed(1)}`, { align: 'center' });
    doc.fontSize(10).fillColor('#888888').text(`Generated: ${new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'long', day: 'numeric', year: 'numeric' })}`, { align: 'center' });
    doc.fillColor('#000000');
    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
    doc.moveDown(0.5);

    if (records.length === 0) {
      doc.fontSize(11).text('No training records found.', { align: 'center' });
    } else {
      for (const r of records) {
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
