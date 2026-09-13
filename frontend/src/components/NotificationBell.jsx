import { useEffect, useRef, useState } from 'react';
import api from '../api/axios';

const TYPE_ICON = {
  MORNING_ROUTINE: '🌞',
  EVENING_ROUTINE: '🌙',
  HYDRATION: '💧',
  SLEEP: '😴',
  PRODUCT_REPLENISHMENT: '🧴',
  PROGRESS_ALERT: '📊',
  PLATFORM: '🔔',
};

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState('');
  const ref = useRef(null);

  const load = async () => {
    try {
      const { data } = await api.get('/notifications');
      setNotifications(data.notifications);
      setUnreadCount(data.unread_count);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load notifications.');
    }
  };

  useEffect(() => {
    load();
    // Poll periodically so newly-due reminders / progress alerts surface
    // without requiring a manual refresh.
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const markOneRead = async (id) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await api.put(`/notifications/${id}/read`);
    } catch {
      load();
    }
  };

  const markAllRead = async () => {
    setNotifications((prev) => (prev ? prev.map((n) => ({ ...n, is_read: true })) : prev));
    setUnreadCount(0);
    try {
      await api.put('/notifications/read-all');
    } catch {
      load();
    }
  };

  return (
    <div className="notif-bell-wrap" ref={ref}>
      <button
        type="button"
        className="notif-bell-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
      >
        🔔
        {unreadCount > 0 && <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-dropdown-head">
            <strong>Notifications</strong>
            {unreadCount > 0 && (
              <button type="button" className="notif-mark-all" onClick={markAllRead}>
                Mark all as read
              </button>
            )}
          </div>

          <div className="notif-dropdown-body">
            {error && <p className="text-muted" style={{ fontSize: 13, padding: 12 }}>{error}</p>}
            {!error && notifications === null && (
              <div style={{ textAlign: 'center', padding: 24 }}><span className="spinner" /></div>
            )}
            {!error && notifications?.length === 0 && (
              <div className="notif-empty">
                <div style={{ fontSize: 26 }}>🔔</div>
                <p>You're all caught up — no notifications yet.</p>
              </div>
            )}
            {!error && notifications?.map((n) => (
              <button
                type="button"
                key={n.id}
                className={`notif-item ${n.is_read ? '' : 'unread'}`}
                onClick={() => !n.is_read && markOneRead(n.id)}
              >
                <span className="notif-item-icon">{TYPE_ICON[n.type] || '🔔'}</span>
                <span className="notif-item-body">
                  <span className="notif-item-title">{n.title}</span>
                  <span className="notif-item-message">{n.message}</span>
                  <span className="notif-item-time">{timeAgo(n.created_at)}</span>
                </span>
                {!n.is_read && <span className="notif-dot" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
