require('dotenv').config();
require('./init-db');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const pool = require('./src/config/db');
const passport = require('./src/config/passport');
const { notFound, errorHandler } = require('./src/middleware/errorHandler');

const authRoutes = require('./src/routes/authRoutes');
const userRoutes = require('./src/routes/userRoutes');
const reportRoutes = require('./src/routes/reportRoutes');
const skincarePlanRoutes = require('./src/routes/skincarePlanRoutes');
const preferencesRoutes = require('./src/routes/preferencesRoutes');
const appointmentRoutes = require('./src/routes/appointmentRoutes');
const doctorRoutes = require('./src/routes/doctorRoutes');
const consultantRoutes = require('./src/routes/consultantRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const ingredientRoutes = require('./src/routes/ingredientRoutes');
const productRoutes = require('./src/routes/productRoutes');
const notificationRoutes = require('./src/routes/notificationRoutes');

const app = express();

// ---------- Dynamic CORS Configuration ----------
const allowedOrigins = [
  'https://infosys-project-snowy.vercel.app',
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:3000'
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    
    return callback(null, true); // Fallback to grant access if subdomains vary
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Express Core Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use(passport.initialize());

// Serve uploaded skin images
app.use('/uploads', express.static(path.join(__dirname, process.env.UPLOAD_DIR || 'uploads')));

// ---------- API routes ----------
app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'ai-skin-intelligence-api' }));

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/skincare-plan', skincarePlanRoutes);
app.use('/api/preferences', preferencesRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/consultant', consultantRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ingredients', ingredientRoutes);
app.use('/api/products', productRoutes);
app.use('/api/notifications', notificationRoutes);

// ---------- Error handling ----------
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await pool.query('SELECT 1');
    console.log('✓ Connected to PostgreSQL.');
  } catch (err) {
    console.error('✗ Could not connect to PostgreSQL:', err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`AI Skincare Planner API running on port ${PORT}`);
  });
}

start();
