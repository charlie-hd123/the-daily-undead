import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { bloodTiesCatalogue as catalogue } from '../js/blood-ties-catalogue.js';
import { bloodTiesBoards } from '../js/blood-ties-boards.js';
import { buildDailyBloodTiesPuzzle, countBloodTiesSolutions, replayBloodTiesAttempts, normalizeBloodTiesSession } from '../js/blood-ties-core.js';
import { buildDailyBloodTiesPuzzle as historicalPuzzle } from '../js/blood-ties-legacy.js';
import { isApiFile } from '../scripts/lib/release-tools.mjs';
import { BLOOD_TIES_FAIRNESS_VERSION, createBloodTiesFairnessChecker, passesBloodTiesFairness } from '../js/blood-ties-fairness.js';
import { BLOOD_TIES_DISCOVERY_VERSION, hasBloodTiesCategoryPairs, inspectBloodTiesDiscovery, passesBloodTiesDiscovery, resolveBloodTiesTrioDiscovery } from '../js/blood-ties-discovery.js';

test('compiled pool is reproducible and every category and tile participates in discoverable unique boards', () => {
  execFileSync(process.execPath, ['scripts/generate-blood-ties.mjs', '--check']);
  const source = new Map(catalogue.connections.map(g => [g.id, g]));
  const seen = new Set(), seenTiles = new Set(), seenMemberships = new Set();
  const inspect = createBloodTiesFairnessChecker(catalogue.connections);
  assert.equal(bloodTiesBoards.sourceSha256, catalogue.sourceSha256);
  assert.equal(bloodTiesBoards.fairnessVersion, BLOOD_TIES_FAIRNESS_VERSION);
  assert.equal(bloodTiesBoards.discoveryVersion, BLOOD_TIES_DISCOVERY_VERSION);
  assert.equal(bloodTiesBoards.boards.length, 16384);
  for (const [index,board] of bloodTiesBoards.boards.entries()) {
    const groups = board.map(([id, ...indices]) => {
      const g = source.get(id); seen.add(id);
      assert.ok(indices.every(i => Number.isInteger(i) && g.tiles[i]));
      return resolveBloodTiesTrioDiscovery({ ...g, answers: indices.map(i => g.tiles[i]) });
    });
    const tiles = groups.flatMap(g => g.answers);
    tiles.forEach(tile => seenTiles.add(tile));
    groups.forEach(g => g.answers.forEach(tile => seenMemberships.add(JSON.stringify([g.id,tile]))));
    // Shared membership never creates indistinguishable buttons with secret owners.
    assert.equal(new Set(tiles.map(t => t.normalize('NFKC').toLowerCase().replaceAll('’', "'"))).size, 12);
    assert.equal(countBloodTiesSolutions(groups, tiles), 1);
    const discovery = inspectBloodTiesDiscovery(groups);
    assert.equal(passesBloodTiesDiscovery(discovery), true, `board ${index}`);
    assert.equal(discovery.finishes.length, 6);
    assert.ok(discovery.specialistGroups <= 1);
    assert.ok(discovery.approachableGroups >= 2);
    assert.ok(discovery.literalGroups <= 1);
    assert.equal(bloodTiesBoards.opening[index], discovery.isolatedGroups);
    const fairness = inspect(groups);
    assert.equal(fairness.alternative, false, `board ${index}`);
    assert.ok(fairness.maxVisible <= 4, `board ${index}`);
    assert.equal(fairness.similarPairs.length, 0, `board ${index}`);
    assert.ok(fairness.redHerringCount <= 2, `board ${index}`);
    assert.ok(fairness.rejectedTrios <= 6, `board ${index}`);
    assert.equal(passesBloodTiesFairness({ ...fairness, easyClear: true }), true, `board ${index}`);
    assert.equal(bloodTiesBoards.ambiguity[index], fairness.rejectedTrios);
  }
  assert.deepEqual([...seen].sort(), catalogue.connections.map(g => g.id).sort());
  assert.deepEqual([...seenTiles].sort(), [...new Set(catalogue.connections.flatMap(g => g.tiles))].sort());
  assert.deepEqual([...seenMemberships].sort(), catalogue.connections.flatMap(g => g.tiles.map(tile => JSON.stringify([g.id,tile]))).sort());
});

test('three years preserve 14-day category and 7-day tile gaps, discoverable finishes and full category coverage', () => {
  const history = [], seen = new Set();
  let relatedOpenings = 0, overlappingDays = 0, pairedDays = 0, clearerDays = 0;
  const start = Date.parse(`${catalogue.effectiveDate}T00:00:00Z`);
  for (let date = Math.max(Date.parse('2026-10-22T00:00:00Z'), start - 14 * 86400000); date < start; date += 86400000) {
    const p = buildDailyBloodTiesPuzzle(new Date(date).toISOString().slice(0,10));
    if (p.dateKey === '2026-10-22') p.groups.forEach(g => { g.id = catalogue.connections.find(c => c.name === g.name)?.id || `historical:${g.id}`; });
    history.push(p);
  }
  for (let i = 0; i < 1096; i++) {
    const date = new Date(start + i * 86400000).toISOString().slice(0, 10);
    const p = buildDailyBloodTiesPuzzle(date);
    assert.equal(p.contentVersion, catalogue.version);
    assert.ok(p.redHerrings.length <= 2);
    const discovery = inspectBloodTiesDiscovery(p.groups.map(g => ({ ...g, tiles:g.eligibleTiles })));
    assert.equal(passesBloodTiesDiscovery(discovery), true, date);
    if (discovery.isolatedGroups <= 1) relatedOpenings++;
    if (discovery.approachableGroups >= 3) clearerDays++;
    if (hasBloodTiesCategoryPairs(p.groups)) pairedDays++;
    if (p.redHerrings.length > 0) overlappingDays++;
    for (const previous of history.slice(-14)) assert.ok(p.groups.every(g => !previous.groups.some(h => h.id === g.id)), date);
    for (const previous of history.slice(-7)) assert.ok(p.tiles.every(t => !previous.tiles.includes(t)), date);
    for (const g of p.groups) {
      seen.add(g.id);
      assert.ok(g.answers.every(t => catalogue.connections.find(c => c.id === g.id).tiles.includes(t)));
    }
    history.push(p);
  }
  assert.equal(seen.size, catalogue.connections.length);
  assert.ok(pairedDays > 1096 * .65, 'Two related category pairs should be the usual opening.');
  assert.ok(pairedDays < 1096 * .95, 'Other structures must remain playable for variety and category coverage.');
  assert.ok(relatedOpenings > 1096 * .65, 'Most openings must require more than sorting distinct object types.');
  assert.ok(overlappingDays > 1096 * .5, 'Most days should offer a plausible competing membership, without forcing two overlaps.');
  assert.ok(overlappingDays < 1096 * .7, 'The easier trial must offer more clean splits than the previous overlap-heavy schedule.');
  assert.ok(clearerDays > 1096 * .2 && clearerDays < 1096 * .5, 'A meaningful minority of days should offer a third recognisable connection without making it mandatory.');
  const expected = JSON.stringify(buildDailyBloodTiesPuzzle('2026-10-25'));
  buildDailyBloodTiesPuzzle('2026-12-25').groups[0].answers.reverse();
  assert.equal(JSON.stringify(buildDailyBloodTiesPuzzle('2026-10-25')), expected);
});

test('content boundary preserves history and new puzzles cannot downgrade scoring or skip the last trio', () => {
  const issued = JSON.parse(readFileSync(new URL('./fixtures/blood-ties-issued.json', import.meta.url)));
  for (const [date,hash] of Object.entries(issued)) assert.equal(createHash('sha256').update(JSON.stringify(buildDailyBloodTiesPuzzle(date))).digest('hex'), hash, date);
  assert.equal(buildDailyBloodTiesPuzzle('2026-10-22').key, '2026-10-22:blood:v1:e5c1e9fd');
  assert.deepEqual(buildDailyBloodTiesPuzzle('2026-10-22'), historicalPuzzle('2026-10-22'));
  const p = buildDailyBloodTiesPuzzle('2026-10-28');
  assert.equal(p.contentVersion, 3);
  const attempts = p.groups.map(g => g.answers);
  assert.equal(replayBloodTiesAttempts(p, attempts.slice(0, 3)).complete, false);
  const restored = normalizeBloodTiesSession(p, { ...replayBloodTiesAttempts(p, attempts.slice(0, 2)), selected: attempts[2], points: 999 });
  assert.equal(restored.points, 0);
  assert.deepEqual(restored.selected, attempts[2]);
  assert.equal(replayBloodTiesAttempts(p, attempts).points, 100);
  assert.throws(() => replayBloodTiesAttempts(p, attempts.slice(0, 3), 1), /current rules/);
  assert.throws(() => replayBloodTiesAttempts(p, attempts.slice(0, 3), 2), /current rules/);
});

test('all shared content dependencies participate in the API release fingerprint', () => {
  for (const name of ['blood-ties-core', 'blood-ties-boards', 'blood-ties-catalogue', 'blood-ties-catalogue-v1', 'blood-ties-legacy', 'blood-ties-content', 'blood-ties-fairness', 'blood-ties-discovery', 'blood-ties-v2', 'blood-ties-catalogue-v2', 'blood-ties-boards-v2', 'blood-ties-catalogue-v3', 'blood-ties-boards-v3', 'blood-ties-catalogue-v4', 'blood-ties-boards-v4']) {
    assert.equal(isApiFile(`js/${name}.js`), true);
  }
});
