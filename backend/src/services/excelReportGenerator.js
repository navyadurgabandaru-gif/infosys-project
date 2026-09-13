const ExcelJS = require('exceljs');

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1C6FD6' } };
const HEADER_FONT = { color: { argb: 'FFFFFFFF' }, bold: true };

function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle' };
  });
}

/**
 * Builds a real, multi-sheet .xlsx workbook (via exceljs) from the report
 * bundle and returns it as a Buffer. Every sheet is populated only with
 * data that actually exists on the bundle — a section with nothing to
 * report gets a single explanatory row rather than fabricated rows.
 */
async function buildSkinIntelligenceWorkbook(bundle) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AI Skincare Planner';
  wb.created = bundle.generatedAt;

  const { user, prefs, latestReport, reportHistory, plan, productRecommendations, score } = bundle;

  // ---- Sheet 1: Skin Assessment ----
  const s1 = wb.addWorksheet('Skin Assessment');
  s1.columns = [{ width: 26 }, { width: 50 }];
  s1.addRow(['User', user?.name || '—']);
  s1.addRow(['Email', user?.email || '—']);
  s1.addRow(['Skin Type', prefs?.skin_type || latestReport?.skin_type || 'Not set']);
  s1.addRow(['Latest Assessment Date', latestReport ? new Date(latestReport.created_at).toLocaleDateString() : 'No assessment yet']);
  s1.addRow(['Skin Health Score (AI)', latestReport?.skin_health_score ?? '—']);
  s1.addRow(['Overall Condition', latestReport?.overall_condition ?? '—']);
  s1.addRow([]);
  const s1HeaderRow = s1.addRow(['Concern', 'Severity']);
  styleHeaderRow(s1HeaderRow);
  const concerns = latestReport?.concerns || [];
  if (concerns.length === 0) {
    s1.addRow(['No concerns identified in the latest assessment.', '']);
  } else {
    concerns.forEach((c) => s1.addRow([c.name || 'Concern', c.severity || '—']));
  }

  // ---- Sheet 2: Skin Health Score ----
  const s2 = wb.addWorksheet('Skin Health Score');
  s2.columns = [{ width: 24 }, { width: 12 }, { width: 12 }, { width: 55 }];
  const s2Header = s2.addRow(['Component', 'Weight', 'Score', 'Details']);
  styleHeaderRow(s2Header);
  const rows = [
    ['Skin Condition', '35%', score.skinCondition],
    ['Lifestyle', '20%', score.lifestyle],
    ['Sleep Quality', '15%', score.sleep],
    ['Routine Consistency', '20%', score.routine],
    ['Hydration', '10%', score.hydration],
  ];
  rows.forEach(([label, weight, comp]) => {
    s2.addRow([label, weight, comp?.available ? comp.score : 'Not yet available', comp?.dataUsed || comp?.explanation || '—']);
  });
  s2.addRow([]);
  s2.addRow(['Overall Score', '100%', score.overall.available ? score.overall.score : 'Not yet available (missing input)']);

  // ---- Sheet 3: Routine Adherence ----
  const s3 = wb.addWorksheet('Routine Adherence');
  s3.columns = [{ width: 26 }, { width: 40 }];
  s3.addRow(['Has Routine', score.routine.hasRoutine ? 'Yes' : 'No']);
  s3.addRow(['Adherence Score', `${score.routine.score}%`]);
  s3.addRow(['Days Fully Completed', score.routine.completedDays]);
  s3.addRow(['Days Planned (since routine created)', score.routine.plannedDays]);
  s3.addRow([]);
  const s3Header = s3.addRow(['Morning Routine Step', 'Product']);
  styleHeaderRow(s3Header);
  (plan?.morning_routine || []).forEach((st) => s3.addRow([st.category || 'Step', st.product || '—']));
  s3.addRow([]);
  const s3Header2 = s3.addRow(['Evening Routine Step', 'Product']);
  styleHeaderRow(s3Header2);
  (plan?.evening_routine || []).forEach((st) => s3.addRow([st.category || 'Step', st.product || '—']));

  // ---- Sheet 4: Progress ----
  const s4 = wb.addWorksheet('Progress');
  s4.columns = [{ width: 14 }, { width: 16 }, { width: 22 }, { width: 40 }];
  const s4Header = s4.addRow(['Date', 'Skin Score', 'Condition', 'Concerns']);
  styleHeaderRow(s4Header);
  (reportHistory || []).forEach((r) => {
    s4.addRow([
      new Date(r.created_at).toLocaleDateString(),
      r.skin_health_score,
      r.overall_condition || '—',
      (r.concerns || []).map((c) => c.name).join(', ') || '—',
    ]);
  });
  if (!reportHistory || reportHistory.length === 0) {
    s4.addRow(['No assessment history yet.', '', '', '']);
  }

  // ---- Sheet 5: Recommendations ----
  const s5 = wb.addWorksheet('Recommendations');
  s5.columns = [{ width: 30 }, { width: 16 }, { width: 18 }, { width: 10 }, { width: 45 }];
  const s5Header = s5.addRow(['Product', 'Brand', 'Category', 'Price', 'Reason']);
  styleHeaderRow(s5Header);
  if (!productRecommendations || productRecommendations.length === 0) {
    s5.addRow(['No product recommendations on record for the current plan.', '', '', '', '']);
  } else {
    productRecommendations.forEach((p) => {
      s5.addRow([p.name, p.brand || '—', p.routine_category || p.category || '—', p.price ?? '—', p.reason || '—']);
    });
  }

  return wb.xlsx.writeBuffer();
}

module.exports = { buildSkinIntelligenceWorkbook };
