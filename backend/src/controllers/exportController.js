const { buildReportBundle } = require('../services/reportDataService');
const { renderSkinIntelligencePdf } = require('../services/pdfReportGenerator');
const { buildSkinIntelligenceWorkbook } = require('../services/excelReportGenerator');
const { hasProviderAccess } = require('../utils/patientAccess');

/**
 * Resolves + authorizes who this export is for.
 *  - No ?userId= query param  -> exporting your own data (unchanged
 *    behavior for the USER role — every existing self-export call keeps
 *    working exactly as before).
 *  - ?userId=<id> present     -> exporting someone else's report:
 *      ADMIN               always allowed.
 *      DOCTOR / CONSULTANT allowed only if hasProviderAccess() confirms
 *                          a real care relationship (appointment or a
 *                          report they've already reviewed) — never a
 *                          blanket "any provider can export any user".
 *      USER (or anything else) can never target another id — 403.
 * On any authorization failure this writes the response itself (401/403/
 * 400) and returns null so the caller can bail out immediately; this is
 * the actual backend enforcement against IDOR (e.g. GET /reports/123
 * vs /reports/124), not just a hidden frontend button.
 */
async function resolveExportTarget(req, res) {
  const rawUserId = req.query.userId;
  if (!rawUserId) return req.user.id;

  const requestedUserId = Number(rawUserId);
  if (!Number.isInteger(requestedUserId) || requestedUserId <= 0) {
    res.status(400).json({ message: 'Invalid userId.' });
    return null;
  }

  if (requestedUserId === req.user.id) return requestedUserId;

  if (req.user.role === 'ADMIN') return requestedUserId;

  if (req.user.role === 'DOCTOR' || req.user.role === 'CONSULTANT') {
    const allowed = await hasProviderAccess(req.user.id, requestedUserId);
    if (!allowed) {
      res.status(403).json({ message: 'You are not authorized to export this patient/client\'s report.' });
      return null;
    }
    return requestedUserId;
  }

  res.status(403).json({ message: 'You can only export your own report.' });
  return null;
}

// GET /api/reports/export/pdf[?userId=]
async function exportPdf(req, res, next) {
  try {
    const targetUserId = await resolveExportTarget(req, res);
    if (targetUserId === null) return; // response already sent by resolveExportTarget
    const bundle = await buildReportBundle(targetUserId);
    if (!bundle.user) return res.status(404).json({ message: 'User not found.' });

    const filename = `skin-intelligence-report-${new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    renderSkinIntelligencePdf(bundle, res);
  } catch (err) {
    next(err);
  }
}

// GET /api/reports/export/excel[?userId=]
async function exportExcel(req, res, next) {
  try {
    const targetUserId = await resolveExportTarget(req, res);
    if (targetUserId === null) return;
    const bundle = await buildReportBundle(targetUserId);
    if (!bundle.user) return res.status(404).json({ message: 'User not found.' });

    const buffer = await buildSkinIntelligenceWorkbook(bundle);
    const filename = `skin-intelligence-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    next(err);
  }
}

module.exports = { exportPdf, exportExcel };
