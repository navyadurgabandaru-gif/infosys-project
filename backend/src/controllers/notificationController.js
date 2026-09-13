const pool = require('../config/db');
const { generateDueReminders, getOrCreateReminderSettings } = require('../services/notificationService');

const ALLOWED_HYDRATION_FREQ = ['daily', 'twice_daily'];

// GET /api/notifications
// Generates any newly-due reminders first (see notificationService), then
// returns the user's notification list plus their unread count.
async function listNotifications(req, res, next) {
  try {
    await generateDueReminders(req.user.id);

    const { rows } = await pool.query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [req.user.id]
    );
    const unreadCount = rows.filter((n) => !n.is_read).length;

    res.json({ notifications: rows, unread_count: unreadCount });
  } catch (err) {
    next(err);
  }
}

// PUT /api/notifications/:id/read
async function markAsRead(req, res, next) {
  try {
    const { rows } = await pool.query(
      `UPDATE notifications SET is_read = TRUE, status = 'READ'
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Notification not found.' });
    res.json({ notification: rows[0] });
  } catch (err) {
    next(err);
  }
}

// PUT /api/notifications/read-all
async function markAllAsRead(req, res, next) {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = TRUE, status = 'READ' WHERE user_id = $1 AND is_read = FALSE`,
      [req.user.id]
    );
    res.json({ message: 'All notifications marked as read.' });
  } catch (err) {
    next(err);
  }
}

// GET /api/notifications/settings
async function getReminderSettingsHandler(req, res, next) {
  try {
    const settings = await getOrCreateReminderSettings(req.user.id);
    res.json({ settings });
  } catch (err) {
    next(err);
  }
}

// PUT /api/notifications/settings
async function updateReminderSettings(req, res, next) {
  try {
    const {
      morning_routine_enabled, morning_routine_time,
      evening_routine_enabled, evening_routine_time,
      hydration_enabled, hydration_time, hydration_frequency,
      sleep_enabled, sleep_time,
      replenishment_enabled, replenishment_frequency_days,
      progress_alerts_enabled,
    } = req.body || {};

    if (hydration_frequency && !ALLOWED_HYDRATION_FREQ.includes(hydration_frequency)) {
      return res.status(400).json({ message: `hydration_frequency must be one of: ${ALLOWED_HYDRATION_FREQ.join(', ')}` });
    }
    if (replenishment_frequency_days !== undefined) {
      const n = Number(replenishment_frequency_days);
      if (!Number.isFinite(n) || n < 1 || n > 365) {
        return res.status(400).json({ message: 'replenishment_frequency_days must be between 1 and 365.' });
      }
    }

    await getOrCreateReminderSettings(req.user.id); // ensure row exists

    // node-postgres rejects `undefined` params outright, so every
    // optional field is normalized to `null` (meaning "leave unchanged"
    // via COALESCE) when the caller didn't send it.
    const nz = (v) => (v === undefined ? null : v);

    const { rows } = await pool.query(
      `UPDATE reminder_settings SET
         morning_routine_enabled = COALESCE($1, morning_routine_enabled),
         morning_routine_time = COALESCE($2, morning_routine_time),
         evening_routine_enabled = COALESCE($3, evening_routine_enabled),
         evening_routine_time = COALESCE($4, evening_routine_time),
         hydration_enabled = COALESCE($5, hydration_enabled),
         hydration_time = COALESCE($6, hydration_time),
         hydration_frequency = COALESCE($7, hydration_frequency),
         sleep_enabled = COALESCE($8, sleep_enabled),
         sleep_time = COALESCE($9, sleep_time),
         replenishment_enabled = COALESCE($10, replenishment_enabled),
         replenishment_frequency_days = COALESCE($11, replenishment_frequency_days),
         progress_alerts_enabled = COALESCE($12, progress_alerts_enabled),
         updated_at = NOW()
       WHERE user_id = $13
       RETURNING *`,
      [
        nz(morning_routine_enabled), nz(morning_routine_time),
        nz(evening_routine_enabled), nz(evening_routine_time),
        nz(hydration_enabled), nz(hydration_time), nz(hydration_frequency),
        nz(sleep_enabled), nz(sleep_time),
        nz(replenishment_enabled),
        replenishment_frequency_days !== undefined ? Number(replenishment_frequency_days) : null,
        nz(progress_alerts_enabled),
        req.user.id,
      ]
    );

    res.json({ message: 'Reminder settings saved.', settings: rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listNotifications,
  markAsRead,
  markAllAsRead,
  getReminderSettingsHandler,
  updateReminderSettings,
};
