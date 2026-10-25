import test from 'node:test';
import assert from 'node:assert/strict';
import { createBloodTiesFairnessChecker } from '../js/blood-ties-fairness.js';
import { buildDailyBloodTiesPuzzle as oldPuzzle } from '../js/blood-ties-v2.js';
import { bloodTiesCatalogue as oldCatalogue } from '../js/blood-ties-catalogue-v2.js';

test('the known six-map alternative partition is rejected across the whole catalogue', () => {
  const puzzle = oldPuzzle('2026-11-06');
  const inspect = createBloodTiesFairnessChecker(oldCatalogue.connections);
  const groups = puzzle.groups.map(g => ({ ...g, tiles: g.eligibleTiles }));
  assert.equal(inspect(groups).alternative, true);
  // The old four-label-only guarantee missed this exact board.
  assert.equal(createBloodTiesFairnessChecker(groups)(groups).alternative, false);
});

test('alternate labels and repeated use of a single broad category are not alternate physical solutions', () => {
  const groups = ['ABC','DEF','GHI','JKL'].map((s,i) => ({ id:String(i), difficulty:i===0?1:2, tiles:[...s], answers:[...s] }));
  const inspect = extra => createBloodTiesFairnessChecker([...groups,...extra])(groups);
  assert.equal(inspect([{id:'alias',tiles:[...'ABC']}]).alternative, false);
  assert.equal(inspect([{id:'one-broad-label',tiles:[...'ABCDEF']}]).alternative, false);
  assert.equal(inspect([{id:'one-broad-label',tiles:[...'ABCDEF']},{id:'second-label',tiles:[...'ABD']}]).alternative, true);
});
