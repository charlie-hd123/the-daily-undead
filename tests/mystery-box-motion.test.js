import test from 'node:test';
import assert from 'node:assert/strict';
import { BOX_SEQUENCE as timing, createTitleFlight, createBoxActivation } from '../js/mystery-box-motion.js';

const desktop = { target: { left: 226, top: 185, width: 228, height: 48 },
  mouth: { left: { x: 450, y: 368 }, right: { x: 950, y: 424 }, center: { x: 715, y: 370 } },
  stage: { left: 192, top: 134, width: 1056, height: 480 } };

test('the title starts below the chest rim and rises fully clear of it', () => {
  const flight = createTitleFlight(desktop);
  const start = flight(timing.liftAt);
  assert.ok(start.top > desktop.mouth.right.y + desktop.target.height * start.scale / 2);
  const raised = flight(timing.liftAt + timing.liftFor);
  assert.ok(raised.top > desktop.stage.top);
  assert.ok(raised.top + desktop.target.height * raised.scale < desktop.mouth.left.y);
  assert.ok(raised.rotateX < 0 && raised.rotateY < 0 && raised.depth === 1);
});

test('the dimensional title becomes its exact native heading without a residual transform or glow', () => {
  const pose = createTitleFlight(desktop)(timing.settleAt + timing.settleFor);
  assert.equal(pose.left, desktop.target.left); assert.equal(pose.top, desktop.target.top);
  assert.equal(pose.scale, 1); assert.equal(pose.light, 0); assert.equal(pose.depth, 0);
  assert.equal(Math.abs(pose.rotateX), 0); assert.equal(Math.abs(pose.rotateY), 0); assert.equal(Math.abs(pose.rotateZ), 0);
});

test('both puzzle names fit narrow phones, tablets and short landscape stages', () => {
  for (const stage of [{ left: 20, top: 223, width: 280, height: 310 },
    { left: 20, top: 180, width: 728, height: 310 }, { left: 20, top: 150, width: 804, height: 200 }]) {
    for (const width of [165, 195, 228]) {
      const input = { target: { left: 30, top: stage.top + 50, width, height: 38 },
        mouth: { left: { x: stage.left + stage.width * .2, y: stage.top + stage.height * .52 },
          right: { x: stage.left + stage.width * .8, y: stage.top + stage.height * .62 },
          center: { x: stage.left + stage.width / 2, y: stage.top + stage.height * .55 } }, stage };
      const pose = createTitleFlight(input)(timing.settleAt);
      assert.ok(pose.top >= stage.top + 24);
      assert.ok(pose.scale > 0 && pose.scale <= 2.25);
      assert.ok(width * pose.scale <= stage.width - 40);
      assert.ok(pose.left >= stage.left && pose.left + width * pose.scale <= stage.left + stage.width);
    }
  }
});

test('the title holds for reading, then moves continuously toward its heading', () => {
  const flight = createTitleFlight(desktop);
  assert.deepEqual(flight(timing.liftAt + timing.liftFor), flight(timing.settleAt));
  const midpoint = flight(timing.settleAt + timing.settleFor / 2);
  const raised = flight(timing.settleAt);
  assert.ok(midpoint.left < raised.left && midpoint.left > desktop.target.left);
  assert.ok(midpoint.top < raised.top && midpoint.top > desktop.target.top);
  assert.equal(midpoint.depth, .5);
});


test('a loaded box waits indefinitely for a player activation and opens only once', () => {
  let openings = 0;
  const box = createBoxActivation(() => openings++);
  box.ready(); box.ready();
  assert.equal(openings, 0);
  box.request(); box.request(); box.ready();
  assert.equal(openings, 1);
});

test('an early tap is remembered until the renderer and puzzle are ready', () => {
  let openings = 0;
  const box = createBoxActivation(() => openings++);
  box.request(); box.request();
  assert.equal(box.requested, true);
  assert.equal(openings, 0);
  box.ready(); box.ready();
  assert.equal(openings, 1);
});

test('cancelled loading or presentation cannot start when a late event arrives', () => {
  for (const requestFirst of [true, false]) {
    let openings = 0;
    const box = createBoxActivation(() => openings++);
    if (requestFirst) box.request(); else box.ready();
    box.cancel(); box.ready(); box.request();
    assert.equal(openings, 0);
  }
});

test('each new puzzle requires its own activation', () => {
  let openings = 0;
  const first = createBoxActivation(() => openings++);
  first.ready(); first.request();
  const second = createBoxActivation(() => openings++);
  second.ready(); first.request();
  assert.equal(openings, 1);
  second.request();
  assert.equal(openings, 2);
});
