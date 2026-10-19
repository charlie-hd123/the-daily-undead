import test from 'node:test';
import assert from 'node:assert/strict';
import { BOX_SEQUENCE as timing, ICON_INK, createIconFlight, createBoxActivation } from '../js/mystery-box-motion.js';

const desktop = { target: { left: 1050, top: 149, width: 88, height: 88 },
  mouth: { left: { x: 450, y: 368 }, right: { x: 950, y: 424 }, center: { x: 715, y: 370 } },
  stage: { left: 192, top: 134, width: 1056, height: 480 } };

function inkBounds(pose, target) {
  return { left: pose.left + ICON_INK.left * target.width * pose.scale,
    right: pose.left + (ICON_INK.left + ICON_INK.width) * target.width * pose.scale,
    top: pose.top + ICON_INK.top * target.height * pose.scale,
    bottom: pose.top + (ICON_INK.top + ICON_INK.height) * target.height * pose.scale };
}

test('the icon starts below the front rim and rises clear of it with visible depth', () => {
  const flight = createIconFlight(desktop);
  const start = flight(timing.liftAt);
  assert.ok(start.top > desktop.mouth.right.y + desktop.target.height * start.scale / 2);
  const raised = flight(timing.liftAt + timing.liftFor);
  const ink = inkBounds(raised, desktop.target);
  assert.ok(ink.top >= desktop.stage.top + 24);
  assert.ok(ink.bottom < desktop.mouth.left.y);
  assert.equal(raised.opacity, 1);
  assert.ok(raised.rotateX < 0 && raised.rotateY < 0 && raised.depth === 1);
});

test('the travelling icon becomes its exact faint corner watermark without residual depth or glow', () => {
  const pose = createIconFlight(desktop)(timing.settleAt + timing.settleFor);
  assert.equal(pose.left, desktop.target.left); assert.equal(pose.top, desktop.target.top);
  assert.equal(pose.scale, 1); assert.equal(pose.light, 0); assert.equal(pose.depth, 0);
  assert.equal(pose.opacity, .12);
  assert.equal(Math.abs(pose.rotateX), 0); assert.equal(Math.abs(pose.rotateY), 0); assert.equal(Math.abs(pose.rotateZ), 0);
});

test('both SVG silhouettes fit phones, tablets and short landscape stages without crossing the header', () => {
  for (const stage of [{ left: 20, top: 223, width: 280, height: 310 },
    { left: 20, top: 180, width: 728, height: 310 }, { left: 20, top: 150, width: 804, height: 200 }]) {
    for (const width of [56, 69, 88]) {
      const input = { target: { left: stage.left + stage.width - width - 12, top: stage.top + 14, width, height: width },
        mouth: { left: { x: stage.left + stage.width * .2, y: stage.top + stage.height * .52 },
          right: { x: stage.left + stage.width * .8, y: stage.top + stage.height * .62 },
          center: { x: stage.left + stage.width / 2, y: stage.top + stage.height * .55 } }, stage };
      const pose = createIconFlight(input)(timing.settleAt);
      const ink = inkBounds(pose, input.target);
      assert.ok(ink.top >= stage.top + 24 - .001);
      assert.ok(ink.left >= stage.left && ink.right <= stage.left + stage.width);
      assert.ok(ink.bottom < input.mouth.left.y);
      assert.ok(ink.right - ink.left <= stage.width - 40);
    }
  }
});

test('the reward holds for recognition, then arcs toward the corner while becoming subtler', () => {
  const flight = createIconFlight(desktop);
  assert.deepEqual(flight(timing.liftAt + timing.liftFor), flight(timing.settleAt));
  const midpoint = flight(timing.settleAt + timing.settleFor / 2);
  const raised = flight(timing.settleAt);
  assert.ok(midpoint.left > raised.left && midpoint.left < desktop.target.left);
  assert.ok(midpoint.top < (raised.top + desktop.target.top) / 2);
  assert.ok(midpoint.scale > 1 && midpoint.scale < raised.scale);
  assert.ok(midpoint.opacity < 1 && midpoint.opacity > .12);
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
