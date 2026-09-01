const express = require('express');
const session = require('express-session');
const KnexSessionStore = require('connect-session-knex')(session);
const path = require('path');
const { db } = require('./db/connection');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  store: new KnexSessionStore({
    knex: db,
    tablename: 'user_sessions',
    createtable: true,
  }),
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 8 * 60 * 60 * 1000,
    secure: false,
  }
}));

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
