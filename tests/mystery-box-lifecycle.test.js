import test from 'node:test';
import assert from 'node:assert/strict';
import { boxFixture } from './helpers/mystery-box-fixture.js';

test('ineligible official, just-for-fun, consumed, reduced-motion and unsupported entries never load Three.js', async () => {
  for (const options of [{}, { reduced: true }, { webgl: false }, { resize: false }, { entry: { canAnimate: false } }]) {
    const f = boxFixture(options); assert.equal(f.loads, 0);
    if (options.reduced || options.webgl === false || options.resize === false || options.entry?.canAnimate === false) { f.open(); await f.flush(); assert.equal(f.loads, 0); }
    f.open({ official: false }); f.open({ fresh: false });
    f.values.set('the-daily-undead:mystery-box-opened:2026-10-19', '1'); f.open();
    await f.flush(); assert.equal(f.loads, 0); assert.equal(f.panel.inert, false);
  }
});
test('a fresh ready box waits, records its opening before any frame, and cannot restart', async () => {
  const f = boxFixture(); f.open(); await f.flush();
  assert.equal(f.loads, 1); assert.equal(f.frameCount, 0); assert.equal(f.controller.isPresenting, true);
  f.trigger.click(); assert.equal(f.caption.hidden, true); assert.equal(f.values.get('the-daily-undead:mystery-box-opened:2026-10-19'), '1');
  f.frame(3500); assert.equal(f.controller.isPresenting, false); assert.equal(f.panel.inert, false);
  f.open(); await f.flush(); assert.equal(f.loads, 1); assert.equal(f.controller.isPresenting, false);
});
test('an early tap queues one opening until the renderer is ready', async () => {
  const f = boxFixture({ slow: true }); f.open(); f.trigger.click(); assert.equal(f.caption.hidden, true);
  assert.equal(f.values.size, 0); f.ready(); await f.flush();
  assert.equal(f.values.get('the-daily-undead:mystery-box-opened:2026-10-19'), '1'); assert.equal(f.frameCount, 1);
});
test('renderer, font and icon failures leave the real panel usable and do not consume a reveal', async () => {
  for (const options of [{ sceneFails: true }, { fontFails: true }, { iconFails: true }]) {
    const f = boxFixture(options); f.open(); f.trigger.click(); await f.flush();
    assert.equal(f.controller.isPresenting, false); assert.equal(f.panel.inert, false); assert.equal(f.values.size, 0);
  }
});
test('a slow renderer times out to play and cannot open after its late resolution', async () => {
  const f = boxFixture({ slow: true }); f.open(); f.trigger.click(); f.timeout(); await f.flush();
  assert.equal(f.controller.isPresenting, false); f.ready(); await f.flush();
  assert.equal(f.panel.inert, false); assert.equal(f.values.size, 0); assert.equal(f.disposed, 1);
});
test('a failed receipt write skips animation without trapping the real puzzle', async () => {
  const f = boxFixture({ storage: { getItem: () => null, setItem() { throw Error('quota'); } } });
  f.open(); await f.flush(); f.trigger.click(); assert.equal(f.controller.isPresenting, false);
  assert.equal(f.panel.inert, false); assert.equal(f.frameCount, 0);
});
test('a storage event opens a waiting tab directly after another tab consumes the day', async () => {
  const f = boxFixture(); f.open(); await f.flush();
  f.values.set('the-daily-undead:mystery-box-opened:2026-10-19', '1');
  f.event('storage', { key: 'the-daily-undead:mystery-box-opened:2026-10-19' });
  assert.equal(f.controller.isPresenting, false); assert.equal(f.panel.inert, false); assert.equal(f.frameCount, 0);
});
test('context loss and page exit release inert content without losing the opening receipt', async () => {
  for (const interrupt of [f => f.loseContext(), f => f.event('pagehide', { persisted: true })]) {
    const f = boxFixture(); f.open(); await f.flush(); f.trigger.click(); interrupt(f);
    assert.equal(f.controller.isPresenting, false); assert.equal(f.panel.inert, false);
    assert.equal(f.values.get('the-daily-undead:mystery-box-opened:2026-10-19'), '1');
  }
});

test('orientation changes and a reduced-motion change interrupt a flight safely', async () => {
  for (const interrupt of [f => f.event('resize'), f => f.event('media-change', { matches: true })]) {
    const f = boxFixture(); f.open(); await f.flush(); f.trigger.click(); f.frame(700); interrupt(f);
    assert.equal(f.controller.isPresenting, false); assert.equal(f.panel.inert, false);
    assert.equal(f.frameCount, 0); assert.equal(f.values.get('the-daily-undead:mystery-box-opened:2026-10-19'), '1');
  }
});

test('a quiet pre-paint account check can still offer its genuinely fresh official box', async () => {
  const f = boxFixture({ entry: { canAnimate: true, mode: 'direct' } }); f.open(); await f.flush();
  assert.equal(f.loads, 1); assert.equal(f.controller.isPresenting, true); assert.equal(f.values.size, 0);
});
