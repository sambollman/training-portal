// approval_steps.is_additional was referenced by the application (both
// read in GET /my-pending and written when an additional approver is
// looped into a chain) but was never actually part of schema.sql — the
// live Postgres database had it added manually at some point, outside
// of the tracked schema file, so this migration only surfaced as a
// missing-column error once this exact code path was exercised against
// the fresh SQL Server database. Adding it here brings the schema in
// line with what the application has always actually needed.
exports.up = async function (knex) {
  await knex.schema.alterTable('approval_steps', (table) => {
    table.boolean('is_additional').defaultTo(false);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('approval_steps', (table) => {
    table.dropColumn('is_additional');
  });
};
