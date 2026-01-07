// Territory model: pure normalization helpers
// Doctrine: no I/O, no global state, deterministic normalization.

/**
 * @typedef {Object} Territory
 * @property {string} territoryId
 * @property {('county'|'city'|'custom')} type
 * @property {string} name
 * @property {string|null} [fips]
 * @property {string[]} moderators // userIds
 */

const ALLOWED_TYPES = new Set(['county', 'city', 'custom']);

function normalizeType(type) {
  if (typeof type !== 'string') return 'custom';
  if (ALLOWED_TYPES.has(type)) return type;
  return 'custom';
}

function normalizeId(id) {
  if (typeof id !== 'string' || !id.trim()) {
    throw new Error('territoryId must be a non-empty string');
  }
  return id.trim();
}

function normalizeName(name) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('territory name must be a non-empty string');
  }
  return name.trim();
}

function normalizeFips(fips) {
  if (fips == null) return null;
  if (typeof fips !== 'string') return null;
  const trimmed = fips.trim();
  return trimmed || null;
}

function normalizeModerators(mods) {
  if (!Array.isArray(mods)) return [];
  const cleaned = mods
    .filter((m) => typeof m === 'string')
    .map((m) => m.trim())
    .filter((m) => m.length > 0);
  const dedup = Array.from(new Set(cleaned));
  dedup.sort();
  return dedup;
}

/**
 * Normalize a raw territory definition into a canonical Territory object.
 *
 * @param {Partial<Territory> & { territoryId: string, name: string, type?: string }} input
 * @returns {Territory}
 */
export function normalizeTerritory(input) {
  const territoryId = normalizeId(input.territoryId);
  const type = normalizeType(input.type || 'custom');
  const name = normalizeName(input.name);
  const fips = normalizeFips(input.fips);
  const moderators = normalizeModerators(input.moderators || []);

  /** @type {Territory} */
  const territory = {
    territoryId,
    type,
    name,
    fips,
    moderators,
  };

  return Object.freeze(territory);
}

/**
 * Normalize an array of raw territory definitions.
 * Returns a new array; input is never mutated.
 *
 * @param {Array<Partial<Territory> & { territoryId: string, name: string, type?: string }>} defs
 * @returns {Territory[]}
 */
export function normalizeTerritories(defs) {
  const list = Array.isArray(defs) ? defs.map(normalizeTerritory) : [];
  // Deterministic order by territoryId
  return list.slice().sort((a, b) => (a.territoryId < b.territoryId ? -1 : a.territoryId > b.territoryId ? 1 : 0));
}
