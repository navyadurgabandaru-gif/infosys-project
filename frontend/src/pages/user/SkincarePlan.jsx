import { useEffect, useState } from 'react';
import api from '../../api/axios';
import RoutineAdherence from '../../components/RoutineAdherence';
import { Loading, Empty } from '../../components/Shared';
import { todayKey } from '../../utils/routineAdherence';

const SEASON_ICON = { Spring: '🌸', Summer: '☀️', Autumn: '🍂', Winter: '❄️' };

// Server data should always come back with real arrays for these JSONB
// fields (schema defaults to '[]', and the API always JSON-stringifies
// arrays on write) — this just guarantees it defensively at the one
// place plan data enters the component, so a render never crashes the
// whole page over an unexpected shape.
function normalizePlan(plan) {
  if (!plan) return plan;
  const arr = (v) => (Array.isArray(v) ? v : []);
  return {
    ...plan,
    morning_routine: arr(plan.morning_routine),
    evening_routine: arr(plan.evening_routine),
    weekly_treatments: arr(plan.weekly_treatments),
    seasonal_recommendations: arr(plan.seasonal_recommendations),
    changes_from_previous: arr(plan.changes_from_previous),
    explanation: arr(plan.explanation),
    excluded_ingredients: arr(plan.excluded_ingredients),
  };
}

function RoutineList({ title, icon, steps, editing, onChangeStep }) {
  return (
    <div className="routine-card">
      <div className="routine-card-head">
        <span className="routine-icon">{icon}</span>
        <h3>{title}</h3>
      </div>
      <div className="routine-steps">
        {steps.map((s, idx) => (
          <div className="routine-step" key={s.step ?? idx}>
            <div className="routine-step-num">{s.step ?? idx + 1}</div>
            <div className="routine-step-body" style={{ width: '100%' }}>
              <div className="routine-step-top">
                <span className="badge badge-purple">{s.category}</span>
                {editing ? (
                  <input
                    value={s.product}
                    onChange={(e) => onChangeStep(idx, 'product', e.target.value)}
                    style={{ flex: 1 }}
                  />
                ) : (
                  <strong>{s.product}</strong>
                )}
              </div>
              {editing ? (
                <textarea
                  value={s.reason}
                  onChange={(e) => onChangeStep(idx, 'reason', e.target.value)}
                  rows={2}
                  style={{ marginTop: 6 }}
                />
              ) : (
                <p>{s.reason}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SkincarePlan({ refreshKey }) {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadPlan = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/skincare-plan');
      setPlan(normalizePlan(data.plan));
    } catch {
      // no-op — empty state below handles it
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    setEditing(false);
    try {
      const { data } = await api.post('/skincare-plan/generate', {});
      setPlan(normalizePlan(data.plan));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not generate a plan. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const startEditing = () => {
    setDraft({
      morning_routine: plan.morning_routine.map((s) => ({ ...s })),
      evening_routine: plan.evening_routine.map((s) => ({ ...s })),
      weekly_treatments: plan.weekly_treatments.map((w) => ({ ...w })),
    });
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setDraft(null);
  };

  const changeStep = (section, idx, field, value) => {
    setDraft((prev) => {
      const updated = [...prev[section]];
      updated[idx] = { ...updated[idx], [field]: value };
      return { ...prev, [section]: updated };
    });
  };

  const changeWeekly = (idx, field, value) => {
    setDraft((prev) => {
      const updated = [...prev.weekly_treatments];
      updated[idx] = { ...updated[idx], [field]: value };
      return { ...prev, weekly_treatments: updated };
    });
  };

  const saveEdits = async () => {
    setSaving(true);
    setError('');
    try {
      const { data } = await api.put(`/skincare-plan/${plan.id}`, draft);
      setPlan(normalizePlan(data.plan));
      setEditing(false);
      setDraft(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save your changes.');
    } finally {
      setSaving(false);
    }
  };

  const toggleChecklistItem = async (item_key, done) => {
    // Optimistic update so checking a box feels instant.
    setPlan((prev) => {
      const today = todayKey();
      const dayEntry = { ...(prev.checklist?.[today] || {}) };
      if (done) dayEntry[item_key] = true; else delete dayEntry[item_key];
      return { ...prev, checklist: { ...prev.checklist, [today]: dayEntry } };
    });
    try {
      await api.put(`/skincare-plan/${plan.id}/checklist`, { date: todayKey(), item_key, done });
    } catch {
      loadPlan(); // fall back to server truth if the update failed
    }
  };

  if (loading) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <span className="spinner" />
      </div>
    );
  }

  const active = editing ? draft : plan;

  return (
    <div>
      <div className="plan-toolbar">
        <div>
          <h3 style={{ margin: 0 }}>Your Skincare Plan</h3>
          <p className="text-muted" style={{ margin: '4px 0 0', fontSize: 14 }}>
            Generated from your most recent skin analysis, preferences, and lifestyle.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {plan && !editing && (
            <button className="btn btn-outline" onClick={startEditing}>
              ✏️ Manually Edit Routine
            </button>
          )}
          {editing && (
            <>
              <button className="btn btn-outline" onClick={cancelEditing} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEdits} disabled={saving}>
                {saving ? <span className="spinner" /> : 'Save Changes'}
              </button>
            </>
          )}
          {!editing && (
            <button className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
              {generating ? <span className="spinner" /> : plan ? 'Regenerate Routine' : 'Generate My Routine'}
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {!plan && !error && (
        <div className="empty-state">
          <div style={{ fontSize: 34 }}>🧴</div>
          <p>No skincare routine yet — run a skin assessment first, then generate your routine.</p>
        </div>
      )}

      {plan && (
        <>
          {Array.isArray(plan.changes_from_previous) && plan.changes_from_previous.length > 0 && (
            <div className="alert alert-success" style={{ marginBottom: 16 }}>
              <strong>Your skincare routine has been updated based on your latest skin assessment.</strong>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                {plan.changes_from_previous.map((c, i) => <li key={i} style={{ fontSize: 13.5 }}>{c}</li>)}
              </ul>
            </div>
          )}

          <div className="plan-summary-strip">
            <span className="badge badge-blue">Skin Type: {plan.skin_type || '—'}</span>
            <span className="badge badge-amber">
              {SEASON_ICON[plan.season] || '🗓️'} {plan.season} Season
            </span>
            {plan.edited_by_user && <span className="badge badge-purple">Manually adjusted</span>}
          </div>

          <div className="routine-grid">
            <RoutineList
              title="Morning Routine"
              icon="🌤️"
              steps={active.morning_routine}
              editing={editing}
              onChangeStep={(idx, field, value) => changeStep('morning_routine', idx, field, value)}
            />
            <RoutineList
              title="Evening Routine"
              icon="🌙"
              steps={active.evening_routine}
              editing={editing}
              onChangeStep={(idx, field, value) => changeStep('evening_routine', idx, field, value)}
            />
          </div>

          <div className="card plan-section">
            <div className="routine-card-head">
              <span className="routine-icon">🗓️</span>
              <h3>Weekly Treatment</h3>
            </div>
            <div className="weekly-grid">
              {active.weekly_treatments.map((w, i) => (
                <div className="weekly-item" key={i}>
                  <div className="weekly-item-top">
                    {editing ? (
                      <input value={w.name} onChange={(e) => changeWeekly(i, 'name', e.target.value)} style={{ flex: 1 }} />
                    ) : (
                      <strong>{w.name}</strong>
                    )}
                    {editing ? (
                      <input
                        value={w.frequency}
                        onChange={(e) => changeWeekly(i, 'frequency', e.target.value)}
                        style={{ width: 110, marginLeft: 8 }}
                      />
                    ) : (
                      <span className="badge badge-green">{w.frequency}</span>
                    )}
                  </div>
                  {editing ? (
                    <textarea value={w.description} onChange={(e) => changeWeekly(i, 'description', e.target.value)} rows={2} />
                  ) : (
                    <p>{w.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="card plan-section seasonal-card">
            <div className="routine-card-head">
              <span className="routine-icon">{SEASON_ICON[plan.season] || '🗓️'}</span>
              <h3>Seasonal Recommendations</h3>
            </div>
            <p className="text-muted" style={{ fontSize: 13, marginTop: -6 }}>Based on the current {plan.season.toLowerCase()} season.</p>
            <div className="weekly-grid">
              {plan.seasonal_recommendations.map((s, i) => (
                <div className="weekly-item" key={i}>
                  <strong>{s.title}</strong>
                  <p>{s.description}</p>
                </div>
              ))}
            </div>
          </div>

          {(plan.explanation?.length > 0 || plan.excluded_ingredients?.length > 0) && (
            <div className="card plan-section">
              <div className="routine-card-head">
                <span className="routine-icon">💡</span>
                <h3>Personalized Recommendations</h3>
              </div>
              {plan.explanation?.length > 0 && (
                <ul className="explanation-list">
                  {plan.explanation.map((line, i) => <li key={i}>{line}</li>)}
                </ul>
              )}
              {plan.excluded_ingredients?.length > 0 && (
                <>
                  <hr className="divider" />
                  <h4 style={{ marginBottom: 8 }}>Adjusted for your allergies/sensitivities</h4>
                  {plan.excluded_ingredients.map((ex, i) => (
                    <div className="concern-item" key={i}>
                      <span>{ex.category}: {ex.original_product}</span>
                      <span className="badge badge-amber">avoided "{ex.matched_allergy}"</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {!editing && <RoutineAdherence plan={plan} onToggle={toggleChecklistItem} />}
        </>
      )}
    </div>
  );
}
