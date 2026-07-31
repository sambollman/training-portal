const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /api/compliance?tag=Annual Firearms Qual 2026
router.get('/', requireAuth, requireRole('supervisor', 'coordinator'), async (req, res) => {
  const { tag } = req.query;

  if (!tag) {
    return res.status(400).json({ error: 'Compliance tag is required' });
  }

  try {
    // Get all trainings with this tag
    const trainingsResult = await db.query(`
      SELECT id, title, to_char(session_date, 'YYYY-MM-DD') as session_date, seat_capacity, enrolled_count
      FROM (
        SELECT t.*,
          COUNT(er.id) FILTER (WHERE er.status IN ('approved', 'enrolled')) AS enrolled_count
        FROM trainings t
        LEFT JOIN enrollment_requests er ON t.id = er.training_id
        WHERE t.compliance_tag ILIKE $1 AND t.is_archived = false
        GROUP BY t.id
      ) sub
      ORDER BY session_date ASC
    `, [tag]);

    const trainings = trainingsResult.rows;
    const trainingIds = trainings.map(t => t.id);

    if (trainingIds.length === 0) {
      return res.json({ tag, trainings: [], signed_up: [], attended: [], not_signed_up: [] });
    }

    // Get all active users
    const usersResult = await db.query(`
      SELECT id, first_name, last_name, full_name, badge_number, rank, unit, role
      FROM users
      WHERE is_active = true
      ORDER BY last_name ASC, first_name ASC
    `);

    // Get all enrollments for these trainings
    const enrollmentsResult = await db.query(`
      SELECT er.officer_id, er.training_id, er.status, er.attended,
        t.title as training_title,
        to_char(t.session_date, 'YYYY-MM-DD') as session_date
      FROM enrollment_requests er
      JOIN trainings t ON er.training_id = t.id
      WHERE er.training_id = ANY($1)
    `, [trainingIds]);

    const enrollments = enrollmentsResult.rows;

    // Categorize users
    const signedUp = []
    const attended = []
    const notSignedUp = []

    for (const user of usersResult.rows) {
      const userEnrollments = enrollments.filter(e => e.officer_id === user.id)

      if (userEnrollments.length === 0) {
        notSignedUp.push(user)
      } else {
        const hasAttended = userEnrollments.some(e => e.attended === true)
        if (hasAttended) {
          const attendedEnrollment = userEnrollments.find(e => e.attended === true)
          attended.push({ ...user, training_title: attendedEnrollment.training_title, session_date: attendedEnrollment.session_date })
        } else {
          const latestEnrollment = userEnrollments[0]
          signedUp.push({ ...user, training_title: latestEnrollment.training_title, session_date: latestEnrollment.session_date, status: latestEnrollment.status })
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
    const result = await db.query(`
      SELECT DISTINCT compliance_tag
      FROM trainings
      WHERE compliance_tag IS NOT NULL AND compliance_tag != ''
      ORDER BY compliance_tag ASC
    `);
    res.json({ tags: result.rows.map(r => r.compliance_tag) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

module.exports = router;
