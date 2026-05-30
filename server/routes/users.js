const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /api/users/my-unit - get officers under this supervisor
router.get('/my-unit', requireAuth, requireRole('supervisor', 'coordinator'), async (req, res) => {
  try {
    let result;
    if (req.user.role === 'coordinator') {
      // Coordinators can see all officers
      result = await db.query(`
        SELECT id, full_name, badge_number, unit, rank, role
        FROM users
        WHERE role = 'officer' AND is_active = true
        ORDER BY full_name ASC
      `);
    } else {
      // Supervisors see only their direct reports
      result = await db.query(`
        SELECT id, full_name, badge_number, unit, rank, role
        FROM users
        WHERE supervisor_id = $1 AND is_active = true
        ORDER BY full_name ASC
      `, [req.user.id]);
    }
    res.json({ users: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch unit' });
  }
});

module.exports = router;
