const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { requireAuth, requireRole } = require('../middleware/auth');

// All admin routes require coordinator role
router.use(requireAuth, requireRole('coordinator'));

// GET /api/admin/users - list all users
router.get('/users', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT u.*, s.full_name as supervisor_name
      FROM users u
      LEFT JOIN users s ON u.supervisor_id = s.id
      ORDER BY u.full_name ASC
    `);
    res.json({ users: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST /api/admin/users - create a new user
router.post('/users', async (req, res) => {
  const { username, full_name, email, badge_number, post_license_number, unit, rank, role, supervisor_id } = req.body;

  if (!username || !full_name) {
    return res.status(400).json({ error: 'Username and full name are required' });
  }

  try {
    const result = await db.query(`
      INSERT INTO users (username, full_name, email, badge_number, post_license_number, unit, rank, role, supervisor_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [username, full_name, email || null, badge_number || null, post_license_number || null, unit || null, rank || 'Officer', role || 'officer', supervisor_id || null]);
    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Username already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PUT /api/admin/users/:id - update a user
router.put('/users/:id', async (req, res) => {
  const { full_name, email, badge_number, post_license_number, unit, rank, role, supervisor_id, is_active } = req.body;

  try {
    const result = await db.query(`
      UPDATE users SET
        full_name = $1, email = $2, badge_number = $3,
        post_license_number = $4, unit = $5, rank = $6,
        role = $7, supervisor_id = $8, is_active = $9
      WHERE id = $10
      RETURNING *
    `, [full_name, email, badge_number, post_license_number, unit, rank, role, supervisor_id || null, is_active !== false, req.params.id]);

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// GET /api/admin/users/:id - get single user
router.get('/users/:id', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

module.exports = router;
