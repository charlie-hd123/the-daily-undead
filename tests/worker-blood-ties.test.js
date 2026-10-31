import test from 'node:test';
import assert from 'node:assert/strict';
import { bloodTiesSourceDigest, catalogueFrom, catalogueThrough } from '../scripts/generate-worker-blood-ties.mjs';
import { workerBloodTiesCatalogue as catalogue } from '../worker/src/generated-blood-ties-catalog.js';
import { buildDailyBloodTiesPuzzle as compiledPuzzle } from '../worker/src/blood-ties-puzzles.js';
import { buildDailyBloodTiesPuzzle, createBloodTiesSession, normalizeBloodTiesSession, replayBloodTiesAttempts } from '../js/blood-ties-core.js';
import { sanitizeDailyState } from '../worker/src/accounts.js';

test('compiled Worker puzzles match every shared historical/future assignment in both environments', async () => {
  assert.equal(catalogue.sourceDigest, await bloodTiesSourceDigest(), 'Regenerate the Worker Blood Ties catalogue after changing its inputs.');
  assert.equal(catalogue.from, catalogueFrom);
  assert.equal(catalogue.through, catalogueThrough);
  assert.ok(Date.parse(catalogue.through) > Date.now() + 366 * 86400000, 'Extend and regenerate the compiled range before releasing.');
  for (const production of [false, true]) {
    for (let time = Date.parse(catalogue.from); time <= Date.parse(catalogue.through); time += 86400000) {
      const dateKey = new Date(time).toISOString().slice(0, 10);
      assert.deepEqual(compiledPuzzle(dateKey, { production }), buildDailyBloodTiesPuzzle(dateKey, { production }), `${dateKey}, production=${production}`);
    }
  }
});

test('compiled puzzle callers cannot mutate another request, and out-of-range dates retain existing behaviour', () => {
  for (const production of [false, true]) {
    const options = { production };
    const expected = buildDailyBloodTiesPuzzle('2026-10-31', options);
    const changed = compiledPuzzle('2026-10-31', options);
    changed.groups[0].answers.reverse(); changed.groups[0].eligibleTiles.length = 0; changed.tiles.reverse();
    assert.deepEqual(compiledPuzzle('2026-10-31', options), expected);
    assert.deepEqual(compiledPuzzle('2026-10-21', options), buildDailyBloodTiesPuzzle('2026-10-21', options));
    assert.deepEqual(compiledPuzzle('2030-01-01', options), buildDailyBloodTiesPuzzle('2030-01-01', options));
  }
  assert.throws(() => compiledPuzzle('2026-02-30'), /valid UTC date/);
});

test('progress saves retain empty, selected, interrupted, won and lost Blood Ties sessions', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-31T12:00:00Z') });
  const dateKey = '2026-10-31';
  for (const production of [false, true]) {
    const options = { production };
    const puzzle = buildDailyBloodTiesPuzzle(dateKey, options);
    const empty = createBloodTiesSession(puzzle);
    const selected = { ...empty, selected: puzzle.tiles.slice(0, 2), shuffleCount: 3 };
    const wrongs = [0, 1, 2].map(i => puzzle.groups.slice(0, 3).map(group => group.answers[i]));
    for (const session of [empty, selected, replayBloodTiesAttempts(puzzle, [puzzle.groups[0].answers]),
      replayBloodTiesAttempts(puzzle, puzzle.groups.map(group => group.answers)), replayBloodTiesAttempts(puzzle, wrongs)]) {
      const input = { dayStateVersion: 1, dateKey, officialType: 'word', sessions: { blood: session } };
      const before = structuredClone(input);
      const saved = sanitizeDailyState(input, dateKey, options);
      assert.deepEqual(saved.sessions.blood, normalizeBloodTiesSession(puzzle, session));
      assert.deepEqual(input, before, 'saving must not change the device snapshot');
    }
  }
});
