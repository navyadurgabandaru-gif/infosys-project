const pool = require('./src/config/db');

async function initDB() {
  try {
    console.log('Starting full database schema synchronization...');

    // 1. Users Table
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

    // 2. Skin Reports Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS skin_reports (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        skin_type VARCHAR(50),
        concerns TEXT[],
        metrics JSONB,
        summary TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Skincare Plans Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS skincare_plans (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        routine_type VARCHAR(50),
        products JSONB,
        recommendations TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. Skin Progress Logs Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS skin_progress_logs (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        log_date DATE DEFAULT CURRENT_DATE,
        notes TEXT,
        image_url TEXT,
        metrics JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 5. Products Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        brand VARCHAR(255),
        category VARCHAR(100),
        suitable_skin_types TEXT[],
        key_ingredients TEXT[],
        conflicting_ingredients TEXT[],
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 6. Ingredients Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ingredients (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        benefits TEXT[],
        conflicts TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 7. Appointments Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        doctor_id INT REFERENCES users(id) ON DELETE SET NULL,
        appointment_date TIMESTAMP NOT NULL,
        status VARCHAR(50) DEFAULT 'PENDING',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 8. Notifications Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Safe column additions for existing installations
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'local';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
    `);

    console.log('✓ All 8 database tables and schema modifications applied successfully.');
  } catch (err) {
    console.error('✗ Schema synchronization failed:', err.message);
  }
}

initDB();
