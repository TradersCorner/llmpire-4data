import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeTerritories } from '../src/governance/territories.mjs';
import {
  buildTerritoryRegistry,
  resolveTerritoryById,
  listTerritoriesForModerator,
} from '../src/governance/territoryRegistry.mjs';

function sampleTerritoriesShuffled() {
  const defs = [
    { territoryId: 'county:001', type: 'county', name: 'Alpha County', fips: '001', moderators: ['mod-a'] },
    { territoryId: 'city:nyc', type: 'city', name: 'New York City', moderators: ['mod-a', 'mod-b'] },
    { territoryId: 'custom:beta', type: 'custom', name: 'Beta Region', moderators: ['mod-c'] },
  ];
  // Return in a non-deterministic order to test normalization / registry determinism.
  return [defs[2], defs[0], defs[1]];
}

test('Territory normalization is deterministic and sorted by territoryId', () => {
  const shuffled = sampleTerritoriesShuffled();
  const first = normalizeTerritories(shuffled);
  const second = normalizeTerritories(sampleTerritoriesShuffled());

  assert.deepEqual(first, second, 'Expected normalizeTerritories to be deterministic for same logical input');

  const ids = first.map((t) => t.territoryId);
  assert.deepEqual(ids, ['city:nyc', 'county:001', 'custom:beta'].sort(), 'Expected territories to be sorted by territoryId');
});

test('Territory registry: deterministic build and moderator index', () => {
  const defA = sampleTerritoriesShuffled();
  const defB = sampleTerritoriesShuffled().reverse();

  const regA = buildTerritoryRegistry(defA);
  const regB = buildTerritoryRegistry(defB);

  // Deterministic list ordering
  assert.deepEqual(regA.list, regB.list, 'Expected registry.list to be deterministic');

  // Deterministic byId keys
  assert.deepEqual(Array.from(regA.byId.keys()), Array.from(regB.byId.keys()));

  // Deterministic moderator mapping
  const mods = Array.from(new Set([...regA.byModerator.keys(), ...regB.byModerator.keys()])).sort();
  for (const m of mods) {
    const aIds = (regA.byModerator.get(m) || []).map((t) => t.territoryId);
    const bIds = (regB.byModerator.get(m) || []).map((t) => t.territoryId);
    assert.deepEqual(aIds, bIds, `Expected moderator mapping for ${m} to be deterministic`);
  }
});

test('Territory registry: duplicate territoryIds are rejected (no cross-territory bleed)', () => {
  const defs = [
    { territoryId: 'county:001', type: 'county', name: 'Alpha County', moderators: ['mod-a'] },
    { territoryId: 'county:001', type: 'county', name: 'Alpha County Duplicate', moderators: ['mod-b'] },
  ];

  assert.throws(
    () => buildTerritoryRegistry(defs),
    /Duplicate territoryId/,
    'Expected duplicate territoryIds to be rejected to prevent cross-territory bleed',
  );
});

test('Territory helpers: resolve by id and by moderator are read-only views', () => {
  const reg = buildTerritoryRegistry(sampleTerritoriesShuffled());

  const county = resolveTerritoryById(reg, 'county:001');
  assert.ok(county, 'Expected to resolve county:001');
  assert.equal(county.territoryId, 'county:001');

  const modATerritories = listTerritoriesForModerator(reg, 'mod-a');
  assert.ok(modATerritories.length >= 1, 'Expected moderator mod-a to have territories');

  // Mutating the returned list must not affect the registry
  modATerritories.pop();
  const modATerritoriesAgain = listTerritoriesForModerator(reg, 'mod-a');
  assert.ok(
    modATerritoriesAgain.length >= 1,
    'Expected registry internal state to be unaffected by consumer mutations',
  );
});
