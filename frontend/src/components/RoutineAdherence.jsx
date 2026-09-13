import { computeAdherence, todaysStepStatus } from '../utils/routineAdherence';

function TodayCard({ title, icon, steps, onToggle, pct }) {
  const doneCount = steps.filter((s) => s.done).length;
  return (
    <div className="card plan-section">
      <div className="routine-card-head" style={{ justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="routine-icon">{icon}</span>
          <h3 style={{ margin: 0 }}>{title.toUpperCase()}</h3>
        </span>
        <span className="adherence-card-pct">{pct}%</span>
      </div>

      {steps.length === 0 ? (
        <p className="text-muted" style={{ fontSize: 13 }}>No steps in this routine yet.</p>
      ) : (
        <div className="checklist" style={{ marginTop: 4 }}>
          {steps.map((s) => (
            <label className="checklist-item" key={s.key}>
              <input type="checkbox" checked={s.done} onChange={(e) => onToggle(s.key, e.target.checked)} />
              <span className={s.done ? 'checklist-done' : ''}>{s.label}</span>
            </label>
          ))}
        </div>
      )}

      <p className="text-muted" style={{ fontSize: 12.5, marginTop: 10, marginBottom: 0 }}>
        {title} Adherence: <strong>{pct}%</strong> · Today {doneCount}/{steps.length} done
      </p>
    </div>
  );
}

export default function RoutineAdherence({ plan, onToggle }) {
  const adherence = computeAdherence(plan);
  const { morning, evening } = todaysStepStatus(plan);

  return (
    <div>
      <div className="card plan-section">
        <div className="routine-card-head">
          <span className="routine-icon">📈</span>
          <h3>Routine Adherence</h3>
        </div>
        <div className="adherence-summary-grid">
          <div className="adherence-stat">
            <div className="adherence-stat-value">{adherence.overallPct}%</div>
            <div className="adherence-stat-label">Overall</div>
          </div>
          <div className="adherence-stat">
            <div className="adherence-stat-value">{adherence.weeklyPct}%</div>
            <div className="adherence-stat-label">This Week</div>
          </div>
          <div className="adherence-stat">
            <div className="adherence-stat-value">{adherence.monthlyPct}%</div>
            <div className="adherence-stat-label">This Month</div>
          </div>
          <div className="adherence-stat">
            <div className="adherence-stat-value">🔥 {adherence.streak}</div>
            <div className="adherence-stat-label">Day Streak</div>
          </div>
          <div className="adherence-stat">
            <div className="adherence-stat-value">{adherence.completedRoutines}</div>
            <div className="adherence-stat-label">Completed</div>
          </div>
          <div className="adherence-stat">
            <div className="adherence-stat-value">{adherence.missedRoutines}</div>
            <div className="adherence-stat-label">Missed</div>
          </div>
        </div>
      </div>

      <div className="adherence-routine-grid">
        <TodayCard title="Morning Routine" icon="🌞" steps={morning} onToggle={onToggle} pct={adherence.morning.pct} />
        <TodayCard title="Evening Routine" icon="🌙" steps={evening} onToggle={onToggle} pct={adherence.evening.pct} />
      </div>
    </div>
  );
}
