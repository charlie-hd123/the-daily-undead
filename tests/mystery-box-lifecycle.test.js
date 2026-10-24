import test from 'node:test';
import assert from 'node:assert/strict';
import { boxFixture } from './helpers/mystery-box-fixture.js';
import { BOX_SEQUENCE } from '../js/mystery-box-motion.js';

test('the lid waits for audio readiness so the first recorded creak stays aligned', async () => {
  let ready, opens = 0;
  const preparing = new Promise(resolve => { ready = resolve; });
  const f = boxFixture({ beforeOpen: () => preparing, onOpen: () => opens++ });
  f.open(); await f.flush(); f.trigger.click();
  assert.equal(f.frameCount, 0); assert.equal(f.values.size, 0); assert.equal(opens, 0);
  ready(); await f.flush();
  assert.equal(f.frameCount, 1); assert.equal(opens, 1);
  assert.equal(f.values.get('the-daily-undead:mystery-box-opened:2026-10-19'), '1');
});

test('blocked, rejected or cancelled audio cannot trap or reopen the real puzzle', async () => {
  let opens = 0;
  const blocked = boxFixture({ beforeOpen: () => new Promise(() => {}), onOpen: () => opens++ });
  blocked.open(); await blocked.flush(); blocked.trigger.click(); blocked.timeout(750); await blocked.flush();
  assert.equal(opens, 1); assert.equal(blocked.frameCount, 1);
  const rejected = boxFixture({ beforeOpen: () => Promise.reject(new Error('blocked')), onOpen: () => opens++ });
  rejected.open(); await rejected.flush(); rejected.trigger.click(); await rejected.flush(); assert.equal(opens, 2);
  let ready;
  const cancelled = boxFixture({ beforeOpen: () => new Promise(resolve => { ready = resolve; }), onOpen: () => opens++ });
  cancelled.open(); await cancelled.flush(); cancelled.trigger.click(); cancelled.controller.cancel();
  ready(); await cancelled.flush();
  assert.equal(opens, 2); assert.equal(cancelled.values.size, 0); assert.equal(cancelled.panel.inert, false);
});

test('box audio starts only on a real opening, once readiness and receipt are confirmed', async () => {
  let opens = 0, cancels = 0;
  const f = boxFixture({ slow: true, onOpen: () => opens++, onCancel: () => cancels++ });
  f.open(); f.trigger.click(); assert.equal(opens, 0);
  f.ready(); await f.flush(); assert.equal(opens, 1);
  f.trigger.click(); assert.equal(opens, 1);
  f.loseContext(); assert.ok(cancels > 0);
  for (const options of [{ sceneFails: true }, { reduced: true }, { iconFails: true }]) {
    const skipped = boxFixture({ ...options, onOpen: () => opens++ });
    skipped.open(); skipped.trigger.click(); await skipped.flush();
    assert.equal(opens, 1);
  }
});

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
  assert.equal(f.intro.parentElement, f.copy); assert.equal(f.caption.parentElement, f.copy);
  assert.equal(f.copy.parentElement, f.stage.parentElement);
  assert.equal(f.loads, 1); assert.equal(f.frameCount, 0); assert.equal(f.controller.isPresenting, true);
  f.trigger.click(); assert.equal(f.caption.hidden, true); assert.equal(f.values.get('the-daily-undead:mystery-box-opened:2026-10-19'), '1');
  f.frame(BOX_SEQUENCE.finishAt); assert.equal(f.controller.isPresenting, false); assert.equal(f.panel.inert, false);
  assert.equal(f.copy.isConnected, false); assert.equal(f.stage.isConnected, false);
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
    assert.equal(f.copy.isConnected, false);
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

test('a fresh account puzzle with blocked graphics stays native without inserting a box or loading Three.js', async () => {
  let checks = 0;
  const f = boxFixture({ entry: { canAnimate: true, mode: 'direct', acquireGraphics: () => { checks++; return null; } } });
  f.open(); await f.flush();
  assert.equal(checks, 1); assert.equal(f.loads, 0); assert.equal(f.controller.isPresenting, false);
  assert.equal(f.panel.inert, false); assert.equal(f.panel.parentElement.className, 'app');
  assert.equal(f.stage.hidden, true);
  assert.equal(f.copy.hidden, true);
});

test('a second tap skips loading, audio preparation, cycling or landing and cannot reopen later', async () => {
  for (const elapsed of [null, 0, 750, 1700, 2700, 3200, 3900, 4600, 5300, 5700]) {
    let opens = 0;
    const f = boxFixture({ slow: elapsed === null, onOpen: () => opens++ });
    f.open(); if (elapsed !== null) await f.flush();
    f.trigger.click();
    if (elapsed) f.frame(elapsed);
    f.trigger.click();
    assert.equal(f.panel.inert, false);
    assert.equal(f.controller.isPresenting, false);
    assert.equal(f.frameCount, 0);
    assert.equal(f.icon.getAttribute('src'), './assets/dead-letters-card.svg');
    assert.equal(f.icon.inert, false);
    assert.equal(f.values.get('the-daily-undead:mystery-box-opened:2026-10-19'), '1');
    f.ready(); await f.flush();
    assert.equal(f.controller.isPresenting, false);
    assert.equal(opens, elapsed === null ? 0 : 1);
    f.open(); await f.flush(); assert.equal(f.controller.isPresenting, false);
  }
  let ready;
  const f = boxFixture({ beforeOpen: () => new Promise(resolve => { ready = resolve; }) });
  f.open(); await f.flush(); f.trigger.click(); f.trigger.click(); ready(); await f.flush();
  assert.equal(f.frameCount, 0); assert.equal(f.panel.inert, false);
});

test('decoded icon objects exchange edge-on without ghosting and restore the untouched native icon', async () => {
  for (const availableTypes of [['word', 'easter'], ['word', 'easter', 'blood']]) {
    const f = boxFixture(); f.open({ availableTypes }); await f.flush(); f.trigger.click();
    const shown = new Set();
    for (let at = BOX_SEQUENCE.cycleAt; at <= BOX_SEQUENCE.cycleAt + BOX_SEQUENCE.cycleFor; at += 13) {
      f.frame(at);
      const weights = f.iconLayers.map(layer => Number(layer.style.opacity));
      assert.equal(weights.length, availableTypes.length);
      assert.ok(weights.every(weight => Number.isFinite(weight) && weight >= 0 && weight <= 1));
      assert.ok(Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 1) < 1e-9);
      assert.equal(weights.filter(weight => weight > 0).length, 1, 'one crisp silhouette at every frame');
      const visible = f.iconLayers.find(layer => Number(layer.style.opacity) > 0);
      shown.add(visible.dataset.icon);
      assert.equal(f.icon.getAttribute('src'), './assets/dead-letters-card.svg');
    }
    assert.equal(shown.size, availableTypes.length, 'all enabled games visibly participate');
    f.frame(BOX_SEQUENCE.settleAt + BOX_SEQUENCE.settleFor);
    const winner = f.iconLayers.filter(layer => Number(layer.style.opacity) > 0);
    assert.equal(winner.length, 1); assert.equal(winner[0].dataset.icon, 'word');
    f.frame(BOX_SEQUENCE.finishAt);
    assert.equal(f.icon.parentElement, f.panel); assert.equal(f.icon.inert, false);
    assert.equal(f.icon.getAttribute('src'), './assets/dead-letters-card.svg');
  }
});
