const express = require('express');
const router = express.Router();
const { db } = require('../db/connection');
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
      const user = await db('users')
        .select('id')
        .whereILike('full_name', employee)
        .where('is_active', true)
        .first();

      if (!user) {
        results.skipped_no_match.push(employee);
        continue;
      }

      const officerId = user.id;

      // Check for duplicate (same officer, same course, same start date)
      const duplicate = await db('training_records')
        .select('id')
        .where({ officer_id: officerId, training_date: startDate })
        .whereILike('training_title', course)
        .first();

      if (duplicate) {
        results.skipped_duplicate++;
        continue;
      }

      // Insert record
      await db('training_records').insert({
        officer_id: officerId,
        training_title: course,
        training_date: startDate,
        end_date: endDate,
        hours: courseHours || null,
        certification_hours: certHours || null,
        cost: cost || null,
        remarks: extraCosts ? `Extra costs: $${extraCosts}` : null,
        status,
        source: 'import',
        created_by: req.user.id,
      });

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
