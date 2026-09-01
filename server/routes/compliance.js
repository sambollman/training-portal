const express = require('express');
const router = express.Router();
const { db } = require('../db/connection');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /api/compliance?tag=Annual Firearms Qual 2026
router.get('/', requireAuth, requireRole('supervisor', 'coordinator'), async (req, res) => {
  const { tag } = req.query;

  if (!tag) {
    return res.status(400).json({ error: 'Compliance tag is required' });
  }

  try {
    // Get all trainings with this tag. enrolled_count is a correlated
    // subquery rather than a LEFT JOIN + GROUP BY, for the same reason
    // as trainings.js's TRAINING_COLUMNS: SQL Server requires every
    // selected non-aggregate column to appear in GROUP BY, unlike
    // Postgres's looser "grouped by primary key implies the rest" rule
    // — a correlated subquery sidesteps that entirely.
    const trainings = await db('trainings as t')
      .select(
        't.id', 't.title',
        db.raw("CONVERT(varchar(10), t.session_date, 23) as session_date"),
        't.seat_capacity',
        db.raw("(SELECT COUNT(*) FROM enrollment_requests er2 WHERE er2.training_id = t.id AND er2.status IN ('approved', 'enrolled')) as enrolled_count")
      )
      .whereILike('t.compliance_tag', tag)
      .where('t.is_archived', false)
      .orderBy('session_date', 'asc');

    const trainingIds = trainings.map((t) => t.id);

    if (trainingIds.length === 0) {
      return res.json({ tag, trainings: [], signed_up: [], attended: [], not_signed_up: [] });
    }

    // Get all active users
    const users = await db('users')
      .select('id', 'first_name', 'last_name', 'full_name', 'badge_number', 'rank', 'unit', 'role')
      .where('is_active', true)
      .orderBy('last_name', 'asc')
      .orderBy('first_name', 'asc');

    // Get all enrollments for these trainings
    const enrollments = await db('enrollment_requests as er')
      .join('trainings as t', 'er.training_id', 't.id')
      .select(
        'er.officer_id', 'er.training_id', 'er.status', 'er.attended',
        't.title as training_title',
        db.raw("CONVERT(varchar(10), t.session_date, 23) as session_date")
      )
      .whereIn('er.training_id', trainingIds);

    // Categorize users
    const signedUp = [];
    const attended = [];
    const notSignedUp = [];

    for (const user of users) {
      const userEnrollments = enrollments.filter((e) => e.officer_id === user.id);

      if (userEnrollments.length === 0) {
        notSignedUp.push(user);
      } else {
        const hasAttended = userEnrollments.some((e) => e.attended === true);
        if (hasAttended) {
          const attendedEnrollment = userEnrollments.find((e) => e.attended === true);
          attended.push({ ...user, training_title: attendedEnrollment.training_title, session_date: attendedEnrollment.session_date });
        } else {
          const latestEnrollment = userEnrollments[0];
          signedUp.push({ ...user, training_title: latestEnrollment.training_title, session_date: latestEnrollment.session_date, status: latestEnrollment.status });
        }
      }
    }

    res.json({
      tag,
      trainings,
      signed_up: signedUp,
      attended,
      not_signed_up: notSignedUp,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch compliance data' });
  }
});

// GET /api/compliance/tags - get all unique compliance tags
router.get('/tags', requireAuth, requireRole('supervisor', 'coordinator'), async (req, res) => {
  try {
    const rows = await db('trainings')
      .distinct('compliance_tag')
      .whereNotNull('compliance_tag')
      .whereNot('compliance_tag', '')
      .orderBy('compliance_tag', 'asc');
    res.json({ tags: rows.map((r) => r.compliance_tag) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

module.exports = router;
