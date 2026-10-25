import test from 'node:test';
import assert from 'node:assert/strict';
import { bloodTiesCategoriesTooSimilar, createBloodTiesFairnessChecker, passesBloodTiesFairness } from '../js/blood-ties-fairness.js';
import { buildDailyBloodTiesPuzzle as oldPuzzle } from '../js/blood-ties-v2.js';
import { bloodTiesCatalogue as oldCatalogue } from '../js/blood-ties-catalogue-v2.js';
import { bloodTiesCatalogue as catalogue } from '../js/blood-ties-catalogue.js';

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

test('both photographed frustrating boards are excluded even though each has a unique full solution', () => {
  const byId = new Map(catalogue.connections.map(g => [g.id,g]));
  const inspect = createBloodTiesFairnessChecker(catalogue.connections);
  const photos = [
    [['0044',['Monkey Bomb',"Li'l Arnie",'Homunculus']],['0053',['Nero Blackstone','Jessica Rose','Floyd Campbell']],['0092',['Magmagat','Blundergat','Sundergat']],['0083',['GKZ-45 Mk3','LT53 Kazimir','Gersh Device']]],
    [['0050',['Ultimis Nikolai','Ultimis Dempsey','Ultimis Richtofen']],['0157',['Mister Peeks','Wisp Tea','Hellping Hound']],['0008',['Origins','Shangri-La','Moon']],['0119',['Dead of the Night','Kino der Toten','Ascension']]],
  ];
  for (const photo of photos) {
    const groups = photo.map(([id,answers]) => ({...byId.get(id),answers}));
    const fairness = inspect(groups);
    assert.equal(fairness.alternative, false);
    assert.equal(fairness.maxChosenVisible, 5);
    assert.ok(fairness.similarPairs.length > 0);
    assert.equal(passesBloodTiesFairness(fairness), false);
  }
});

test('an unchosen category with five visible matches is also excluded', () => {
  const groups = ['ABC','DEF','GHI','JKL'].map((s,i) => ({id:String(i),difficulty:i===0?1:2,tiles:[...s],answers:[...s]}));
  const fairness = createBloodTiesFairnessChecker([...groups,{id:'outside',tiles:[...'ABCDE']}])(groups);
  assert.equal(fairness.alternative, false);
  assert.equal(fairness.maxChosenVisible, 3);
  assert.equal(fairness.maxVisible, 5);
  assert.equal(passesBloodTiesFairness(fairness), false);
});

test('light boards and one-tile overlaps remain valid; two overlaps must be spread across categories', () => {
  const groups = ['ABC','DEF','GHI','JKL'].map((s,i) => ({id:String(i),difficulty:i===0?1:2,tiles:[...s],answers:[...s]}));
  const inspect = () => createBloodTiesFairnessChecker(groups)(groups);
  assert.equal(passesBloodTiesFairness(inspect()), true);
  groups[1].tiles.push('C');
  assert.equal(inspect().redHerringCount, 1);
  assert.equal(passesBloodTiesFairness(inspect()), true);
  groups[3].tiles.push('I');
  assert.equal(inspect().redHerringCount, 2);
  assert.equal(inspect().maxVisible, 4);
  assert.equal(passesBloodTiesFairness(inspect()), true);
});

test('heavily shared category lists are excluded while a single incidental overlap is allowed', () => {
  const a = {tiles:['A','B','C','D']};
  assert.equal(bloodTiesCategoriesTooSimilar(a,{tiles:['A','B','E','F','G','H']}), true);
  assert.equal(bloodTiesCategoriesTooSimilar(a,{tiles:['A','B','C']}), true);
  assert.equal(bloodTiesCategoriesTooSimilar(a,{tiles:['A','E','F']}), false);
});
