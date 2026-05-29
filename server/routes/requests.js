const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /api/requests - officer sees their own requests
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT er.*, t.title, t.session_date, t.location, t.category
      FROM enrollment_requests er
      JOIN trainings t ON er.training_id = t.id
      WHERE er.officer_id = $1
      ORDER BY t.session_date ASC
    `, [req.user.id]);
    res.json({ requests: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// GET /api/requests/pending - supervisor sees pending requests for their unit
router.get('/pending', requireAuth, requireRole('supervisor', 'coordinator'), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT er.*, t.title, t.session_date, t.location, t.category,
             u.full_name, u.badge_number, u.unit
      FROM enrollment_requests er
      JOIN trainings t ON er.training_id = t.id
      JOIN users u ON er.officer_id = u.id
      WHERE er.status = 'pending'
      AND er.supervisor_id = $1
      ORDER BY er.created_at ASC
    `, [req.user.id]);
    res.json({ requests: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch pending requests' });
  }
});

// GET /api/requests/all - supervisor sees full history for their unit
router.get('/all', requireAuth, requireRole('supervisor', 'coordinator'), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT er.*, t.title, t.session_date, t.location, t.category,
             u.full_name, u.badge_number, u.unit
      FROM enrollment_requests er
      JOIN trainings t ON er.training_id = t.id
      JOIN users u ON er.officer_id = u.id
      WHERE er.supervisor_id = $1
      ORDER BY er.created_at DESC
    `, [req.user.id]);
    res.json({ requests: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// POST /api/requests - officer submits a self-request
router.post('/', requireAuth, async (req, res) => {
  const { training_id } = req.body;

  if (!training_id) {
    return res.status(400).json({ error: 'training_id is required' });
  }

  try {
    // Check training exists and has seats
    const training = await db.query(`
      SELECT t.*, COUNT(er.id) FILTER (WHERE er.status IN ('approved', 'enrolled')) AS enrolled_count
      FROM trainings t
      LEFT JOIN enrollment_requests er ON t.id = er.training_id
      WHERE t.id = $1 AND t.is_archived = false
      GROUP BY t.id
    `, [training_id]);

    if (!training.rows[0]) {
      return res.status(404).json({ error: 'Training not found' });
    }

    if (parseInt(training.rows[0].enrolled_count) >= training.rows[0].seat_capacity) {
      return res.status(400).json({ error: 'Training is full' });
    }

    // Get officer's supervisor
    const officer = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const supervisor_id = officer.rows[0].supervisor_id;

    const result = await db.query(`
      INSERT INTO enrollment_requests (training_id, officer_id, supervisor_id, request_type, status)
      VALUES ($1, $2, $3, 'self_requested', 'pending')
      RETURNING *
    `, [training_id, req.user.id, supervisor_id]);

    res.status(201).json({ request: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'You are already enrolled in this training' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to submit request' });
  }
});

// POST /api/requests/enroll - supervisor directly enrolls an officer
router.post('/enroll', requireAuth, requireRole('supervisor', 'coordinator'), async (req, res) => {
  const { training_id, officer_id } = req.body;

  if (!training_id || !officer_id) {
    return res.status(400).json({ error: 'training_id and officer_id are required' });
  }

  try {
    const training = await db.query(`
      SELECT t.*, COUNT(er.id) FILTER (WHERE er.status IN ('approved', 'enrolled')) AS enrolled_count
      FROM trainings t
      LEFT JOIN enrollment_requests er ON t.id = er.training_id
      WHERE t.id = $1 AND t.is_archived = false
      GROUP BY t.id
    `, [training_id]);

    if (!training.rows[0]) {
      return res.status(404).json({ error: 'Training not found' });
    }

    if (parseInt(training.rows[0].enrolled_count) >= training.rows[0].seat_capacity) {
      return res.status(400).json({ error: 'Training is full' });
    }

    const result = await db.query(`
      INSERT INTO enrollment_requests (training_id, officer_id, supervisor_id, request_type, status)
      VALUES ($1, $2, $3, 'supervisor_enrolled', 'approved')
      RETURNING *
    `, [training_id, officer_id, req.user.id]);

    res.status(201).json({ request: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Officer is already enrolled in this training' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to enroll officer' });
  }
});

// PATCH /api/requests/:id/approve
router.patch('/:id/approve', requireAuth, requireRole('supervisor', 'coordinator'), async (req, res) => {
  try {
    const result = await db.query(`
      UPDATE enrollment_requests
      SET status = 'approved', acted_on_at = NOW(), acted_on_by = $1
      WHERE id = $2 AND status = 'pending'
      RETURNING *
    `, [req.user.id, req.params.id]);

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Request not found or already acted on' });
    }

    res.json({ request: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to approve request' });
  }
});

// PATCH /api/requests/:id/deny
router.patch('/:id/deny', requireAuth, requireRole('supervisor', 'coordinator'), async (req, res) => {
  const { denial_note } = req.body;

  try {
    const result = await db.query(`
      UPDATE enrollment_requests
      SET status = 'denied', denial_note = $1, acted_on_at = NOW(), acted_on_by = $2
      WHERE id = $3 AND status = 'pending'
      RETURNING *
    `, [denial_note || null, req.user.id, req.params.id]);

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Request not found or already acted on' });
    }

    res.json({ request: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to deny request' });
  }
});

// PATCH /api/requests/:id/attendance
router.patch('/:id/attendance', requireAuth, requireRole('supervisor', 'coordinator'), async (req, res) => {
  const { attended } = req.body;

  if (typeof attended !== 'boolean') {
    return res.status(400).json({ error: 'attended must be true or false' });
  }

  try {
    const result = await db.query(`
      UPDATE enrollment_requests SET attended = $1 WHERE id = $2 RETURNING *
    `, [attended, req.params.id]);

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Request not found' });
    }

    res.json({ request: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update attendance' });
  }
});

// DELETE /api/requests/:id - officer withdraws their own pending request
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const result = await db.query(`
      DELETE FROM enrollment_requests
      WHERE id = $1 AND officer_id = $2 AND status = 'pending'
      RETURNING *
    `, [req.params.id, req.user.id]);

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Request not found or cannot be withdrawn' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to withdraw request' });
  }
});

module.exports = router;
