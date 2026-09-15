/**
 * Applies schema.sql ONLY -- every CREATE TABLE IF NOT EXISTS and every
 * ALTER TABLE ... ADD COLUMN IF NOT EXISTS in it -- with no reseeding of
 * demo accounts or the ingredient/product catalog. Safe and fast to
 * re-run against an EXISTING, already-populated database whenever the
 * backend code is updated to expect new columns (e.g. after pulling in
 * the Skin Health Scoring Engine's water_intake_liters/sleep_hours/
 * stress_level/concern_severity/manual_skin_assessed columns).
 *
 * This is the fix for errors like:
 *   column "water_intake_liters" of relation "user_skincare_preferences" does not exist
 * That error means the running database predates schema.sql's migration
 * for that column -- the backend code was updated, but the live database
 * was never re-migrated.
 *
 * Non-destructive: never drops a table/column, never truncates/deletes
 * rows. Every statement in schema.sql is idempotent (IF NOT EXISTS), so
 * running this against a fully up-to-date database is a harmless no-op.
 *
 * Exports migrate(client) so server.js can run this automatically on
 * every boot (before the HTTP server starts accepting requests), in
 * addition to it being runnable standalone:
 *
 *   node src/db/migrate.js     (or)   npm run db:migrate
 */
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// client defaults to the shared pool so a plain `migrate()` call (e.g.
// from server.js) "just works" without the caller checking out a client
// itself. Pass an explicit checked-out client (as runCli does below) if
// you want the statements to run on one fixed connection.
async function migrate(client = pool) {
  console.log('-> Applying schema.sql (idempotent -- safe on an existing database)...');
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  await client.query(schema);
  console.log('OK: schema is up to date. No existing data was modified or removed.');
}

// Standalone CLI entry point (npm run db:migrate). Owns its own client
// and closes the pool when done -- NOT used when migrate() is imported
// and awaited from server.js, since that would kill the shared pool the
// running server still needs.
async function runCli() {
  const client = await pool.connect();
  try {
    await migrate(client);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  runCli();
}

module.exports = { migrate };
