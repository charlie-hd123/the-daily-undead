import test from 'node:test';
import assert from 'node:assert/strict';
import { rememberPlayDestination, restorePlayDestination } from '../js/play-destination.js';

const date = '2026-10-25';
function memory() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

for (const officialType of ['word', 'easter', 'blood']) {
  test(`${officialType}: completed official results take priority over every previous screen`, () => {
    const extraTypes = ['word', 'easter', 'blood'].filter((type) => type !== officialType);
    for (const success of [true, false]) {
      const day = {
        dateKey: date, officialType, officialCompleted: true,
        sessions: {
          [officialType]: { complete: true, success },
          ...Object.fromEntries(extraTypes.map((type) => [type, { complete: false, guesses: ['Q'], attempts: [['a', 'b', 'c']], cluesRevealed: 2 }])),
        },
      };
      const before = structuredClone(day);
      for (const destination of [{ screen: 'hub' }, ...extraTypes.map((type) => ({ type, mode: 'for_fun' })), { type: officialType, mode: 'official' }]) {
        const storage = memory();
        rememberPlayDestination(storage, date, destination);
        assert.deepEqual(restorePlayDestination(storage, date, day), { type: officialType, mode: 'official' });
        assert.deepEqual(day, before, 'refresh must retain every official and just-for-fun save');
      }
    }
  });

  test(`${officialType}: unfinished official play resumes without altering its saved state`, () => {
    const day = { dateKey: date, officialType, officialCompleted: false, sessions: { [officialType]: { guesses: ['F'], phase: 'result', bonusComplete: false } } };
    const before = structuredClone(day), storage = memory();
    rememberPlayDestination(storage, date, { screen: 'hub' });
    assert.deepEqual(restorePlayDestination(storage, date, day), { type: officialType, mode: 'official' });
    assert.deepEqual(day, before);
  });
}

test('missing, corrupt and unavailable navigation storage cannot change official entry', () => {
  const day = { dateKey: date, officialType: 'word', officialCompleted: true, sessions: { word: { complete: true }, blood: { attempts: [['a', 'b', 'c']] } } };
  const storage = memory();
  for (const value of [null, '{', JSON.stringify({ screen: 'hub' })]) {
    if (value !== null) storage.setItem(`the-daily-undead:play-destination:${date}`, value);
    assert.deepEqual(restorePlayDestination(storage, date, day), { type: 'word', mode: 'official' });
  }
  const denied = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } };
  assert.doesNotThrow(() => rememberPlayDestination(denied, date, {}));
  assert.deepEqual(restorePlayDestination(denied, date, day), { type: 'word', mode: 'official' });
  assert.equal(restorePlayDestination(storage, '2026-10-26', day), null);
  assert.equal(restorePlayDestination(storage, date, { officialType: 'invalid' }), null);
});
