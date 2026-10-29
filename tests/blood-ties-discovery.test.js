import test from 'node:test';
import assert from 'node:assert/strict';
import { bloodTiesCatalogue as catalogue } from '../js/blood-ties-catalogue.js';
import { bloodTiesClueTiles, inspectBloodTiesDiscovery, passesBloodTiesDiscovery, resolveBloodTiesTrioDiscovery } from '../js/blood-ties-discovery.js';
import { createBloodTiesFairnessChecker } from '../js/blood-ties-fairness.js';

const groups = rows => rows.map(([id,...answers]) => ({ ...catalogue.connections.find(g => g.id === id), answers }));
test('both approved name-led examples have discoverable finishes and unique full solutions', () => {
  for (const example of [
    [['0036','Staff of Lightning','Lightning Bow','D.I.E. Electrobolt'],['0037','Staff of Ice',"Winter's Howl",'D.I.E. Cryo-Emitter'],['0024','Mule Kick','Vulture Aid','Victorious Tortoise'],['0094','Speed Cola','Tombstone Soda',"Widow's Wine"]],
    [['0098','Stock Option','Profit Sharing','Extra Credit'],['0070','Dead Again','Dead Flowers','Dead Ended'],['0124','Spider','Deathspinner','Web Mother'],['0158','Burned Out','Blaze Phase','Wild Fire']],
  ]) {
    const board = groups(example), review = inspectBloodTiesDiscovery(board);
    assert.equal(passesBloodTiesDiscovery(review), true);
    assert.equal(review.nameGroups, 4);
    assert.equal(review.finishes.length, 6);
    assert.equal(createBloodTiesFairnessChecker(catalogue.connections)(board).alternative, false);
  }
});

test('the photographed enemy finish is excluded by its pairing, not by pretending it is ambiguous', () => {
  const board = groups([['0073','Zeus','Ra','Danu'],['0090','Sickle','Galvaknuckles','Bowie Knife'],['0040','Mimic','Toxic Zombie','Kommando Klaus'],['0163','Spider','Disciple','Mangler']]);
  assert.equal(createBloodTiesFairnessChecker(catalogue.connections)(board).alternative, false);
  assert.equal(passesBloodTiesDiscovery(inspectBloodTiesDiscovery(board)), false);
});

test('specialist categories remain playable with a discoverable partner, without stacking specialist knowledge', () => {
  const board = groups([['0163','Spider','Disciple','Mangler'],['0124','Vermin','Deathspinner','Web Mother'],['0001','Nacht der Untoten','Verrückt','Der Riese'],['0020','Juggernog','Quick Revive','Speed Cola']]);
  assert.equal(passesBloodTiesDiscovery(inspectBloodTiesDiscovery(board)), true);
  assert.equal(createBloodTiesFairnessChecker(catalogue.connections)(board).alternative, false);
  board[2] = groups([['0118','Mob of the Dead','Gorod Krovi','Classified']])[0];
  assert.equal(inspectBloodTiesDiscovery(board).specialistGroups, 2);
  assert.equal(passesBloodTiesDiscovery(inspectBloodTiesDiscovery(board)), false);
});

test('familiar facts of the same object type and identical visible themes cannot be the final pair', () => {
  const board = groups([['0036','Staff of Lightning','Lightning Bow','D.I.E. Electrobolt'],['0001','Verrückt','Shi No Numa','Der Riese'],['0002','Five','Moon','Kino der Toten'],['0098','Stock Option','Profit Sharing','Extra Credit']]);
  assert.equal(passesBloodTiesDiscovery(inspectBloodTiesDiscovery(board)), false);
  const gods = groups([['0073','Danu','Ra','Zeus'],['0074','Freya','Odin','Thor'],['0098','Stock Option','Profit Sharing','Extra Credit'],['0158','Burned Out','Blaze Phase','Wild Fire']]);
  assert.equal(passesBloodTiesDiscovery(inspectBloodTiesDiscovery(gods)), false);
});

test('the selected tiles must actually carry the promised clues; unknown classifications fail closed', () => {
  const electric = catalogue.connections.find(g => g.id === '0036');
  assert.deepEqual(bloodTiesClueTiles(electric), ['Staff of Lightning','Lightning Bow','D.I.E. Electrobolt']);
  assert.equal(resolveBloodTiesTrioDiscovery({...electric,answers:['Wunderwaffe DG-2','Durendal','Ragnarok DG-4']}).discovery.method, 'familiar');
  assert.equal(resolveBloodTiesTrioDiscovery({...electric,answers:bloodTiesClueTiles(electric)}).discovery.method, 'name');
  const board = groups([['0036','Wunderwaffe DG-2','Durendal','Ragnarok DG-4'],['0070','Dead Again','Dead Flowers','Dead Ended'],['0124','Spider','Deathspinner','Web Mother'],['0158','Burned Out','Blaze Phase','Wild Fire']]);
  assert.equal(passesBloodTiesDiscovery(inspectBloodTiesDiscovery(board)), false);
  assert.throws(() => bloodTiesClueTiles({id:'new',tiles:['A','B','C']}), /needs a discovery classification/);
  assert.throws(() => bloodTiesClueTiles({id:'new',tiles:['A','B','C'],discovery:{method:'name'}}), /theme and clue words/);
});
