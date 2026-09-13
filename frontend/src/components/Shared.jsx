export function StatCard({ value, label }) {
  return (
    <div className="stat-card">
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}

export function StatusBadge({ status }) {
  const map = {
    PENDING: 'badge-amber',
    CONFIRMED: 'badge-blue',
    COMPLETED: 'badge-green',
    CANCELLED: 'badge-red',
    PENDING_REVIEW: 'badge-amber',
    REVIEWED: 'badge-green',
  };
  return <span className={`badge ${map[status] || 'badge-gray'}`}>{status?.replace('_', ' ')}</span>;
}

export function ScoreRing({ score = 0, size = 96 }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? 'var(--color-success)' : score >= 60 ? 'var(--color-primary)' : 'var(--color-warning)';

  return (
    <svg width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-border)" strokeWidth="10" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text x="50%" y="53%" textAnchor="middle" fontSize="22" fontWeight="800" fill="var(--color-text)">
        {score}
      </text>
    </svg>
  );
}

export function Loading({ label = 'Loading...' }) {
  return (
    <div className="empty-state">
      <div className="spinner" style={{ borderTopColor: 'var(--color-primary)', borderColor: 'var(--color-border)', margin: '0 auto 12px' }} />
      {label}
    </div>
  );
}

export function Empty({ label = 'Nothing here yet.' }) {
  return <div className="empty-state">{label}</div>;
}
