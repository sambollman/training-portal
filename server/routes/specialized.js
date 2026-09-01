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

// --- Timezone-safe date helpers ---
//
// The original day-offset patterns (daily/weekly/biweekly/monthly) did
// their arithmetic directly on UTC instants (e.g., "add exactly 7 * 24
// hours"). That's subtly wrong across a daylight-saving transition: a
// recurring "2:00 PM Central every Monday" event would silently drift
// to 1:00 PM or 3:00 PM Central the week the clocks change, since a
// fixed UTC duration doesn't track a fixed *wall-clock* time. This was
// a pre-existing issue, not something introduced by this conversion —
// worth fixing now since the new nth-weekday patterns below need
// proper Central-time-aware date math anyway, so all patterns can share
// the same correct machinery instead of half using the old buggy one.

// Break a UTC instant into its Central-time calendar/clock components.
function getCentralParts(date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23', weekday: 'short',
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: parseInt(parts.year), month: parseInt(parts.month), day: parseInt(parts.day),
    hour: parseInt(parts.hour), minute: parseInt(parts.minute), second: parseInt(parts.second),
    weekday: weekdayMap[parts.weekday],
  };
}

// Given Central-time wall-clock components, find the UTC instant they
// actually represent. Iterative correction handles the fact that the
// UTC offset itself depends on whether the target date falls in
// Central Standard or Daylight time.
function centralPartsToUtc(year, month, day, hour, minute) {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  for (let i = 0; i < 3; i++) {
    const parts = getCentralParts(guess);
    const guessedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const wantedAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
    const diff = wantedAsUtc - guessedAsUtc;
    if (diff === 0) break;
    guess = new Date(guess.getTime() + diff);
  }
  return guess;
}

// Pure calendar-date arithmetic (no timezone involved) for the simple
// day-offset patterns — steps a {year, month, day} forward by the
// pattern's interval. Combined with centralPartsToUtc() afterward
// (using the original occurrence's Central hour/minute) to get a
// correctly DST-adjusted instant for each occurrence.
function advanceCalendarDate({ year, month, day }, pattern) {
  const d = new Date(Date.UTC(year, month - 1, day));
  switch (pattern) {
    case 'daily': d.setUTCDate(d.getUTCDate() + 1); break;
    case 'weekly': d.setUTCDate(d.getUTCDate() + 7); break;
    case 'biweekly': d.setUTCDate(d.getUTCDate() + 14); break;
    case 'monthly': d.setUTCMonth(d.getUTCMonth() + 1); break;
    default: d.setUTCDate(d.getUTCDate() + 7);
  }
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

// All the calendar days in a given month (Central-time calendar, not
// UTC) that fall on a specific weekday (0=Sun..6=Sat), in order.
function weekdaysInMonth(year, month, targetWeekday) {
  const days = [];
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let day = 1; day <= daysInMonth; day++) {
    if (new Date(Date.UTC(year, month - 1, day)).getUTCDay() === targetWeekday) days.push(day);
  }
  return days;
}

function generateOccurrences(startDatetime, endDatetime, pattern, endDate) {
  const start = new Date(startDatetime);
  const end = endDatetime ? new Date(endDatetime) : null;
  const duration = end ? end - start : 0;
  const recurrenceEnd = new Date(endDate);
  const startParts = getCentralParts(start);
  const occurrences = [];

  if (pattern === 'first_third' || pattern === 'second_fourth') {
    // "1st & 3rd [weekday]" or "2nd & 4th [weekday]" of every month,
    // where [weekday] is whatever day of the week the start date falls
    // on in Central time.
    const positions = pattern === 'second_fourth' ? [1, 3] : [0, 2]; // 0-indexed
    const recurrenceEndParts = getCentralParts(recurrenceEnd);
    let { year, month } = startParts;

    while (year < recurrenceEndParts.year || (year === recurrenceEndParts.year && month <= recurrenceEndParts.month)) {
      const days = weekdaysInMonth(year, month, startParts.weekday);
      for (const idx of positions) {
        if (idx >= days.length) continue;
        const occStart = centralPartsToUtc(year, month, days[idx], startParts.hour, startParts.minute);
        if (occStart <= start || occStart > recurrenceEnd) continue;
        const occEnd = duration ? new Date(occStart.getTime() + duration) : null;
        occurrences.push({ start: occStart.toISOString(), end: occEnd ? occEnd.toISOString() : null });
      }
      month++;
      if (month > 12) { month = 1; year++; }
      if (occurrences.length > 500) break; // safety limit
    }
    return occurrences;
  }

  // Simple day-offset patterns (daily/weekly/biweekly/monthly)
  let currentCalendarDate = { year: startParts.year, month: startParts.month, day: startParts.day };

  // Skip the first occurrence (already created as parent)
  currentCalendarDate = advanceCalendarDate(currentCalendarDate, pattern);

  while (true) {
    const occStart = centralPartsToUtc(currentCalendarDate.year, currentCalendarDate.month, currentCalendarDate.day, startParts.hour, startParts.minute);
    if (occStart > recurrenceEnd) break;
    const occEnd = duration ? new Date(occStart.getTime() + duration) : null;
    occurrences.push({ start: occStart.toISOString(), end: occEnd ? occEnd.toISOString() : null });
    currentCalendarDate = advanceCalendarDate(currentCalendarDate, pattern);
    if (occurrences.length > 500) break; // safety limit
  }

  return occurrences;
}

module.exports = router;
