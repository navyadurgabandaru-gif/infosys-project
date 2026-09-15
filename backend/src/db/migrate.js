/**
 * Database migration runner.
 *
 * Applies the complete schema.sql file safely and idempotently.
 * This file exports migrate() so it can be called by:
 *
 *   - init-db.js
 *   - server.js
 *
 * It does NOT automatically execute when required.
 * The caller is responsible for closing the database pool.
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

    await client.query(schema);

    console.log('✓ All database tables successfully initialized.');
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
