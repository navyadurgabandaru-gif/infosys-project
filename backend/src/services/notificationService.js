const pool = require('../config/db');

const DEFAULTS = {
  morning_routine_enabled: true,
  morning_routine_time: '08:00',
  evening_routine_enabled: true,
  evening_routine_time: '21:00',
  hydration_enabled: true,
  hydration_time: '13:00',
  hydration_frequency: 'daily',
  sleep_enabled: true,
  sleep_time: '22:30',
  replenishment_enabled: true,
  replenishment_frequency_days: 30,
  progress_alerts_enabled: true,
};

// Returns the user's reminder_settings row, creating a default one on
// first access so every user has one without a separate onboarding step.
async function getOrCreateReminderSettings(userId) {
  const { rows } = await pool.query('SELECT * FROM reminder_settings WHERE user_id = $1', [userId]);
  if (rows[0]) return rows[0];

  const { rows: created } = await pool.query(
    `INSERT INTO reminder_settings (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING *`,
    [userId]
  );
  return created[0];
}

async function createNotification({ userId, type, title, message, scheduledTime = null }) {
  const { rows } = await pool.query(
    `INSERT INTO notifications (user_id, type, title, message, scheduled_time)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, type, title, message, scheduledTime]
  );
  return rows[0];
}

// Has a notification of this type already been created today (local
// server-day)? Used to make sure a lazily-generated reminder fires at
// most once per day, no matter how many times the frontend polls.
async function alreadyNotifiedToday(userId, type) {
  const { rows } = await pool.query(
    `SELECT 1 FROM notifications
     WHERE user_id = $1 AND type = $2 AND created_at::date = CURRENT_DATE
     LIMIT 1`,
    [userId, type]
  );
  return rows.length > 0;
}

function timeStringToMinutes(t) {
  if (!t) return null;
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + (m || 0);
}

const REMINDER_COPY = {
  MORNING_ROUTINE: { title: '🌞 Morning routine reminder', message: "Time to complete your morning skincare routine — check it off as you go." },
  EVENING_ROUTINE: { title: '🌙 Evening routine reminder', message: "Don't forget your evening skincare routine before bed." },
  HYDRATION: { title: '💧 Hydration reminder', message: 'Remember to stay hydrated — drink some water.' },
  SLEEP: { title: '😴 Sleep reminder', message: "Wind down soon — good sleep supports your skin's recovery." },
};

// Lazy, on-access reminder generation: called whenever the user opens
// their notifications. For each enabled time-based reminder whose
// preferred time has passed today and that hasn't already fired today,
// creates one real notification row. This never claims something
// happened that didn't — it only fires once the scheduled time has
// genuinely passed for the reminder types the user has enabled.
async function generateDueReminders(userId) {
  const settings = await getOrCreateReminderSettings(userId);
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const checks = [
    ['MORNING_ROUTINE', settings.morning_routine_enabled, settings.morning_routine_time],
    ['EVENING_ROUTINE', settings.evening_routine_enabled, settings.evening_routine_time],
    ['HYDRATION', settings.hydration_enabled, settings.hydration_time],
    ['SLEEP', settings.sleep_enabled, settings.sleep_time],
  ];

  for (const [type, enabled, timeStr] of checks) {
    if (!enabled) continue;
    const dueMinutes = timeStringToMinutes(timeStr);
    if (dueMinutes == null || nowMinutes < dueMinutes) continue;
    if (await alreadyNotifiedToday(userId, type)) continue;
    const copy = REMINDER_COPY[type];
    await createNotification({ userId, type, title: copy.title, message: copy.message });
  }

  // Product replenishment: general "check your supply" nudge every
  // replenishment_frequency_days, based on when the last one was sent
  // (or account creation, for the very first cycle). We don't track
  // per-product inventory, so the message stays honest about that.
  if (settings.replenishment_enabled) {
    const { rows } = await pool.query(
      `SELECT created_at FROM notifications
       WHERE user_id = $1 AND type = 'PRODUCT_REPLENISHMENT'
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    const lastSent = rows[0]?.created_at ? new Date(rows[0].created_at) : null;
    const daysSince = lastSent ? (now - lastSent) / 86400000 : Infinity;
    if (daysSince >= settings.replenishment_frequency_days) {
      await createNotification({
        userId,
        type: 'PRODUCT_REPLENISHMENT',
        title: '🧴 Product check-in',
        message: `It's been about ${settings.replenishment_frequency_days} days — a good time to check if any of your routine products are running low.`,
      });
    }
  }
}

module.exports = {
  getOrCreateReminderSettings,
  createNotification,
  generateDueReminders,
  DEFAULTS,
};
