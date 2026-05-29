const db = require('../db/connection');

const OKTA_HEADER = process.env.OKTA_HEADER || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

function getOktaUser(req) {
  if (OKTA_HEADER) {
    return req.headers[OKTA_HEADER.toLowerCase()] || null;
  }
  return null;
}

async function upsertUser(username) {
  const result = await db.query(
    `INSERT INTO users (username)
     VALUES ($1)
     ON CONFLICT (username) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [username]
  );
  return result.rows[0];
}

async function requireAuth(req, res, next) {
  const oktaUser = getOktaUser(req);

  if (oktaUser) {
    const user = await upsertUser(oktaUser);
    req.user = user;
    return next();
  }

  if (req.session && req.session.userId) {
    const result = await db.query('SELECT * FROM users WHERE id = $1', [req.session.userId]);
    if (result.rows[0]) {
      req.user = result.rows[0];
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
