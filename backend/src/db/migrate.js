/**
 * Database migration runner.
 *
 * Applies schema.sql and verifies that the required users table
 * actually exists afterward.
 */

const fs = require('fs');
const path = require('path');

async function migrate(pool) {
  if (!pool) {
    throw new Error('Database pool was not provided to migrate()');
  }

  const client = await pool.connect();

  try {
    console.log('→ Starting full database schema synchronization...');

    const schemaPath = path.join(__dirname, 'schema.sql');

    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found: ${schemaPath}`);
    }

    const schema = fs.readFileSync(schemaPath, 'utf8');

    if (!schema.trim()) {
      throw new Error('schema.sql is empty');
    }

    console.log('→ Executing schema.sql...');
    await client.query(schema);

    console.log('✓ schema.sql executed successfully.');

    // Verify that the critical users table exists.
    const result = await client.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'users'
      ) AS users_table_exists;
    `);

    if (!result.rows[0].users_table_exists) {
      throw new Error(
        'Migration reported success, but public.users does not exist.'
      );
    }

    console.log('✓ Verified: public.users exists.');

    // Show how many public tables were created.
    const tableResult = await client.query(`
      SELECT COUNT(*)::int AS table_count
      FROM information_schema.tables
      WHERE table_schema = 'public';
    `);

    console.log(
      `✓ Verified: ${tableResult.rows[0].table_count} public tables exist.`
    );

    console.log('✓ Database schema synchronization completed.');
  } catch (err) {
    console.error('✗ Database migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  migrate,
};
