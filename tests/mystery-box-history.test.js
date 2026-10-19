import test from 'node:test';
import assert from 'node:assert/strict';
import { createDailyBoxHistory } from '../js/mystery-box-history.js';
import { createDayPreviewStorage } from '../js/day-preview.js';

const today = { dateKey: '2026-10-19', official: true, fresh: true };
function memoryStorage() {
  const values = new Map();
  return { values, getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)) };
}

test('only a fresh official puzzle can offer the daily box', () => {
  const history = createDailyBoxHistory(memoryStorage());
  assert.equal(history.canOpen(today), true);
  assert.equal(history.canOpen({ ...today, official: false }), false);
  assert.equal(history.canOpen({ ...today, fresh: false }), false);
  assert.equal(history.canOpen({ ...today, dateKey: '' }), false);
});

test('waiting does not consume the reveal; opening persists across reloads and waiting tabs', () => {
  const storage = memoryStorage();
  storage.setItem('score', '270'); storage.setItem('puzzle-progress', 'unchanged');
  const first = createDailyBoxHistory(storage);
  const otherTab = createDailyBoxHistory(storage);
  assert.equal(first.canOpen(today), true);
  assert.equal(first.canOpen(today), true);
  first.markOpened(today.dateKey);
  assert.equal(first.canOpen(today), false);
  assert.equal(otherTab.canOpen(today), false);
  assert.equal(createDailyBoxHistory(storage).canOpen(today), false);
  assert.equal(storage.getItem('score'), '270');
  assert.equal(storage.getItem('puzzle-progress'), 'unchanged');
});

test('the next official day gets a new reveal', () => {
  const history = createDailyBoxHistory(memoryStorage());
  history.markOpened(today.dateKey);
  assert.equal(history.canOpen({ ...today, dateKey: '2026-10-20' }), true);
  assert.equal(history.canOpen(today), false);
});

test('preview receipts never consume the real day’s official reveal', () => {
  const storage = memoryStorage();
  const previewStorage = createDayPreviewStorage(storage, today.dateKey, true);
  const preview = createDailyBoxHistory(previewStorage);
  preview.markOpened(today.dateKey);
  assert.equal(createDailyBoxHistory(previewStorage).canOpen(today), false);
  assert.equal(createDailyBoxHistory(storage).canOpen(today), true);
});

test('blocked storage skips the reveal and leaves normal play available', () => {
  const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const history = createDailyBoxHistory(blocked);
  assert.equal(history.canOpen(today), false);
  assert.equal(history.markOpened(today.dateKey), false);
  assert.equal(history.canOpen(today), false);
  assert.equal(history.canOpen({ ...today, dateKey: '2026-10-20' }), false);
});

test('a quota error or silently discarded receipt cannot start an animation', () => {
  for (const storage of [{ getItem: () => null, setItem() { throw Error('quota'); } }, { getItem: () => null, setItem() {} }]) {
    const history = createDailyBoxHistory(storage);
    assert.equal(history.markOpened(today.dateKey), false);
    assert.equal(history.canOpen(today), false);
  }
});
test('a nonpersistent preview wrapper never offers a box', () => {
  const base = { ...memoryStorage(), persistent: false };
  const preview = createDayPreviewStorage(base, today.dateKey, true);
  assert.equal(createDailyBoxHistory(preview).canOpen(today), false);
});
