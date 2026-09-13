import { useEffect, useState } from 'react';
import api from '../../api/axios';

const TYPE_ICON = {
  MORNING_ROUTINE: '🌞',
  EVENING_ROUTINE: '🌙',
  HYDRATION: '💧',
  SLEEP: '😴',
  PRODUCT_REPLENISHMENT: '🧴',
  PROGRESS_ALERT: '📊',
  PLATFORM: '🔔',
};

const REMINDER_FIELDS = [
  { key: 'morning_routine', icon: '🌞', label: 'Morning routine reminder', hasTime: true },
  { key: 'evening_routine', icon: '🌙', label: 'Evening routine reminder', hasTime: true },
  { key: 'hydration', icon: '💧', label: 'Hydration reminder', hasTime: true, hasFrequency: true },
  { key: 'sleep', icon: '😴', label: 'Sleep reminder', hasTime: true },
  { key: 'replenishment', icon: '🧴', label: 'Product replenishment reminder', hasDays: true },
  { key: 'progress_alerts', icon: '📊', label: 'Progress alerts', simple: true },
];

function NotificationList({ notifications, onMarkRead, onMarkAll }) {
  const unread = notifications.filter((n) => !n.is_read).length;
  return (
    <div className="card plan-section">
      <div className="routine-card-head" style={{ justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="routine-icon">🔔</span>
          <h3 style={{ margin: 0 }}>Notifications</h3>
        </span>
        {unread > 0 && (
          <button type="button" className="btn btn-outline btn-sm" onClick={onMarkAll}>
            Mark all as read ({unread})
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 30 }}>🔔</div>
          <p>You're all caught up — no notifications yet.</p>
        </div>
      ) : (
        <div>
          {notifications.map((n) => (
            <div key={n.id} className="concern-item" style={{ alignItems: 'flex-start', cursor: n.is_read ? 'default' : 'pointer' }}
                 onClick={() => !n.is_read && onMarkRead(n.id)}>
              <span style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 18 }}>{TYPE_ICON[n.type] || '🔔'}</span>
                <span>
                  <strong style={{ display: 'block', fontSize: 13.5 }}>{n.title}</strong>
                  <span className="text-muted" style={{ fontSize: 12.5 }}>{n.message}</span>
                  <span className="text-soft" style={{ display: 'block', fontSize: 11, marginTop: 2 }}>
                    {new Date(n.created_at).toLocaleString()}
                  </span>
                </span>
              </span>
              {!n.is_read && <span className="badge badge-blue">New</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReminderSettingsForm({ settings, onChange, onSave, saving, saved }) {
  const val = (key, field) => settings?.[`${key}_${field}`];

  const update = (patch) => onChange((prev) => ({ ...prev, ...patch }));

  return (
    <div className="card plan-section">
      <div className="routine-card-head">
        <span className="routine-icon">⚙️</span>
        <h3>Reminder Preferences</h3>
      </div>
      <p className="text-muted" style={{ fontSize: 13, marginTop: -6, marginBottom: 16 }}>
        Choose which reminders you want and when they should fire.
      </p>

      {REMINDER_FIELDS.map((f) => {
        const enabledKey = `${f.key}_enabled`;
        const enabled = settings?.[enabledKey];
        return (
          <div key={f.key} className="reminder-row">
            <label className="reminder-row-toggle">
              <input
                type="checkbox"
                checked={!!enabled}
                onChange={(e) => update({ [enabledKey]: e.target.checked })}
              />
              <span>{f.icon} {f.label}</span>
            </label>

            {enabled && f.hasTime && (
              <input
                type="time"
                className="reminder-time-input"
                value={val(f.key, 'time') || ''}
                onChange={(e) => update({ [`${f.key}_time`]: e.target.value })}
              />
            )}

            {enabled && f.hasFrequency && (
              <select
                className="reminder-time-input"
                value={settings?.hydration_frequency || 'daily'}
                onChange={(e) => update({ hydration_frequency: e.target.value })}
              >
                <option value="daily">Daily</option>
                <option value="twice_daily">Twice daily</option>
              </select>
            )}

            {enabled && f.hasDays && (
              <select
                className="reminder-time-input"
                value={settings?.replenishment_frequency_days || 30}
                onChange={(e) => update({ replenishment_frequency_days: Number(e.target.value) })}
              >
                <option value={14}>Every 2 weeks</option>
                <option value={30}>Every 30 days</option>
                <option value={60}>Every 60 days</option>
                <option value={90}>Every 90 days</option>
              </select>
            )}
          </div>
        );
      })}

      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>
          {saving ? <span className="spinner" /> : 'Save Reminder Settings'}
        </button>
        {saved && <span className="text-muted" style={{ fontSize: 12.5 }}>Saved ✓</span>}
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState(null);
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = async () => {
    try {
      const [notifRes, settingsRes] = await Promise.all([
        api.get('/notifications'),
        api.get('/notifications/settings'),
      ]);
      setNotifications(notifRes.data.notifications);
      setSettings(settingsRes.data.settings);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load notifications.');
    }
  };

  useEffect(() => { load(); }, []);

  const markRead = async (id) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    try { await api.put(`/notifications/${id}/read`); } catch { load(); }
  };

  const markAll = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try { await api.put('/notifications/read-all'); } catch { load(); }
  };

  const saveSettings = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const { data } = await api.put('/notifications/settings', settings);
      setSettings(data.settings);
      setSaved(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save reminder settings.');
    } finally {
      setSaving(false);
    }
  };

  if (error) return <div className="alert alert-error">{error}</div>;
  if (notifications === null || settings === null) {
    return <div className="card" style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /></div>;
  }

  return (
    <div>
      <NotificationList notifications={notifications} onMarkRead={markRead} onMarkAll={markAll} />
      <ReminderSettingsForm settings={settings} onChange={setSettings} onSave={saveSettings} saving={saving} saved={saved} />
    </div>
  );
}
