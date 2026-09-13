const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  listNotifications,
  markAsRead,
  markAllAsRead,
  getReminderSettingsHandler,
  updateReminderSettings,
} = require('../controllers/notificationController');

const router = express.Router();

// NOTE: static paths ('/settings') must be declared before the '/:id/read'
// param route so 'settings' is never captured as an :id.
router.get('/settings', protect, getReminderSettingsHandler);
router.put('/settings', protect, updateReminderSettings);

router.get('/', protect, listNotifications);
router.put('/read-all', protect, markAllAsRead);
router.put('/:id/read', protect, markAsRead);

module.exports = router;
