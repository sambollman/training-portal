// Database connection, now backed by Microsoft SQL Server via Knex.
//
// Knex gives us a query builder that translates to the right SQL dialect
// (SQL Server here, previously Postgres), so the route files can be
// converted incrementally without hand-writing T-SQL everywhere.
//
// All connection details come from environment variables — see
// server/env.example for the full list. Nothing here should ever contain
// a hardcoded server name, username, or password.
//
// IMPORTANT — a SQL Server-specific gotcha that affects several route
// files: `users`, `trainings`, and `enrollment_requests` each have an
// AFTER UPDATE trigger (see the initial schema migration) that keeps
// updated_at current. SQL Server does not allow an UPDATE statement to
// use an OUTPUT clause (which is what Knex's .returning() compiles to)
// against a table that has a matching trigger, unless the output is
// routed into a separate table variable — Knex doesn't support that
// automatically. Trying to chain .returning() onto an .update() for
// these three tables will fail with error number 334 ("cannot have any
// enabled triggers if the statement contains an OUTPUT clause without
// INTO clause").
//
// The pattern used throughout this codebase to work around it: run the
// .update() without .returning() (Knex reports the number of affected
// rows instead, which is also a handy not-found check), then do a
// separate .where(...).first() to fetch the row afterward. This
// restriction is UPDATE-specific — .returning() on an INSERT into these
// same tables is fine, since the triggers are AFTER UPDATE only.
const knex = require('knex');

const db = knex({
  client: 'mssql',
  connection: {
    server: process.env.DB_SERVER,
    port: parseInt(process.env.DB_PORT || '1433', 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
      // Azure SQL Database requires encrypted connections — this must stay
      // true for the Azure dev database and for the City's production
      // SQL Server if it also enforces encryption (ask IT to confirm).
      encrypt: process.env.DB_ENCRYPT !== 'false',
      // Only needed for local/on-prem SQL Server instances using a
      // self-signed certificate. Leave false for Azure SQL Database.
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERT === 'true',
    },
  },
  pool: {
    min: 0,
    max: 10,
  },
  migrations: {
    directory: __dirname + '/../migrations',
    tableName: 'knex_migrations',
  },
});

module.exports = { db };
