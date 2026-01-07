// Territory registry: pure, read-only mapping helpers built on top of Territory.
// Doctrine: no global mutation, deterministic indices derived from input.

import { normalizeTerritories } from './territories.mjs';

/**
 * @typedef {import('./territories.mjs').Territory} Territory
 */

/**
 * @typedef {Object} TerritoryRegistry
 * @property {Territory[]} list            // all territories, sorted by territoryId
 * @property {Map<string, Territory>} byId  // territoryId -> Territory
 * @property {Map<string, Territory[]>} byModerator // moderatorId -> Territory[] (sorted)
 */

/**
 * Build a deterministic, read-only registry from a list of raw territory definitions.
 *
 * - Normalizes all territories.
 * - Rejects duplicate territoryId values.
 * - Builds indices by id and by moderator.
 *
 * @param {Array<Partial<Territory> & { territoryId: string, name: string, type?: string }>} defs
 * @returns {TerritoryRegistry}
 */
export function buildTerritoryRegistry(defs) {
  const territories = normalizeTerritories(defs || []);

  const byId = new Map();
  const byModerator = new Map();

  for (const t of territories) {
    if (byId.has(t.territoryId)) {
      throw new Error(`Duplicate territoryId detected: ${t.territoryId}`);
    }
    byId.set(t.territoryId, t);

    for (const mod of t.moderators) {
      const existing = byModerator.get(mod) || [];
      existing.push(t);
      byModerator.set(mod, existing);
    }
  }

  // Ensure per-moderator lists are deterministically ordered
  for (const [mod, list] of byModerator.entries()) {
    list.sort((a, b) => (a.territoryId < b.territoryId ? -1 : a.territoryId > b.territoryId ? 1 : 0));
    byModerator.set(mod, list);
  }

  return {
    list: territories,
    byId,
    byModerator,
  };
}

/**
 * Resolve a territory by its id from a registry.
 *
 * @param {TerritoryRegistry} registry
 * @param {string} territoryId
 * @returns {Territory|null}
 */
export function resolveTerritoryById(registry, territoryId) {
  if (!registry || typeof territoryId !== 'string') return null;
  return registry.byId.get(territoryId) || null;
}

/**
 * List territories moderated by a given moderator id.
 *
 * @param {TerritoryRegistry} registry
 * @param {string} moderatorId
 * @returns {Territory[]}
 */
export function listTerritoriesForModerator(registry, moderatorId) {
  if (!registry || typeof moderatorId !== 'string') return [];
  const list = registry.byModerator.get(moderatorId) || [];
  // Expose a shallow copy to avoid accidental mutation.
  return list.slice();
}
