import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { bloodTiesCatalogue as catalogue } from '../js/blood-ties-catalogue.js';
import { bloodTiesBoards } from '../js/blood-ties-boards.js';
import { buildDailyBloodTiesPuzzle, countBloodTiesSolutions, replayBloodTiesAttempts, normalizeBloodTiesSession } from '../js/blood-ties-core.js';
import { buildDailyBloodTiesPuzzle as historicalPuzzle } from '../js/blood-ties-legacy.js';
import { isApiFile } from '../scripts/lib/release-tools.mjs';

test('compiled pool is reproducible and every workbook category participates in unique boards', () => {
  execFileSync(process.execPath, ['scripts/generate-blood-ties.mjs', '--check']);
  const source = new Map(catalogue.connections.map(g => [g.id, g]));
  const seen = new Set();
  assert.equal(bloodTiesBoards.sourceSha256, catalogue.sourceSha256);
  assert.equal(bloodTiesBoards.boards.length, 4096);
  for (const board of bloodTiesBoards.boards) {
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
  }
  assert.equal(seen.size, 164);
});

test('three years preserve 14-day category and 7-day tile gaps, traps, difficulty and full coverage', () => {
  const history = [], seen = new Set();
  for (let i = 0; i < 1096; i++) {
    const date = new Date(Date.UTC(2026, 9, 23 + i)).toISOString().slice(0, 10);
    const p = buildDailyBloodTiesPuzzle(date);
    assert.equal(p.contentVersion, 2);
    assert.ok(p.redHerrings.length >= 2);
    for (const previous of history.slice(-14)) assert.ok(p.groups.every(g => !previous.groups.some(h => h.id === g.id)), date);
    for (const previous of history.slice(-7)) assert.ok(p.tiles.every(t => !previous.tiles.includes(t)), date);
    if (i < 7) assert.ok(p.tiles.every(t => !historicalPuzzle('2026-10-22').tiles.includes(t)), date);
    for (const g of p.groups) {
      seen.add(g.id);
      assert.ok(g.answers.every(t => catalogue.connections.find(c => c.id === g.id).tiles.includes(t)));
    }
    history.push(p);
  }
  assert.equal(seen.size, 164);
  const expected = JSON.stringify(buildDailyBloodTiesPuzzle('2026-10-25'));
  buildDailyBloodTiesPuzzle('2026-12-25').groups[0].answers.reverse();
  assert.equal(JSON.stringify(buildDailyBloodTiesPuzzle('2026-10-25')), expected);
});

test('content boundary preserves history and new puzzles cannot downgrade scoring or skip the last trio', () => {
  assert.equal(buildDailyBloodTiesPuzzle('2026-10-22').key, '2026-10-22:blood:v1:e5c1e9fd');
  assert.deepEqual(buildDailyBloodTiesPuzzle('2026-10-22'), historicalPuzzle('2026-10-22'));
  const p = buildDailyBloodTiesPuzzle('2026-10-25');
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
  for (const name of ['blood-ties-core', 'blood-ties-boards', 'blood-ties-catalogue', 'blood-ties-catalogue-v1', 'blood-ties-legacy']) {
    assert.equal(isApiFile(`js/${name}.js`), true);
  }
});
