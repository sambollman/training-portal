const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { requireAuth, requireRole } = require('../middleware/auth');
const multer = require('multer');
const XLSX = require('xlsx');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/users', requireAuth, requireRole('coordinator'), upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const results = {
      imported: 0,
      updated: 0,
      skipped_invalid: 0,
      errors: [],
    };

    for (const row of rows) {
      const nameField = row[0]?.toString().trim();
      const ndgovUsername = row[1]?.toString().trim().toLowerCase();

      if (!nameField || !ndgovUsername) {
        results.skipped_invalid++;
        continue;
      }

      const parts = nameField.split(',');
      if (parts.length < 2) {
        results.skipped_invalid++;
        continue;
      }

      const last_name = parts[0].trim();
      const first_name = parts[1].trim();
      const full_name = `${first_name} ${last_name}`;

      // Check if user already exists by nd.gov username
      const existing = await db.query(
        'SELECT id FROM users WHERE post_license_number = $1',
        [ndgovUsername]
      );

      if (existing.rows.length > 0) {
        await db.query(
          'UPDATE users SET first_name = $1, last_name = $2, full_name = $3 WHERE post_license_number = $4',
          [first_name, last_name, full_name, ndgovUsername]
        );
        results.updated++;
        continue;
      }

      // Also check by full name in case they were manually added
      const existingByName = await db.query(
        'SELECT id FROM users WHERE full_name ILIKE $1',
        [full_name]
      );

      if (existingByName.rows.length > 0) {
        await db.query(
          'UPDATE users SET first_name = $1, last_name = $2, full_name = $3, post_license_number = $4 WHERE id = $5',
          [first_name, last_name, full_name, ndgovUsername, existingByName.rows[0].id]
        );
        results.updated++;
        continue;
      }

      // Insert new user — use nd.gov username as placeholder username until Okta login
      try {
        await db.query(`
          INSERT INTO users (username, first_name, last_name, full_name, post_license_number, role)
          VALUES ($1, $2, $3, $4, $5, 'officer')
        `, [ndgovUsername, first_name, last_name, full_name, ndgovUsername]);

        results.imported++;
      } catch (err) {
        if (err.code === '23505') {
          results.updated++;
        } else {
          results.errors.push(`${full_name}: ${err.message}`);
        }
      }
    }

    res.json({ success: true, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Import failed: ' + err.message });
  }
});

module.exports = router;
