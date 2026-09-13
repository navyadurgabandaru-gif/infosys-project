const pool = require('../config/db');

/**
 * True if `providerId` (a DOCTOR or CONSULTANT user id) has an existing
 * care relationship with `targetUserId` — the same relationship already
 * used by doctorController/consultantController to scope their patient
 * lists: the target has booked an appointment with this provider, or
 * this provider has already reviewed one of the target's skin reports.
 * This is the authorization check for provider-initiated data access
 * (e.g. exporting a patient/client's report) — it is enforced here on
 * the backend, not left to the frontend to hide a button.
 */
async function hasProviderAccess(providerId, targetUserId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM appointments WHERE provider_id = $1 AND user_id = $2
     UNION
     SELECT 1 FROM skin_reports WHERE reviewed_by = $1 AND user_id = $2
     LIMIT 1`,
    [providerId, targetUserId]
  );
  return rows.length > 0;
}

module.exports = { hasProviderAccess };
