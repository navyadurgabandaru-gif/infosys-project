/**
 * Ingredient Intelligence service.
 *
 * Two responsibilities:
 *  1. Catalog access — search/filter/get against the `ingredients` table
 *     (backs GET /api/ingredients and GET /api/ingredients/:id).
 *  2. Personalized evaluation — given a user's skin type/concerns/
 *     allergies, classify every catalog ingredient as suitable, use-with-
 *     caution, or to-avoid, with a plain-language reason for each
 *     (backs GET /api/ingredients/for-me).
 *
 * `normalizeTerms` / `textConflicts` are the same free-text allergy/avoid
 * matching primitives routineGenerator.js already used internally (as
 * `normalizeAllergies` / `stepConflicts`) — they're centralized here and
 * routineGenerator.js now delegates to them, so there is exactly one
 * implementation of "does this ingredient/product text conflict with a
 * declared allergy term" for the whole app. routineGenerator.js's own
 * rule-based routine-building logic (which steps go where, per-concern
 * overrides, seasonal library, etc.) is untouched.
 */

const pool = require('../config/db');

function normalizeTerms(list = []) {
  return list.map((t) => String(t || '').trim().toLowerCase()).filter(Boolean);
}

// Returns the first matching term found in the given text fragments, or
// null. `haystackParts` may contain strings, arrays of strings, or
// null/undefined — all are flattened and lowercased before matching.
function textConflicts(haystackParts, terms) {
  if (!terms || !terms.length) return null;
  const haystack = []
    .concat(...haystackParts.map((p) => (Array.isArray(p) ? p : [p])))
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return terms.find((term) => haystack.includes(term)) || null;
}

async function searchIngredients({ q, skinType, concern, category } = {}) {
  const clauses = [];
  const params = [];

  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    clauses.push(`(LOWER(name) LIKE $${params.length} OR LOWER(description) LIKE $${params.length})`);
  }
  if (category) {
    params.push(category);
    clauses.push(`category = $${params.length}`);
  }
  if (skinType) {
    params.push(JSON.stringify(skinType));
    clauses.push(`suitable_skin_types @> $${params.length}::jsonb`);
  }
  if (concern) {
    params.push(JSON.stringify(concern.toLowerCase()));
    clauses.push(`suitable_concerns @> $${params.length}::jsonb`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await pool.query(`SELECT * FROM ingredients ${where} ORDER BY name ASC`, params);
  return rows;
}

async function getIngredientById(id) {
  const { rows } = await pool.query('SELECT * FROM ingredients WHERE id = $1', [id]);
  return rows[0] || null;
}

// ---------------------------------------------------------------------
// Ingredient Interaction Analysis
// ---------------------------------------------------------------------
// Resolves each ingredient's `avoid_with` free-text terms (already a real,
// seeded column — e.g. Retinol.avoid_with = ['benzoyl peroxide']) against
// the actual ingredient catalog by name match, and turns that into a
// proper pairwise interaction structure: ingredientA, ingredientB,
// interaction type, severity, explanation, usage guidance. Severity is
// derived from each ingredient's own real `irritation_potential` column
// rather than invented per-pair — no interaction is asserted that isn't
// backed by an actual avoid_with entry in the database.
function resolveInteractionPairs(allIngredients) {
  const byLowerName = new Map(allIngredients.map((ing) => [ing.name.toLowerCase(), ing]));
  const seenPairKeys = new Set();
  const pairs = [];

  allIngredients.forEach((ingA) => {
    (ingA.avoid_with || []).forEach((term) => {
      const termLower = String(term || '').trim().toLowerCase();
      if (!termLower) return;

      // Match the free-text avoid_with term against real catalog
      // ingredients by substring, in either direction (handles e.g.
      // "vitamin c" matching a catalog entry named "Vitamin C (L-Ascorbic Acid)").
      const matches = allIngredients.filter(
        (ingB) =>
          ingB.id !== ingA.id &&
          (ingB.name.toLowerCase().includes(termLower) || termLower.includes(ingB.name.toLowerCase()))
      );

      matches.forEach((ingB) => {
        const key = [ingA.id, ingB.id].sort((a, b) => a - b).join('-');
        if (seenPairKeys.has(key)) return;
        seenPairKeys.add(key);

        const severity =
          ingA.irritation_potential === 'high' || ingB.irritation_potential === 'high' ? 'high' : 'moderate';

        pairs.push({
          ingredient_a: { id: ingA.id, name: ingA.name },
          ingredient_b: { id: ingB.id, name: ingB.name },
          interaction_type: 'avoid_combination',
          severity,
          explanation: `${ingA.name} is flagged to avoid combining with ${ingB.name} — using both in the same routine can increase irritation risk or reduce effectiveness.`,
          recommended_usage: severity === 'high'
            ? `Use on alternating days (e.g. ${ingA.name} AM, ${ingB.name} PM), or introduce one at a time and patch test.`
            : `Space these out within your routine (different steps/times of day) rather than layering them together.`,
        });
      });
    });
  });

  return { pairs, byLowerName };
}

async function getAllIngredientInteractions() {
  const { rows } = await pool.query('SELECT * FROM ingredients');
  return resolveInteractionPairs(rows).pairs;
}

async function getInteractionsForIngredientId(id) {
  const all = await getAllIngredientInteractions();
  return all.filter((p) => p.ingredient_a.id === Number(id) || p.ingredient_b.id === Number(id));
}

// Personalized check: given the ingredient NAMES actually present across
// a user's currently recommended products (real data — products.ingredients),
// resolves each name to a catalog ingredient (best-effort substring match)
// and returns only the interaction pairs where BOTH sides are ingredients
// the user is actually being recommended right now — i.e. a real,
// actionable conflict in their own routine, not a generic catalog list.
async function getInteractionsForNames(names) {
  const { rows: allIngredients } = await pool.query('SELECT * FROM ingredients');
  const { pairs } = resolveInteractionPairs(allIngredients);

  const normalizedNames = normalizeTerms(names);
  const matchesUserSet = (ing) =>
    normalizedNames.some((n) => ing.name.toLowerCase().includes(n) || n.includes(ing.name.toLowerCase()));

  return pairs.filter((p) => matchesUserSet(p.ingredient_a) && matchesUserSet(p.ingredient_b));
}

/**
 * Classifies every ingredient in the catalog against one user's profile.
 * @param {object} profile
 * @param {string} [profile.skinType]
 * @param {Array<{name:string}>|string[]} [profile.concerns]
 * @param {string[]} [profile.allergies] — free-text ingredients/terms to avoid
 * @returns {Promise<{suitable: object[], caution: object[], avoid: object[]}>}
 */
async function getPersonalizedIngredients({ skinType, concerns = [], allergies = [] } = {}) {
  const { rows: allIngredients } = await pool.query('SELECT * FROM ingredients ORDER BY name ASC');

  const allergyTerms = normalizeTerms(allergies);
  const concernNames = normalizeTerms(
    (concerns || []).map((c) => (typeof c === 'string' ? c : c.name))
  );

  const suitable = [];
  const caution = [];
  const avoid = [];

  allIngredients.forEach((ing) => {
    const conflict = textConflicts([ing.name, ing.allergy_notes], allergyTerms);
    if (conflict) {
      avoid.push({ ...ing, reason: `Conflicts with an ingredient/term you asked to avoid: "${conflict}".` });
      return;
    }

    const matchesSkinType = skinType && (ing.suitable_skin_types || []).includes(skinType);
    const matchedConcerns = (ing.suitable_concerns || []).filter((c) =>
      concernNames.some((cn) => cn.includes(c) || c.includes(cn))
    );

    if (ing.irritation_potential === 'high' && !matchedConcerns.length) {
      caution.push({
        ...ing,
        reason: 'Higher-irritation ingredient without a clear match to your current concerns — introduce gradually if you choose to use it.',
      });
      return;
    }

    if (matchesSkinType || matchedConcerns.length) {
      const reasonParts = [];
      if (matchesSkinType) reasonParts.push(`suits ${skinType.toLowerCase()} skin`);
      if (matchedConcerns.length) reasonParts.push(`targets ${matchedConcerns.join(', ')}`);
      suitable.push({ ...ing, reason: `Good fit — ${reasonParts.join(' and ')}.` });
    } else if (ing.irritation_potential === 'high') {
      caution.push({ ...ing, reason: 'A stronger active — patch test and introduce gradually.' });
    } else {
      suitable.push({ ...ing, reason: 'Generally well tolerated and compatible with most routines.' });
    }
  });

  return { suitable, caution, avoid };
}

// ---------------------------------------------------------------------
// Ingredient Education
// ---------------------------------------------------------------------
// Shapes one ingredient's already-real catalog fields into a structured
// education record (what it is / what it does / benefits / suitable
// skin types & concerns / usage / precautions / irritation / interaction
// warnings). No new content is invented — this is the same `ingredients`
// row plus its real interaction pairs, organized for a dedicated
// education view instead of scattered across a generic card.
async function getIngredientEducation(id) {
  const ingredient = await getIngredientById(id);
  if (!ingredient) return null;
  const interactions = await getInteractionsForIngredientId(id);

  return {
    id: ingredient.id,
    name: ingredient.name,
    category: ingredient.category,
    what_it_is: ingredient.description || 'No description on file for this ingredient yet.',
    what_it_does: ingredient.benefits || [],
    suitable_skin_types: ingredient.suitable_skin_types || [],
    suitable_concerns: ingredient.suitable_concerns || [],
    how_its_used: ingredient.usage_guidance || 'No specific usage guidance on file — introduce gradually and patch test.',
    irritation_potential: ingredient.irritation_potential || 'low',
    comedogenic_rating: ingredient.comedogenic_rating,
    precautions: ingredient.allergy_notes || null,
    interaction_warnings: interactions,
  };
}

module.exports = {
  normalizeTerms,
  textConflicts,
  searchIngredients,
  getIngredientById,
  getPersonalizedIngredients,
  getAllIngredientInteractions,
  getInteractionsForIngredientId,
  getInteractionsForNames,
  getIngredientEducation,
};
