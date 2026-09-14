const pool = require('./src/config/db');

async function initDB() {
  try {
    // 1. Ensure users table has all required columns
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255),
        full_name VARCHAR(255),
        role VARCHAR(50) DEFAULT 'USER',
        google_id VARCHAR(255),
        avatar_url TEXT,
        phone VARCHAR(50),
        provider VARCHAR(50) DEFAULT 'local',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Create skin_reports table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS skin_reports (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        skin_type VARCHAR(50),
        concerns TEXT[],
        metrics JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Create skincare_plans table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS skincare_plans (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        routine_type VARCHAR(50),
        products JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✓ All database tables successfully initialized.');
  } catch (err) {
    console.error('✗ Error initializing database schema:', err.message);
  }
}

initDB();
