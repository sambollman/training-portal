const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /api/specialized - get all specialized trainings (optionally by month)
router.get('/', requireAuth, async (req, res) => {
  try {
    const { year, month } = req.query;
    let query, params;

    if (year && month) {
        query = `
            SELECT *,
            to_char(start_datetime AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD"T"HH24:MI') as start_datetime_central,
            to_char(end_datetime AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD"T"HH24:MI') as end_datetime_central
            FROM specialized_trainings
            WHERE EXTRACT(YEAR FROM start_datetime AT TIME ZONE 'America/Chicago') = $1
            AND EXTRACT(MONTH FROM start_datetime AT TIME ZONE 'America/Chicago') = $2
            ORDER BY start_datetime ASC
        `;
        params = [parseInt(year), parseInt(month)];
        } else {
        query = `
            SELECT *,
            to_char(start_datetime AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD"T"HH24:MI') as start_datetime_central,
            to_char(end_datetime AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD"T"HH24:MI') as end_datetime_central
            FROM specialized_trainings ORDER BY start_datetime ASC
        `;
        params = [];
    }

    const result = await db.query(query, params);
    res.json({ trainings: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch specialized trainings' });
  }
});

// POST /api/specialized - create a specialized training
router.post('/', requireAuth, requireRole('coordinator'), async (req, res) => {
  const {
    title, unit_type, start_datetime, end_datetime,
    description, location, is_recurring, recurrence_pattern, recurrence_end_date
  } = req.body;

  if (!title || !start_datetime) {
    return res.status(400).json({ error: 'Title and start date are required' });
  }

  try {
    if (is_recurring && recurrence_pattern && recurrence_end_date) {
      // Create parent record
      const parent = await db.query(`
        INSERT INTO specialized_trainings (
          title, unit_type, start_datetime, end_datetime,
          description, location, is_recurring, recurrence_pattern,
          recurrence_end_date, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING *
      `, [
        title, unit_type, start_datetime, end_datetime,
        description, location, true, recurrence_pattern,
        recurrence_end_date, req.user.id
      ]);

      const parentId = parent.rows[0].id;
      const occurrences = generateOccurrences(start_datetime, end_datetime, recurrence_pattern, recurrence_end_date);

      for (const occ of occurrences) {
        await db.query(`
          INSERT INTO specialized_trainings (
            title, unit_type, start_datetime, end_datetime,
            description, location, is_recurring, recurrence_pattern,
            parent_recurring_id, created_by
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        `, [
          title, unit_type, occ.start, occ.end,
          description, location, true, recurrence_pattern,
          parentId, req.user.id
        ]);
      }

      res.status(201).json({ training: parent.rows[0], occurrences_created: occurrences.length });
    } else {
      const result = await db.query(`
        INSERT INTO specialized_trainings (
          title, unit_type, start_datetime, end_datetime,
          description, location, is_recurring, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING *
      `, [
        title, unit_type, start_datetime, end_datetime,
        description, location, false, req.user.id
      ]);

      res.status(201).json({ training: result.rows[0] });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create specialized training' });
  }
});

// PUT /api/specialized/:id - update a specialized training
router.put('/:id', requireAuth, requireRole('coordinator'), async (req, res) => {
  const { title, unit_type, start_datetime, end_datetime, description, location } = req.body;

  try {
    const result = await db.query(`
      UPDATE specialized_trainings SET
        title=$1, unit_type=$2, start_datetime=$3, end_datetime=$4,
        description=$5, location=$6
      WHERE id=$7
      RETURNING *
    `, [title, unit_type, start_datetime, end_datetime, description, location, req.params.id]);

    if (!result.rows[0]) return res.status(404).json({ error: 'Training not found' });
    res.json({ training: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update training' });
  }
});

// DELETE /api/specialized/:id - delete a specialized training
router.delete('/:id', requireAuth, requireRole('coordinator'), async (req, res) => {
  const { delete_all_recurring } = req.query;

  try {
    if (delete_all_recurring === 'true') {
      const training = await db.query('SELECT * FROM specialized_trainings WHERE id=$1', [req.params.id]);
      const parentId = training.rows[0]?.parent_recurring_id || req.params.id;
      await db.query('DELETE FROM specialized_trainings WHERE id=$1 OR parent_recurring_id=$1', [parentId]);
    } else {
      await db.query('DELETE FROM specialized_trainings WHERE id=$1', [req.params.id]);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete training' });
  }
});

function generateOccurrences(startDatetime, endDatetime, pattern, endDate) {
  const occurrences = [];
  const start = new Date(startDatetime);
  const end = endDatetime ? new Date(endDatetime) : null;
  const duration = end ? end - start : 0;
  const recurrenceEnd = new Date(endDate);
  const current = new Date(start);

  // Skip the first occurrence (already created as parent)
  advanceDate(current, pattern);

  while (current <= recurrenceEnd) {
    const occStart = new Date(current);
    const occEnd = duration ? new Date(current.getTime() + duration) : null;
    occurrences.push({ start: occStart.toISOString(), end: occEnd ? occEnd.toISOString() : null });
    advanceDate(current, pattern);
    if (occurrences.length > 500) break; // safety limit
  }

  return occurrences;
}

function advanceDate(date, pattern) {
  switch (pattern) {
    case 'daily': date.setDate(date.getDate() + 1); break;
    case 'weekly': date.setDate(date.getDate() + 7); break;
    case 'biweekly': date.setDate(date.getDate() + 14); break;
    case 'monthly': date.setMonth(date.getMonth() + 1); break;
    default: date.setDate(date.getDate() + 7);
  }
}

module.exports = router;