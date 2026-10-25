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
import { createBloodTiesFairnessChecker } from '../js/blood-ties-fairness.js';

test('compiled pool is reproducible and every workbook category participates in unique boards', () => {
  execFileSync(process.execPath, ['scripts/generate-blood-ties.mjs', '--check']);
  const source = new Map(catalogue.connections.map(g => [g.id, g]));
  const seen = new Set();
  const inspect = createBloodTiesFairnessChecker(catalogue.connections);
  assert.equal(bloodTiesBoards.sourceSha256, catalogue.sourceSha256);
  assert.equal(bloodTiesBoards.boards.length, 4096);
  for (const [index,board] of bloodTiesBoards.boards.entries()) {
    const groups = board.map(([id, ...indices]) => {
      const g = source.get(id); seen.add(id);
      assert.ok(indices.every(i => Number.isInteger(i) && g.tiles[i]));
      return { ...g, answers: indices.map(i => g.tiles[i]) };
    });
    const tiles = groups.flatMap(g => g.answers);
    // Shared membership never creates indistinguishable buttons with secret owners.
    assert.equal(new Set(tiles.map(t => t.normalize('NFKC').toLowerCase().replaceAll('’', "'"))).size, 12);
    assert.equal(countBloodTiesSolutions(groups, tiles), 1);
    assert.deepEqual(groups.map(g => g.difficulty).sort(), [1, 2, 2, 3]);
    assert.ok(groups.every(g => groups.filter(other => other.family === g.family).length <= 2));
    const fairness = inspect(groups);
    assert.equal(fairness.alternative, false, `board ${index}`);
    assert.equal(fairness.easyClear, true, `board ${index}`);
    assert.ok(fairness.maxVisible <= 5, `board ${index}`);
    assert.equal(bloodTiesBoards.ambiguity[index], fairness.rejectedTrios);
  }
  assert.equal(seen.size, catalogue.connections.length);
});

test('three years preserve 14-day category and 7-day tile gaps, traps, difficulty and full coverage', () => {
  const history = [], seen = new Set();
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
    assert.ok(p.redHerrings.length >= 2);
    for (const previous of history.slice(-14)) assert.ok(p.groups.every(g => !previous.groups.some(h => h.id === g.id)), date);
    for (const previous of history.slice(-7)) assert.ok(p.tiles.every(t => !previous.tiles.includes(t)), date);
    for (const g of p.groups) {
      seen.add(g.id);
      assert.ok(g.answers.every(t => catalogue.connections.find(c => c.id === g.id).tiles.includes(t)));
    }
    history.push(p);
  }
  assert.equal(seen.size, catalogue.connections.length);
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
  for (const name of ['blood-ties-core', 'blood-ties-boards', 'blood-ties-catalogue', 'blood-ties-catalogue-v1', 'blood-ties-legacy', 'blood-ties-content', 'blood-ties-fairness', 'blood-ties-v2', 'blood-ties-catalogue-v2', 'blood-ties-boards-v2']) {
    assert.equal(isApiFile(`js/${name}.js`), true);
  }
});
