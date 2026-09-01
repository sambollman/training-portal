const express = require('express');
const router = express.Router();
const { db } = require('../db/connection');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /api/users/my-unit - get officers under this supervisor
router.get('/my-unit', requireAuth, requireRole('supervisor', 'coordinator'), async (req, res) => {
  try {
    const baseQuery = db('users')
      .select('id', 'full_name', 'badge_number', 'unit', 'rank', 'role')
      .orderBy('full_name', 'asc');

    const users = req.user.role === 'coordinator'
      // Coordinators can see all officers
      ? await baseQuery.where({ role: 'officer', is_active: true })
      // Supervisors see only their direct reports
      : await baseQuery.where({ supervisor_id: req.user.id, is_active: true });

    res.json({ users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch unit' });
  }
});

module.exports = router;
