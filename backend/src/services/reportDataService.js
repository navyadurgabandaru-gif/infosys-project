const pool = require('../config/db');
const {
  calculateSkinConditionScore,
  calculateLifestyleScore,
  calculateSleepScore,
  calculateRoutineConsistency,
  calculateHydrationScore,
  calculateOverallSkinHealthScore,
  calculateImprovementScore,
} = require('../utils/skinHealthScore');
const { getRecommendationsForPlan } = require('./productRecommendation');

/**
 * Gathers everything a report/export needs from real, already-persisted
 * data — the same rows the dashboard itself reads — and computes the
 * same weighted score breakdown as the frontend (via the ported
 * utils/skinHealthScore.js) so PDF/Excel never show a number the app
 * didn't actually compute. Nothing here is fabricated: a section with no
 * underlying data comes back as `null`/empty rather than a placeholder.
 */
async function buildReportBundle(userId) {
  const [userRes, prefsRes, reportsRes, planRes] = await Promise.all([
    pool.query('SELECT id, name, email, role, created_at FROM users WHERE id = $1', [userId]),
    pool.query('SELECT * FROM user_skincare_preferences WHERE user_id = $1', [userId]),
    pool.query('SELECT * FROM skin_reports WHERE user_id = $1 ORDER BY created_at DESC', [userId]),
    pool.query('SELECT * FROM skincare_plans WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1', [userId]),
  ]);

  const user = userRes.rows[0] || null;
  const prefs = prefsRes.rows[0] || null;
  const reports = reportsRes.rows;
  const latestReport = reports[0] || null;
  const previousReport = reports[1] || null;
  const plan = planRes.rows[0] || null;

  const productRecommendations = plan ? await getRecommendationsForPlan(plan.id) : [];

  const skinCondition = calculateSkinConditionScore(latestReport, prefs);
  const lifestyle = calculateLifestyleScore(prefs);
  const sleep = calculateSleepScore(prefs);
  const routine = calculateRoutineConsistency(plan);
  const hydration = calculateHydrationScore(prefs);
  const overall = calculateOverallSkinHealthScore({ skinCondition, lifestyle, sleep, routine, hydration });
  const improvement = calculateImprovementScore(reports);

  return {
    generatedAt: new Date(),
    user,
    prefs,
    latestReport,
    previousReport,
    reportHistory: reports,
    plan,
    productRecommendations,
    score: { skinCondition, lifestyle, sleep, routine, hydration, overall, improvement },
  };
}

module.exports = { buildReportBundle };
