const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { requireAuth, requireRole } = require('../middleware/auth');
const multer = require('multer');
const XLSX = require('xlsx');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Convert Excel serial date to YYYY-MM-DD string
function excelDateToString(serial) {
  if (!serial) return null;
  const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return date.toISOString().split('T')[0];
}

// POST /api/import/training-records
router.post('/training-records', requireAuth, requireRole('coordinator'), upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const results = {
      imported: 0,
      skipped_cancelled: 0,
      skipped_pending: 0,
      skipped_no_match: [],
      skipped_duplicate: 0,
      errors: [],
    };

    for (const row of rows) {
      const employee = row['Employee']?.toString().trim();
      const course = row['Course']?.toString().trim();
      const outcome = row['Outcome']?.toString().trim();
      const startSerial = row['Date Time Starts'];
      const endSerial = row['Date Time Ends'];
      const cost = row['Cost'];
      const extraCosts = row['Extra Costs'];
      const courseHours = row['Course Hours'];
      const certHours = row['Certification Hours'];

      // Skip cancelled
      if (course && course.includes('**CANCELLED')) {
        results.skipped_cancelled++;
        continue;
      }

      // Skip pending
      if (!outcome || outcome === 'Pending') {
        results.skipped_pending++;
        continue;
      }

      // Skip if no employee or course
      if (!employee || !course) {
        results.errors.push(`Missing employee or course in row`);
        continue;
      }

      // Map outcome
      const status = outcome === 'Attended' ? 'Attended' : 'Did Not Attend';

      // Convert dates
      const startDate = excelDateToString(startSerial);
      const endDate = excelDateToString(endSerial);

      // Find matching user by full_name
      const userResult = await db.query(
        `SELECT id FROM users WHERE full_name ILIKE $1 AND is_active = true LIMIT 1`,
        [employee]
      );

      if (userResult.rows.length === 0) {
        results.skipped_no_match.push(employee);
        continue;
      }

      const officerId = userResult.rows[0].id;

      // Check for duplicate (same officer, same course, same start date)
      const dupCheck = await db.query(
        `SELECT id FROM training_records WHERE officer_id = $1 AND training_title ILIKE $2 AND training_date = $3`,
        [officerId, course, startDate]
      );

      if (dupCheck.rows.length > 0) {
        results.skipped_duplicate++;
        continue;
      }

      // Insert record
      await db.query(`
        INSERT INTO training_records (
          officer_id, training_title, training_date, end_date,
          hours, certification_hours, training_cost, travel_cost,
          status, source, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'import',$10)
      `, [
        officerId,
        course,
        startDate,
        endDate,
        courseHours || null,
        certHours || null,
        cost || null,
        extraCosts || null,
        status,
        req.user.id
      ]);

      results.imported++;
    }

    // Deduplicate no_match list
    results.skipped_no_match = [...new Set(results.skipped_no_match)];

    res.json({ success: true, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Import failed: ' + err.message });
  }
});

module.exports = router;
