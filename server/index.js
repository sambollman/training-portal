const express = require('express');
const session = require('express-session');
const { ConnectSessionKnexStore } = require('connect-session-knex');
const path = require('path');
const { db } = require('./db/connection');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  store: new ConnectSessionKnexStore({
    knex: db,
    tableName: 'user_sessions',
    createTable: true,
    // connect-session-knex defaults to a housekeeping query every 60
    // seconds (deleting expired sessions), forever, for as long as the
    // app is running. On a normal always-on database that's harmless
    // background noise — but on Azure SQL Database's serverless free
    // tier, auto-pause only kicks in after a real period of total
    // inactivity, and a query every 60 seconds never gives it that
    // window. That's the most likely reason the database stayed
    // "awake" (and billing against the free monthly allowance)
    // continuously instead of pausing between actual testing sessions.
    // Once an hour is more than sufficient for a low-traffic app like
    // this, and gives auto-pause a real chance to work as intended.
    cleanupInterval: 60 * 60 * 1000,
  }),
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 8 * 60 * 60 * 1000,
    secure: false,
  }
}));

// In Okta-header mode, every request to this app is expected to
// already carry the trusted username header — the reverse proxy in
// front of the app is responsible for authenticating the user and
// injecting that header before the request ever reaches Node.
//
// Until now, only the /api/* routes individually checked for that
// header (via requireAuth inside each route file) — the compiled React
// app's static files and the SPA catch-all route had no auth check at
// all, since Express served those before any authentication check ever
// ran. That's not a data leak (no real data is served without hitting
// a protected API route), but it does mean an unauthenticated visitor
// could load the app shell itself, which doesn't match how IT expects
// a proxy-authenticated app to behave — normally the proxy would
// redirect an unauthenticated visitor to login before the app is ever
// reached at all.
//
// This is a defense-in-depth backstop for that: if IT's reverse proxy
// is configured correctly, this should never actually trigger in
// practice, since the header will already be present on every request.
// If it's ever missing (misconfigured proxy, or someone reaching the
// app directly, bypassing the proxy), this stops the app shell itself
// from loading rather than silently letting it load and only failing
// later on an API call.
//
// Only active when OKTA_HEADER is set — local/dev mode (empty
// OKTA_HEADER) keeps working exactly as before, since dev-login relies
// on reaching the app without that header present at all.
if (process.env.OKTA_HEADER) {
  app.use((req, res, next) => {
    if (req.path === '/api/health') return next(); // let uptime/health checks through unauthenticated
    const headerName = process.env.OKTA_HEADER.toLowerCase();
    if (!req.headers[headerName]) {
      return res.status(401).send('Access denied: no authenticated user was found for this request. If you believe this is an error, contact IT.');
    }
    next();
  });
}

const authRoutes = require('./routes/auth');
const trainingRoutes = require('./routes/trainings');
const requestRoutes = require('./routes/requests');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const externalRoutes = require('./routes/external');
const transcriptRoutes = require('./routes/transcripts');
const specializedRoutes = require('./routes/specialized');
const approvalRoutes = require('./routes/approvals');
const importRoutes = require('./routes/import');
const userimportRoutes = require('./routes/userimport');
const complianceRoutes = require('./routes/compliance');

app.use('/api/auth', authRoutes);
app.use('/api/trainings', trainingRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/external', externalRoutes);
app.use('/api/transcript', transcriptRoutes);
app.use('/api/specialized', specializedRoutes);
app.use('/api/import', importRoutes);
app.use('/api/import', userimportRoutes);
app.use('/api/compliance', complianceRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

require('./jobs/certExpiry').start();

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/dist/index.html'));
  });
}

// Build/maintain the database schema before accepting any requests. On a
// brand-new SQL Server database this creates every table from scratch; on
// one that's already up to date, it's a no-op (Knex tracks what's already
// been applied in the knex_migrations table). Any future schema change
// just needs a new migration file added to server/migrations/ — no manual
// SQL required on IT's end when this gets redeployed.
async function start() {
  try {
    const [batch, appliedMigrations] = await db.migrate.latest();
    if (appliedMigrations.length === 0) {
      console.log('Database schema already up to date, nothing to migrate.');
    } else {
      console.log(`Ran migration batch ${batch}: ${appliedMigrations.join(', ')}`);
    }
  } catch (err) {
    console.error('Failed to build/update database schema:', err);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log('Server running on port ' + PORT);
    console.log('Okta mode: ' + (process.env.OKTA_HEADER ? 'enabled' : 'disabled'));
  });
}

start();
