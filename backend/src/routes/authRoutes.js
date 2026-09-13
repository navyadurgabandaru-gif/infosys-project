const express = require('express');
const passport = require('../config/passport');
const { protect } = require('../middleware/authMiddleware');
const {
  register,
  login,
  googleCallback,
  getProfile,
  updateProfile,
  changePassword,
} = require('../controllers/authController');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);

// Google OAuth - UPDATED WITH prompt: 'select_account'
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account',
    session: false,
  })
);

router.get(
  '/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: `${process.env.CLIENT_URL}/login?error=google`,
  }),
  googleCallback
);

router.get('/me', protect, getProfile);
router.put('/me', protect, updateProfile);
router.put('/change-password', protect, changePassword);

module.exports = router;