const { db } = require('../db/connection');

const OKTA_HEADER = process.env.OKTA_HEADER || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

function getOktaUser(req) {
  if (OKTA_HEADER) {
    return req.headers[OKTA_HEADER.toLowerCase()] || null;
  }
  return null;
}

// Find-or-create the user record for a given username, and touch
// updated_at if they already exist.
//
// The original Postgres version did this in one statement using
// "INSERT ... ON CONFLICT DO UPDATE". SQL Server doesn't have an
// equivalent Knex can generate automatically, so this does it as two
// explicit steps instead: look the user up, then either update or
// insert. The insert is wrapped in a try/catch to handle the rare case
// where two requests for a brand-new username land at the same instant
// (both see "no existing user" and both try to insert) — the second
// insert will fail on the username's unique constraint, so we fall back
// to re-fetching the row the other request just created.
async function upsertUser(username) {
  const existing = await db('users').where({ username }).first();

  if (existing) {
    const [updated] = await db('users')
      .where({ username })
      .update({ updated_at: db.fn.now() })
      .returning('*');
    return updated;
  }

  try {
    const [inserted] = await db('users')
      .insert({ username })
      .returning('*');
    return inserted;
  } catch (err) {
    // Someone else's request just created this username between our
    // lookup and our insert — fetch the row they created instead of
    // failing the request.
    const user = await db('users').where({ username }).first();
    if (user) return user;
    throw err;
  }
}

async function requireAuth(req, res, next) {
  const oktaUser = getOktaUser(req);

  if (oktaUser) {
    const user = await upsertUser(oktaUser);
    req.user = user;
    return next();
  }

  if (req.session && req.session.userId) {
    const user = await db('users').where({ id: req.session.userId }).first();
    if (user) {
      req.user = user;
      return next();
    }
  }

  return res.status(401).json({ error: 'Unauthorized' });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, getOktaUser, OKTA_HEADER, ADMIN_PASSWORD };
