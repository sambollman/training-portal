// Shared helpers for interpreting SQL Server error objects (as thrown by
// the tedious driver through Knex). Centralized here so every route file
// checks these the same way instead of each re-implementing it slightly
// differently.

// SQL Server error numbers for a duplicate-key violation. Postgres uses a
// single error code ('23505') for this regardless of which kind of key
// was violated; SQL Server uses two different numbers instead — 2627 for
// a primary key, 2601 for any other unique constraint/index.
const DUPLICATE_KEY_ERROR_NUMBERS = [2627, 2601];

function isDuplicateKeyError(err) {
  return DUPLICATE_KEY_ERROR_NUMBERS.includes(err && err.number);
}

module.exports = { isDuplicateKeyError };
