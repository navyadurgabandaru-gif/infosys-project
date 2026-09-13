/**
 * Routine Adherence calculations, computed entirely from data already on
 * the plan object (morning_routine, evening_routine, checklist — the
 * per-day `{ "YYYY-MM-DD": { "morning-0": true, ... } }` map persisted by
 * PUT /skincare-plan/:id/checklist). No fabricated numbers: a plan with
 * no checklist entries yet correctly reports 0% everywhere rather than a
 * placeholder.
 */

function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function daysAgoKey(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return todayKey(d);
}

function stepKeys(steps, half) {
  return (steps || []).map((s, i) => `${half}-${s.step ?? i}`);
}

// Adherence % for one half of the routine (morning|evening) across a
// given list of date keys: (days where every step was checked) / (days
// since the plan existed, capped to the window) * 100.
function halfAdherence(plan, half, dateKeys) {
  const keys = stepKeys(half === 'morning' ? plan.morning_routine : plan.evening_routine, half);
  if (keys.length === 0) return { pct: 0, completed: 0, applicable: 0 };

  const start = new Date(plan.created_at);
  start.setHours(0, 0, 0, 0);

  let completed = 0;
  let applicable = 0;
  dateKeys.forEach((dateKey) => {
    const day = new Date(dateKey);
    day.setHours(0, 0, 0, 0);
    if (day < start) return; // plan didn't exist yet on this date
    applicable += 1;
    const entry = plan.checklist?.[dateKey] || {};
    if (keys.every((k) => entry[k])) completed += 1;
  });

  const pct = applicable > 0 ? Math.round((completed / applicable) * 100) : 0;
  return { pct, completed, applicable };
}

function lastNDateKeys(n) {
  return Array.from({ length: n }, (_, i) => daysAgoKey(n - 1 - i));
}

// Current streak = consecutive days (ending today or yesterday) where
// BOTH morning and evening were fully completed. Breaks the moment a
// fully-applicable day is missed.
function computeStreak(plan) {
  const morningKeys = stepKeys(plan.morning_routine, 'morning');
  const eveningKeys = stepKeys(plan.evening_routine, 'evening');
  const allKeys = [...morningKeys, ...eveningKeys];
  if (allKeys.length === 0) return 0;

  let streak = 0;
  for (let i = 0; i < 90; i += 1) {
    const dateKey = daysAgoKey(i);
    const entry = plan.checklist?.[dateKey] || {};
    const fullyDone = allKeys.every((k) => entry[k]);
    if (fullyDone) {
      streak += 1;
    } else if (i === 0) {
      // Today not finished yet is normal — check yesterday onward instead
      // of breaking the streak just because the day isn't over.
      continue;
    } else {
      break;
    }
  }
  return streak;
}

export function computeAdherence(plan) {
  if (!plan) {
    return {
      overallPct: 0, morning: { pct: 0 }, evening: { pct: 0 },
      weeklyPct: 0, monthlyPct: 0, completedRoutines: 0, missedRoutines: 0, streak: 0,
    };
  }

  const start = new Date(plan.created_at);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysSinceStart = Math.max(1, Math.floor((today - start) / 86400000) + 1);
  const allDates = Array.from({ length: daysSinceStart }, (_, i) => daysAgoKey(daysSinceStart - 1 - i));

  const morningAll = halfAdherence(plan, 'morning', allDates);
  const eveningAll = halfAdherence(plan, 'evening', allDates);
  const morningWeek = halfAdherence(plan, 'morning', lastNDateKeys(7));
  const eveningWeek = halfAdherence(plan, 'evening', lastNDateKeys(7));
  const morningMonth = halfAdherence(plan, 'morning', lastNDateKeys(30));
  const eveningMonth = halfAdherence(plan, 'evening', lastNDateKeys(30));

  const overallPct = Math.round((morningAll.pct + eveningAll.pct) / 2);
  const weeklyPct = Math.round((morningWeek.pct + eveningWeek.pct) / 2);
  const monthlyPct = Math.round((morningMonth.pct + eveningMonth.pct) / 2);

  const completedRoutines = morningAll.completed + eveningAll.completed;
  const totalApplicable = morningAll.applicable + eveningAll.applicable;
  const missedRoutines = Math.max(0, totalApplicable - completedRoutines);

  return {
    overallPct,
    weeklyPct,
    monthlyPct,
    completedRoutines,
    missedRoutines,
    streak: computeStreak(plan),
    morning: morningAll,
    evening: eveningAll,
  };
}

export function todaysStepStatus(plan) {
  const today = todayKey();
  const todayDone = plan.checklist?.[today] || {};
  const morning = (plan.morning_routine || []).map((s, i) => {
    const key = `morning-${s.step ?? i}`;
    return { key, label: `${s.category} — ${s.product}`, done: !!todayDone[key] };
  });
  const evening = (plan.evening_routine || []).map((s, i) => {
    const key = `evening-${s.step ?? i}`;
    return { key, label: `${s.category} — ${s.product}`, done: !!todayDone[key] };
  });
  return { morning, evening };
}

export { todayKey };
