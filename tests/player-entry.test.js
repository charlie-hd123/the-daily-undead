import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../js/player-entry.js', import.meta.url), 'utf8');
function memory() {
  const values = new Map();
  return { values, get length() { return values.size; }, key: (i) => [...values.keys()][i] ?? null,
    getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: (k) => values.delete(k) };
}
function boot({ storage = memory(), denied = false, reduced = false, hostname = 'thedailyundead.com', search = '', webgl = true, resize = true, inert = true, fonts = true, sessionStorage = memory() } = {}) {
  const attrs = new Map();
  const context = { Date: class extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-19T12:00:00Z'])); } },
    location: { hostname, search }, sessionStorage, URLSearchParams, WebGL2RenderingContext: webgl ? class {} : undefined, ResizeObserver: resize ? class {} : undefined, HTMLElement: { prototype: inert ? { inert: false } : {} }, matchMedia: () => ({ matches: reduced }),
    document: { fonts: fonts ? { load() {}, check() {} } : undefined, documentElement: { setAttribute: (k, v) => attrs.set(k, v) } } };
  Object.defineProperty(context, 'localStorage', { get() { if (denied) throw new Error('SecurityError'); return storage; } });
  vm.runInNewContext(source, context);
  return { ...context.dailyUndeadEntry, attrs, storageBackend: storage };
}
const receipt = 'the-daily-undead:mystery-box-opened:2026-10-19';
test('pre-paint entry shows a fresh box but hides it for an opened daily puzzle', () => {
  const s = memory(); assert.equal(boot({ storage: s }).mode, 'box');
  s.setItem(receipt, '1'); const result = boot({ storage: s });
  assert.equal(result.mode, 'direct'); assert.equal(result.attrs.get('data-player-entry'), 'direct');
  assert.equal(s.getItem(receipt), '1');
  assert.equal([...s.values.keys()].filter((k) => k.includes('storage-probe')).length, 0);
});
test('pre-paint entry respects completed and started puzzle saves without an opening receipt', () => {
  for (const session of [{ guesses: ['Q'] }, { complete: true }, { pendingResult: true }, { phase: 'game' }, { cluesRevealed: 2 }]) {
    const s = memory(); s.setItem('the-daily-undead:multi-puzzle-day:2026-10-19', JSON.stringify({ dayStateVersion: 1, dateKey: '2026-10-19', officialType: 'word', sessions: { word: session } }));
    assert.equal(boot({ storage: s }).mode, 'direct');
  }
});
test('blocked storage getter, quota, blocked reads and silent write loss all skip animation and retain in-page gameplay', () => {
  const quota = memory(); quota.setItem = () => { throw new Error('QuotaExceeded'); };
  const reads = memory(); reads.getItem = () => { throw new Error('SecurityError'); };
  const discard = memory(); discard.setItem = () => {};
  for (const options of [{ denied: true }, { storage: quota }, { storage: reads }, { storage: discard }]) {
    const result = boot(options); assert.equal(result.mode, 'direct'); assert.equal(result.storage.persistent, false);
    result.storage.setItem('test-score', 40); assert.equal(result.storage.getItem('test-score'), '40');
    result.storage.removeItem('test-score'); assert.equal(result.storage.getItem('test-score'), null);
  }
});
test('quota failure keeps existing readable progress and later writes in memory', () => {
  const s = memory(); s.setItem('score', '270'); s.setItem = () => { throw new Error('quota'); };
  const { storage } = boot({ storage: s }); assert.equal(storage.getItem('score'), '270');
  storage.setItem('score', '300'); assert.equal(storage.getItem('score'), '300'); assert.equal(s.getItem('score'), '270');
});
test('storage wrapper reads cross-tab changes rather than caching successful writes', () => {
  const s = memory(), { storage } = boot({ storage: s }); storage.setItem('receipt', 'old');
  s.setItem('receipt', 'new'); assert.equal(storage.getItem('receipt'), 'new');
});
test('preview storage and unauthorized future dates cannot consume the real day entry', () => {
  const s = memory(); s.setItem('the-daily-undead:day-preview:2026-10-18:the-daily-undead:mystery-box-opened:2026-10-18', '1');
  assert.equal(boot({ storage: s, hostname: '127.0.0.1', search: '?date=2026-10-18' }).mode, 'direct');
  assert.equal(boot({ storage: s, hostname: '127.0.0.1' }).mode, 'box');
  s.setItem(receipt, '1'); assert.equal(boot({ storage: s, search: '?date=2099-01-01' }).mode, 'direct');
});
test('new UTC dates and reduced motion choose the appropriate first paint', () => {
  const s = memory(); s.setItem('the-daily-undead:mystery-box-opened:2026-10-18', '1');
  assert.equal(boot({ storage: s }).mode, 'box'); assert.equal(boot({ storage: s, reduced: true }).mode, 'direct'); assert.equal(boot({ storage: s, webgl: false }).mode, 'direct');
  for (const missing of [{ resize: false }, { inert: false }, { fonts: false }]) assert.equal(boot({ storage: s, ...missing }).mode, 'direct');
});
test('fallback storage supports key enumeration and deletion without resurrecting values', () => {
  const { storage } = boot({ denied: true }); storage.setItem('one', 1); storage.setItem('two', 2);
  assert.equal(storage.length, 2); assert.equal(storage.key(0), 'one'); storage.removeItem('one');
  assert.equal(storage.length, 1); assert.equal(storage.key(0), 'two');
});

test('an authorized future preview uses its own opening receipt before paint', () => {
  const s = memory(), session = memory(); s.setItem(receipt, '1');
  session.setItem('the-daily-undead:dev-preview', JSON.stringify({ dateKey: '2026-10-20', token: 'test-authorization' }));
  const options = { storage: s, sessionStorage: session, hostname: '127.0.0.1', search: '?date=2026-10-20&devPreview=test-authorization' };
  assert.equal(boot(options).mode, 'box');
  s.setItem('the-daily-undead:day-preview:2026-10-20:the-daily-undead:mystery-box-opened:2026-10-20', '1');
  assert.equal(boot(options).mode, 'direct');
});

test('remembered accounts wait for authoritative cloud state without painting a speculative box', () => {
  const s = memory(); s.setItem('the-daily-undead:account-memory', JSON.stringify({ userId: 'acct_test' }));
  assert.equal(boot({ storage: s }).mode, 'direct'); assert.equal(s.getItem(receipt), null);
});
