const express = require('express');
const router = express.Router();
const { db } = require('../db/connection');
const { requireAuth, OKTA_HEADER, ADMIN_PASSWORD } = require('../middleware/auth');

// Get current logged in user
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Dev login - only available when OKTA_HEADER is not set
if (!OKTA_HEADER && ADMIN_PASSWORD) {
  router.get('/dev-users', async (req, res) => {
    const users = await db('users')
      .select('id', 'username', 'full_name', 'role')
      .orderBy('username');
    res.json({ users });
  });

  router.post('/dev-login', async (req, res) => {
    const { password, userId } = req.body;

    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'No user selected' });
    }

    const user = await db('users').where({ id: userId }).first();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    req.session.userId = userId;
    res.json({ user });
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
