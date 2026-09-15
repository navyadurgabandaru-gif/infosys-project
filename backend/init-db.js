/**
 * COMPATIBILITY SHIM -- not the real schema anymore.
 *
 * This file used to define its OWN, separate, out-of-date table schema
 * (no doctor_profiles/consultant_profiles/user_skincare_preferences/
 * product_recommendations, appointments.doctor_id instead of
 * provider_id/provider_role, no skin_reports.reviewed_by, and a
 * reminder_settings.user_id with no UNIQUE constraint -- which is
 * exactly why `ON CONFLICT (user_id)` in notificationService.js was
 * failing). server.js required this file directly on every boot, so
 * that old/incompatible schema is what was actually being applied to
 * the deployed Neon database -- the real, complete schema in
 * src/db/schema.sql was never being run.
 *
 * server.js no longer requires this file (it now awaits
 * src/db/migrate.js's migrate() function before listening, which is
 * the single source of truth for the schema). This shim is kept only
 * so that a deploy target hardcoded to run `node init-db.js` directly
 * (e.g. an old Render Start Command) still ends up doing the correct,
 * safe, idempotent thing instead of recreating the old wrong schema.
 *
 * Safe to delete once you've confirmed nothing invokes this file by
 * name anymore.
 */
const { migrate } = require('./src/db/migrate');
const pool = require('./src/config/db');

(async () => {
  try {
    console.log('→ init-db.js is a compatibility shim; delegating to src/db/migrate.js...');
    await migrate(pool);
  } catch (err) {
    console.error('✗ Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
