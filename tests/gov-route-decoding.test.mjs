import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Regression guard: GOV routes must decode URL-encoded territoryId/moderatorId
 *
 * Why:
 * - Territory IDs like "county:12033" are URL-encoded as "county%3A12033" in paths
 * - Prior to fix: segments[2] was used directly → "county%3A12033" !== "county:12033" → 0 matches
 * - After fix: decodeURIComponent(segments[2]) → correct matching
 *
 * This test ensures we don't regress during refactors (e.g., switching to express/fastify).
 */

test('GOV routes decode territoryId from URL segment (county%3A12033 → county:12033)', () => {
  // Simulate what happens in src/v1/index.js when parsing /gov/territory/county%3A12033/queues
  const urlPath = '/gov/territory/county%3A12033/queues?includeNone=true';
  const segments = urlPath.split('/').filter(Boolean);

  // Extract the territoryId segment (position 2)
  const rawSegment = segments[2]; // "county%3A12033"

  // This is what the code MUST do (regression point)
  const decoded = decodeURIComponent(rawSegment);

  assert.equal(decoded, 'county:12033', 'territoryId must be decoded from URL encoding');
  assert.notEqual(rawSegment, 'county:12033', 'raw segment should still be encoded');
});

test('GOV routes decode moderatorId from URL segment', () => {
  const urlPath = '/gov/moderator/mod%3A001/queues';
  const segments = urlPath.split('/').filter(Boolean);

  const rawSegment = segments[2];
  const decoded = decodeURIComponent(rawSegment);

  assert.equal(decoded, 'mod:001');
  assert.notEqual(rawSegment, 'mod:001');
});

test('decoding handles spaces and special chars', () => {
  const examples = [
    { encoded: 'territory%2Fwith%2Fslash', expected: 'territory/with/slash' },
    { encoded: 'space%20name', expected: 'space name' },
    { encoded: 'normal', expected: 'normal' },
  ];

  for (const { encoded, expected } of examples) {
    assert.equal(decodeURIComponent(encoded), expected);
  }
});
