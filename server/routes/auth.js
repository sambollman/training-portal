const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { requireAuth, OKTA_HEADER, ADMIN_PASSWORD } = require('../middleware/auth');

// Get current logged in user
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Dev login - only available when OKTA_HEADER is not set
if (!OKTA_HEADER && ADMIN_PASSWORD) {
  router.get('/dev-users', async (req, res) => {
    const result = await db.query('SELECT id, username, full_name, role FROM users ORDER BY username');
    res.json({ users: result.rows });
  });

  router.post('/dev-login', async (req, res) => {
    const { password, userId } = req.body;

    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'No user selected' });
    }

    const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }

    req.session.userId = userId;
    res.json({ user: result.rows[0] });
  });

  router.post('/dev-logout', (req, res) => {
    req.session.destroy();
    res.json({ ok: true });
  });
}

// Production logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

module.exports = router;
