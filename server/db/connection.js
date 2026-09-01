// Database connection, now backed by Microsoft SQL Server via Knex.
//
// Knex gives us a query builder that translates to the right SQL dialect
// (SQL Server here, previously Postgres), so the route files can be
// converted incrementally without hand-writing T-SQL everywhere.
//
// All connection details come from environment variables — see
// server/env.example for the full list. Nothing here should ever contain
// a hardcoded server name, username, or password.
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
