const PDFDocument = require('pdfkit');

const BRAND = '#1c6fd6';
const MUTED = '#56687e';
const DARK = '#142236';

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
}

function sectionHeading(doc, title) {
  doc.moveDown(0.8);
  doc.fontSize(14).fillColor(BRAND).font('Helvetica-Bold').text(title);
  doc.moveTo(doc.x, doc.y + 2).lineTo(545, doc.y + 2).strokeColor('#dbe6f2').lineWidth(1).stroke();
  doc.moveDown(0.5);
  doc.fillColor(DARK).font('Helvetica');
}

function kv(doc, label, value, opts = {}) {
  doc.fontSize(10.5).fillColor(MUTED).font('Helvetica-Bold').text(`${label}: `, { continued: true });
  doc.fillColor(DARK).font('Helvetica').text(value ?? '—', opts);
}

function scoreLine(doc, label, comp, weightPct) {
  const val = comp?.available ? `${comp.score}/100` : 'Not yet available';
  doc.fontSize(10.5).fillColor(DARK).font('Helvetica-Bold').text(`${label} (${weightPct}%): `, { continued: true });
  doc.font('Helvetica').fillColor(comp?.available ? DARK : '#9a5a12').text(val);
  if (comp?.dataUsed) {
    doc.fontSize(9).fillColor(MUTED).text(comp.dataUsed, { indent: 10 });
  }
  doc.moveDown(0.3);
}

/**
 * Renders the full report bundle (see reportDataService.buildReportBundle)
 * into a real, professionally-formatted PDF using pdfkit, and pipes it
 * directly to the given writable stream (the HTTP response). Every value
 * printed comes from the bundle — no invented numbers, and any section
 * with no underlying data is rendered as an honest "not yet available"
 * line instead of being silently skipped or faked.
 */
function renderSkinIntelligencePdf(bundle, stream) {
  const doc = new PDFDocument({ size: 'A4', margin: 44, bufferPages: true });
  doc.pipe(stream);

  const { user, prefs, latestReport, previousReport, plan, productRecommendations, score } = bundle;

  // ---- Header ----
  doc.fontSize(20).fillColor(BRAND).font('Helvetica-Bold').text('AI Skincare Planner', { continued: false });
  doc.fontSize(11).fillColor(MUTED).font('Helvetica').text('Skin Health & Progress Report');
  doc.moveDown(0.4);
  doc.fontSize(9).fillColor(MUTED).text(`Generated ${fmtDate(bundle.generatedAt)}`);
  doc.moveTo(44, doc.y + 8).lineTo(551, doc.y + 8).strokeColor(BRAND).lineWidth(2).stroke();
  doc.moveDown(1);

  // ---- User info ----
  sectionHeading(doc, 'User Information');
  kv(doc, 'Name', user?.name);
  kv(doc, 'Email', user?.email);
  kv(doc, 'Member since', fmtDate(user?.created_at));
  kv(doc, 'Skin type', prefs?.skin_type || latestReport?.skin_type || 'Not set');

  // ---- Skin Health Score ----
  sectionHeading(doc, 'Skin Health Score');
  if (score.overall.available) {
    doc.fontSize(26).fillColor(BRAND).font('Helvetica-Bold').text(`${score.overall.score} / 100`);
    doc.moveDown(0.4);
  } else {
    doc.fontSize(10.5).fillColor('#9a5a12').text(
      `Overall score not yet available — missing: ${(score.overall.missingKeys || []).join(', ') || 'input'}.`
    );
    doc.moveDown(0.4);
  }
  doc.font('Helvetica-Bold').fontSize(11).fillColor(DARK).text('Score Breakdown');
  doc.moveDown(0.2);
  scoreLine(doc, 'Skin Condition', score.skinCondition, 35);
  scoreLine(doc, 'Lifestyle', score.lifestyle, 20);
  scoreLine(doc, 'Sleep Quality', score.sleep, 15);
  scoreLine(doc, 'Routine Consistency', score.routine, 20);
  scoreLine(doc, 'Hydration', score.hydration, 10);

  // ---- Previous vs Current ----
  sectionHeading(doc, 'Previous vs Current Assessment');
  if (previousReport && latestReport) {
    const delta = Math.round(Number(latestReport.skin_health_score) - Number(previousReport.skin_health_score));
    kv(doc, 'Previous score', `${previousReport.skin_health_score} (${fmtDate(previousReport.created_at)})`);
    kv(doc, 'Current score', `${latestReport.skin_health_score} (${fmtDate(latestReport.created_at)})`);
    kv(doc, 'Change', `${delta > 0 ? '+' : ''}${delta} pts`);
  } else if (latestReport) {
    kv(doc, 'Current score', `${latestReport.skin_health_score} (${fmtDate(latestReport.created_at)})`);
    doc.fontSize(9.5).fillColor(MUTED).text('Only one assessment on record — complete another later to see a comparison.');
  } else {
    doc.fontSize(10.5).fillColor(MUTED).text('No skin assessment on record yet.');
  }

  // ---- Skin Concerns (latest report) ----
  sectionHeading(doc, 'Skin Concerns');
  const concerns = latestReport?.concerns || [];
  if (concerns.length === 0) {
    doc.fontSize(10.5).fillColor(MUTED).text('No concerns identified in the latest assessment.');
  } else {
    concerns.forEach((c) => {
      doc.fontSize(10.5).fillColor(DARK).font('Helvetica-Bold').text(`• ${c.name || 'Concern'}`, { continued: true });
      doc.font('Helvetica').fillColor(MUTED).text(c.severity ? `  —  ${c.severity}` : '');
    });
  }

  // ---- Morning Routine ----
  doc.addPage();
  sectionHeading(doc, 'Morning Routine');
  renderRoutine(doc, plan?.morning_routine);

  // ---- Evening Routine ----
  sectionHeading(doc, 'Evening Routine');
  renderRoutine(doc, plan?.evening_routine);

  // ---- Weekly Treatments ----
  sectionHeading(doc, 'Weekly Treatments');
  const weekly = plan?.weekly_treatments || [];
  if (weekly.length === 0) {
    doc.fontSize(10.5).fillColor(MUTED).text('No weekly treatments in the current plan.');
  } else {
    weekly.forEach((t) => {
      doc.fontSize(10.5).fillColor(DARK).font('Helvetica-Bold').text(`• ${t.name}`, { continued: true });
      doc.font('Helvetica').fillColor(MUTED).text(t.frequency ? `  —  ${t.frequency}` : '');
      if (t.description) doc.fontSize(9.5).fillColor(MUTED).text(t.description, { indent: 10 });
    });
  }

  // ---- Routine Adherence ----
  sectionHeading(doc, 'Routine Adherence');
  if (score.routine?.hasRoutine) {
    kv(doc, 'Days fully completed', `${score.routine.completedDays} of ${score.routine.plannedDays}`);
    kv(doc, 'Adherence score', `${score.routine.score}%`);
  } else {
    doc.fontSize(10.5).fillColor(MUTED).text('No routine has been created yet.');
  }

  // ---- Product Recommendations ----
  doc.addPage();
  sectionHeading(doc, 'Product Recommendations');
  if (!productRecommendations || productRecommendations.length === 0) {
    doc.fontSize(10.5).fillColor(MUTED).text('No product recommendations on record for the current plan.');
  } else {
    productRecommendations.forEach((p) => {
      doc.fontSize(10.5).fillColor(DARK).font('Helvetica-Bold').text(`• ${p.name}${p.brand ? ` (${p.brand})` : ''}`);
      doc.fontSize(9.5).fillColor(MUTED).font('Helvetica').text(
        `${p.routine_category || p.category || ''}${p.price ? ` · ₹${p.price}` : ''}`,
        { indent: 10 }
      );
      if (p.reason) doc.fontSize(9.5).fillColor(MUTED).text(p.reason, { indent: 10 });
      doc.moveDown(0.2);
    });
  }

  // ---- Progress / Trend summary ----
  sectionHeading(doc, 'Progress Summary');
  if (score.improvement.available) {
    kv(doc, 'Status', score.improvement.status);
    kv(doc, 'Score change', `${score.improvement.delta > 0 ? '+' : ''}${score.improvement.delta} pts`);
    kv(doc, 'Previous → Current', `${score.improvement.previous} → ${score.improvement.latest}`);
  } else {
    doc.fontSize(10.5).fillColor(MUTED).text(score.improvement.message);
  }

  // ---- Footer / page numbers ----
  // pdfkit's text() auto-adds a new page whenever a draw would cross the
  // page's bottom margin — even with an explicit y position — so a
  // footer placed near the bottom silently produced one extra blank
  // trailing page per real page. Temporarily zeroing the bottom margin
  // for just this draw is pdfkit's documented workaround.
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i += 1) {
    doc.switchToPage(i);
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.fontSize(8).fillColor('#8ea0b4').text(
      `AI Skincare Planner  ·  Page ${i + 1} of ${pages.count}`,
      44, doc.page.height - 34, { width: 507, align: 'center', lineBreak: false }
    );
    doc.page.margins.bottom = bottomMargin;
  }

  doc.end();
}

function renderRoutine(doc, steps) {
  if (!steps || steps.length === 0) {
    doc.fontSize(10.5).fillColor('#8ea0b4').text('No steps in this routine yet.');
    return;
  }
  steps.forEach((s, i) => {
    doc.fontSize(10.5).fillColor(DARK).font('Helvetica-Bold').text(`${i + 1}. ${s.category || 'Step'} — ${s.product || ''}`);
    if (s.reason) doc.fontSize(9.5).fillColor(MUTED).font('Helvetica').text(s.reason, { indent: 12 });
    doc.moveDown(0.15);
  });
}

module.exports = { renderSkinIntelligencePdf };
