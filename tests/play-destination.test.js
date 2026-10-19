import test from 'node:test';
import assert from 'node:assert/strict';
import { rememberPlayDestination, restorePlayDestination } from '../js/play-destination.js';
const day = { officialType: 'word', officialCompleted: true, sessions: { word: {}, easter: {} } };
function memory() { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; }
test('both just-for-fun destinations restore only after the official puzzle is complete', () => {
  for (const type of ['word', 'easter']) {
    const s = memory(), state = { ...day, officialType: type === 'word' ? 'easter' : 'word' };
    rememberPlayDestination(s, '2026-10-19', { type, mode: 'for_fun' });
    assert.deepEqual(restorePlayDestination(s, '2026-10-19', state), { type, mode: 'for_fun' });
    assert.equal(restorePlayDestination(s, '2026-10-19', { ...state, officialCompleted: false }), null);
    assert.equal(restorePlayDestination(s, '2026-10-20', state), null);
  }
});
test('hub and official result destinations survive refresh without unlocking another puzzle', () => {
  const s = memory(); rememberPlayDestination(s, '2026-10-19', { screen: 'hub' });
  assert.deepEqual(restorePlayDestination(s, '2026-10-19', day), { screen: 'hub' });
  rememberPlayDestination(s, '2026-10-19', { type: 'word', mode: 'official' });
  assert.deepEqual(restorePlayDestination(s, '2026-10-19', day), { type: 'word', mode: 'official' });
  assert.equal(restorePlayDestination(s, '2026-10-19', { ...day, officialType: 'easter' }), null);
});
test('corrupt, missing-session and unavailable destination storage safely uses official entry', () => {
  const s = memory(); rememberPlayDestination(s, '2026-10-19', { type: 'easter', mode: 'for_fun' });
  assert.equal(restorePlayDestination(s, '2026-10-19', { ...day, sessions: {} }), null);
  s.setItem('the-daily-undead:play-destination:2026-10-19', '{'); assert.equal(restorePlayDestination(s, '2026-10-19', day), null);
  const denied = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } };
  assert.doesNotThrow(() => rememberPlayDestination(denied, 'date', {})); assert.equal(restorePlayDestination(denied, 'date', day), null);
});

test('unfinished fun saves from before this release resume without a navigation marker', () => {
  const s = memory();
  assert.deepEqual(restorePlayDestination(s, '2026-10-19', { ...day, sessions: { easter: { phase: 'clues', cluesRevealed: 2 } } }), { type: 'easter', mode: 'for_fun' });
  assert.deepEqual(restorePlayDestination(s, '2026-10-19', { officialType: 'easter', officialCompleted: true, sessions: { word: { guesses: ['Q'], complete: false } } }), { type: 'word', mode: 'for_fun' });
  assert.equal(restorePlayDestination(s, '2026-10-19', { ...day, sessions: { easter: { phase: 'clues', cluesRevealed: 1 } } }), null);
  assert.equal(restorePlayDestination(s, '2026-10-19', { ...day, sessions: { easter: { phase: 'result', isCorrect: false } } }), null);
});
