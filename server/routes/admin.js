const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth, requireRole('coordinator'));

router.get('/users', async (req, res) => {
  try {
    const { search } = req.query
    let query, params

    if (search) {
      query = `
        SELECT u.*, s.full_name as supervisor_name
        FROM users u
        LEFT JOIN users s ON u.supervisor_id = s.id
        WHERE u.is_active = true
        AND (
          u.first_name ILIKE $1 OR u.last_name ILIKE $1 OR
          u.full_name ILIKE $1 OR u.badge_number ILIKE $1 OR
          u.unit ILIKE $1
        )
        ORDER BY u.last_name ASC, u.first_name ASC
      `
      params = [`%${search}%`]
    } else {
      query = `
        SELECT u.*, s.full_name as supervisor_name
        FROM users u
        LEFT JOIN users s ON u.supervisor_id = s.id
        ORDER BY u.last_name ASC, u.first_name ASC
      `
      params = []
    }

    const result = await db.query(query, params)
    res.json({ users: result.rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch users' })
  }
})

router.post('/users', async (req, res) => {
  const { username, first_name, last_name, email, badge_number, post_license_number, unit, rank, role, supervisor_id } = req.body;

  if (!username || !first_name || !last_name) {
    return res.status(400).json({ error: 'Username, first name, and last name are required' });
  }

  const full_name = `${first_name} ${last_name}`;

  try {
    const result = await db.query(`
      INSERT INTO users (username, first_name, last_name, full_name, email, badge_number, post_license_number, unit, rank, role, supervisor_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      username, first_name, last_name, full_name,
      email || null, badge_number || null, post_license_number || null,
      unit || null, rank || 'Officer', role || 'officer', supervisor_id || null
    ]);

    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Username already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.put('/users/:id', async (req, res) => {
  const { first_name, last_name, email, badge_number, post_license_number, unit, rank, role, supervisor_id, is_active } = req.body;

  const full_name = `${first_name} ${last_name}`;

  try {
    const result = await db.query(`
      UPDATE users SET
        first_name = $1, last_name = $2, full_name = $3,
        email = $4, badge_number = $5, post_license_number = $6,
        unit = $7, rank = $8, role = $9,
        supervisor_id = $10, is_active = $11
      WHERE id = $12
      RETURNING *
    `, [
      first_name, last_name, full_name,
      email || null, badge_number || null, post_license_number || null,
      unit || null, rank, role,
      supervisor_id || null, is_active !== false, req.params.id
    ]);

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

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
