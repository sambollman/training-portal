const express = require('express');
const router = express.Router();
const { db } = require('../db/connection');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /api/specialized - get all specialized trainings (optionally by month)
router.get('/', requireAuth, async (req, res) => {
  try {
    const { year, month } = req.query;

    // Note: '*' here is safe alongside these two Central-time columns,
    // unlike the tr.*-plus-same-named-CONVERT bug fixed elsewhere —
    // these use different alias names (start_datetime_central, not
    // start_datetime), so there's no duplicate-column ambiguity.
    let query = db('specialized_trainings')
      .select(
        '*',
        db.raw("FORMAT(start_datetime AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time', 'yyyy-MM-ddTHH:mm') as start_datetime_central"),
        db.raw("FORMAT(end_datetime AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time', 'yyyy-MM-ddTHH:mm') as end_datetime_central")
      )
      .orderBy('start_datetime', 'asc');

    if (year && month) {
      // Postgres used EXTRACT(...) on the Central-converted timestamp;
      // SQL Server's equivalent is DATEPART on the same AT TIME ZONE
      // conversion used for the display columns above, so "which month
      // this shows as in Central time" stays consistent between the
      // filter and what's actually displayed.
      query = query
        .whereRaw("DATEPART(year, start_datetime AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time') = ?", [parseInt(year)])
        .andWhereRaw("DATEPART(month, start_datetime AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time') = ?", [parseInt(month)]);
    }

    const trainings = await query;
    res.json({ trainings });
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
      const [parent] = await db('specialized_trainings')
        .insert({
          title, unit_type, start_datetime, end_datetime,
          description, location,
          is_recurring: true,
          recurrence_pattern,
          recurrence_end_date,
          created_by: req.user.id,
        })
        .returning('*');

      const occurrences = generateOccurrences(start_datetime, end_datetime, recurrence_pattern, recurrence_end_date);

      for (const occ of occurrences) {
        await db('specialized_trainings').insert({
          title, unit_type,
          start_datetime: occ.start,
          end_datetime: occ.end,
          description, location,
          is_recurring: true,
          recurrence_pattern,
          parent_recurring_id: parent.id,
          created_by: req.user.id,
        });
      }

      res.status(201).json({ training: parent, occurrences_created: occurrences.length });
    } else {
      const [training] = await db('specialized_trainings')
        .insert({
          title, unit_type, start_datetime, end_datetime,
          description, location,
          is_recurring: false,
          created_by: req.user.id,
        })
        .returning('*');

      res.status(201).json({ training });
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
    // specialized_trainings has no update trigger, so .returning() is
    // fine here (unlike users/trainings/enrollment_requests).
    const [training] = await db('specialized_trainings')
      .where({ id: req.params.id })
      .update({ title, unit_type, start_datetime, end_datetime, description, location })
      .returning('*');

    if (!training) return res.status(404).json({ error: 'Training not found' });
    res.json({ training });
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
      const training = await db('specialized_trainings').where({ id: req.params.id }).first();
      const parentId = training?.parent_recurring_id || req.params.id;
      await db('specialized_trainings')
        .where('id', parentId)
        .orWhere('parent_recurring_id', parentId)
        .delete();
    } else {
      await db('specialized_trainings').where({ id: req.params.id }).delete();
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
