const express = require('express');
const router = express.Router();
const { db } = require('../db/connection');
const { requireAuth, requireRole } = require('../middleware/auth');

// SQL Server error numbers for a duplicate-key violation. Postgres uses a
// single error code ('23505') for this regardless of which kind of key
// was violated; SQL Server uses two different numbers instead — 2627 for
// a primary key, 2601 for any other unique constraint (our username
// column is the latter, but both are checked to be safe).
const DUPLICATE_KEY_ERROR_NUMBERS = [2627, 2601];

function isDuplicateKeyError(err) {
  return DUPLICATE_KEY_ERROR_NUMBERS.includes(err.number);
}

router.get('/users', requireAuth, requireRole('supervisor', 'coordinator'), async (req, res) => {
  try {
    const { search } = req.query;

    let query = db('users as u')
      .leftJoin('users as s', 's.id', 'u.supervisor_id')
      .select('u.*', 's.full_name as supervisor_name')
      .orderBy('u.last_name', 'asc')
      .orderBy('u.first_name', 'asc');

    // Matches the original behavior exactly: a search term filters to
    // active users only, plus a case-insensitive match across several
    // columns. With no search term, every user is returned (including
    // inactive ones) — that's intentional, not an oversight.
    if (search) {
      const term = `%${search}%`;
      query = query.where('u.is_active', true).andWhere((builder) => {
        builder
          .whereILike('u.first_name', term)
          .orWhereILike('u.last_name', term)
          .orWhereILike('u.full_name', term)
          .orWhereILike('u.badge_number', term)
          .orWhereILike('u.unit', term);
      });
    }

    const users = await query;
    res.json({ users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.post('/users', requireAuth, requireRole('coordinator'), async (req, res) => {
  const { username, first_name, last_name, email, badge_number, post_license_number, unit, rank, role, supervisor_id } = req.body;

  if (!username || !first_name || !last_name) {
    return res.status(400).json({ error: 'Username, first name, and last name are required' });
  }

  const full_name = `${first_name} ${last_name}`;

  try {
    const [user] = await db('users')
      .insert({
        username,
        first_name,
        last_name,
        full_name,
        email: email || null,
        badge_number: badge_number || null,
        post_license_number: post_license_number || null,
        unit: unit || null,
        rank: rank || 'Officer',
        role: role || 'officer',
        supervisor_id: supervisor_id || null,
      })
      .returning('*');

    res.status(201).json({ user });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.put('/users/:id', requireAuth, requireRole('coordinator'), async (req, res) => {
  const { first_name, last_name, email, badge_number, post_license_number, unit, rank, role, supervisor_id, is_active } = req.body;

  const full_name = `${first_name} ${last_name}`;

  try {
    // Note: can't use .returning() here — same SQL Server restriction as
    // in middleware/auth.js's upsertUser (OUTPUT isn't allowed on an
    // UPDATE against a table with a matching AFTER UPDATE trigger, and
    // users has one for updated_at). Without .returning(), Knex reports
    // the number of affected rows instead, which doubles as our
    // not-found check, then we fetch the updated row separately.
    const affectedRows = await db('users')
      .where({ id: req.params.id })
      .update({
        first_name,
        last_name,
        full_name,
        email: email || null,
        badge_number: badge_number || null,
        post_license_number: post_license_number || null,
        unit: unit || null,
        rank,
        role,
        supervisor_id: supervisor_id || null,
        is_active: is_active !== false,
      });

    if (affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = await db('users').where({ id: req.params.id }).first();
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.get('/users/:id', requireAuth, requireRole('coordinator'), async (req, res) => {
  try {
    const user = await db('users').where({ id: req.params.id }).first();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

module.exports = router;
