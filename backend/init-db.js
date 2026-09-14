const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  try {
    console.log('🔄 Syncing database schema...');

    // 1. Ensure table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        google_id VARCHAR(255) UNIQUE,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255),
        role VARCHAR(50) DEFAULT 'USER',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Add missing columns safely if they don't exist yet
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'local';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar VARCHAR(500);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS skin_type VARCHAR(100);
    `);

    console.log('✅ Schema migration complete! All required columns present.');
  } catch (err) {
    console.error('❌ Database migration error:', err.message);
  }
}

initDB();
