const express = require('express');
const router = express.Router();
const { db } = require('../db/connection');
const { requireAuth, requireRole } = require('../middleware/auth');
const { isDuplicateKeyError } = require('../db/errors');
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
      // Note: no .returning() needed on these updates — users has the
      // same AFTER UPDATE trigger as elsewhere, but since we're not
      // asking for the updated row back (just a plain UPDATE), there's
      // no OUTPUT clause involved and nothing for the trigger to
      // conflict with.
      const existing = await db('users').select('id').where({ post_license_number: ndgovUsername }).first();

      if (existing) {
        await db('users')
          .where({ post_license_number: ndgovUsername })
          .update({ first_name, last_name, full_name });
        results.updated++;
        continue;
      }

      // Also check by full name in case they were manually added
      const existingByName = await db('users').select('id').whereILike('full_name', full_name).first();

      if (existingByName) {
        await db('users')
          .where({ id: existingByName.id })
          .update({ first_name, last_name, full_name, post_license_number: ndgovUsername });
        results.updated++;
        continue;
      }

      // Insert new user — use nd.gov username as placeholder username until Okta login
      try {
        await db('users').insert({
          username: ndgovUsername,
          first_name,
          last_name,
          full_name,
          post_license_number: ndgovUsername,
          role: 'officer',
        });

        results.imported++;
      } catch (err) {
        if (isDuplicateKeyError(err)) {
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
