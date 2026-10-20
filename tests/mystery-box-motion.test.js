import test from 'node:test';
import assert from 'node:assert/strict';
import { OrthographicCamera, Vector3 } from 'three';
import { BOX_SEQUENCE as timing, ICON_INK, createIconFlight, createBoxActivation, BOX_FRAME, fitBoxCamera, revealHeight, lidOpenness, lidDepthScale } from '../js/mystery-box-motion.js';

const camera = new OrthographicCamera(-4.6, 4.6, 2.3, -2.3, .1, 60);
camera.position.set(7.8, 5.7, 14); camera.lookAt(0, 1.7, 0); camera.updateMatrixWorld();
const viewDirection = camera.getWorldDirection(new Vector3());

const desktop = { viewDirection, target: { left: 1050, top: 149, width: 88, height: 88 },
  mouth: { left: { x: 450, y: 368 }, right: { x: 950, y: 424 }, center: { x: 715, y: 370 } },
  stage: { left: 192, top: 134, width: 1056, height: 480 } };

function inkBounds(pose, target, ink = ICON_INK.easter) {
  return { left: pose.left + ink.left * target.width * pose.scale,
    right: pose.left + (ink.left + ink.width) * target.width * pose.scale,
    top: pose.top + ink.top * target.height * pose.scale,
    bottom: pose.top + (ink.top + ink.height) * target.height * pose.scale };
}

test('the lid starts easing down with the fade and never closes completely on screen', () => {
  assert.equal(lidOpenness(0), 0);
  assert.equal(lidOpenness(timing.lid), 1);
  assert.equal(lidOpenness(timing.settleAt), 1);
  assert.equal(lidOpenness(timing.settleAt + timing.fadeFor / 2), .88);
  assert.equal(lidOpenness(timing.settleAt + timing.fadeFor), .76);
  let previous = 1;
  for (let elapsed = timing.settleAt; elapsed <= timing.finishAt; elapsed += 10) {
    const amount = lidOpenness(elapsed);
    assert.ok(amount <= previous && amount >= .76);
    previous = amount;
  }
});

test('lid proportions stay fitted until the late swing, then finish subtly shorter', () => {
  for (const openness of [0, .25, .5, .7]) assert.equal(lidDepthScale(openness), 1);
  assert.equal(lidDepthScale(1), .8);
  let previous = 1;
  for (let step = 71; step <= 100; step++) {
    const scale = lidDepthScale(step / 100);
    assert.ok(scale <= previous && scale >= .8);
    assert.ok(previous - scale < .02, 'no visible size jump between animation frames');
    previous = scale;
  }
});

test('the letter tiles retain their optical boost while the map is reduced by 10%', () => {
  for (const size of [[288, 250], [343, 250], [736, 310], [1056, 480], [797, 200]]) {
    const stage = { left: 20, top: 150, width: size[0], height: size[1] };
    const input = { ...desktop, stage, mouth: {
      left: { x: stage.left + stage.width * .2, y: stage.top + stage.height * .52 },
      right: { x: stage.left + stage.width * .8, y: stage.top + stage.height * .62 },
      center: { x: stage.left + stage.width / 2, y: stage.top + stage.height * .55 } } };
    for (const elapsed of [timing.liftAt, timing.liftAt + timing.liftFor / 2, timing.settleAt]) {
      const widths = Object.values(ICON_INK).map((ink) => {
        const pose = createIconFlight({ ...input, ink })(elapsed);
        return ink.width * input.target.width * pose.scale;
      });
      assert.ok(Math.abs(widths[0] / widths[1] - 1.25 / .9) < 1e-10);
    }
  }
});

test('the icon starts below the front rim and rises clear of it with visible depth', () => {
  const flight = createIconFlight(desktop);
  const start = flight(timing.liftAt);
  assert.ok(start.top > desktop.mouth.right.y + desktop.target.height * start.scale / 2);
  const raised = flight(timing.liftAt + timing.liftFor);
  const ink = inkBounds(raised, desktop.target);
  assert.ok(ink.top >= desktop.stage.top + 24);
  assert.ok(ink.bottom < desktop.mouth.left.y);
  assert.equal(raised.opacity, 1);
  assert.equal(raised.rotateZ, 0);
  assert.ok(ink.right - ink.left <= (desktop.mouth.right.x - desktop.mouth.left.x) * .62);
  assert.ok(raised.rotateX < 0 && raised.rotateY < 0 && raised.depth === 1);
});


test('the front face and depth face the same way as the chest camera throughout emergence', () => {
  const flight = createIconFlight(desktop);
  const view = camera.matrixWorldInverse.elements;
  for (const elapsed of [timing.liftAt, timing.liftAt + timing.liftFor / 2, timing.settleAt]) {
    const pose = flight(elapsed);
    const x = pose.rotateX * Math.PI / 180, y = pose.rotateY * Math.PI / 180;
    // Columns of the CSS front-plane rotation, including the normal that controls extrusion.
    const css = [Math.cos(y), Math.sin(x) * Math.sin(y), -Math.cos(x) * Math.sin(y),
      0, Math.cos(x), Math.sin(x), Math.sin(y), -Math.sin(x) * Math.cos(y), Math.cos(x) * Math.cos(y)];
    // Convert the actual Three.js view basis to CSS's downwards image Y axis.
    const projected = [view[0], -view[1], view[2], -view[4], view[5], -view[6], view[8], -view[9], view[10]];
    css.forEach((value, index) => assert.ok(Math.abs(value - projected[index]) < 1e-10));
  }
});

test('the travelling icon becomes its exact faint corner watermark without residual depth or glow', () => {
  const pose = createIconFlight(desktop)(timing.settleAt + timing.settleFor);
  assert.equal(pose.left, desktop.target.left); assert.equal(pose.top, desktop.target.top);
  assert.equal(pose.scale, 1); assert.equal(pose.light, 0); assert.equal(pose.depth, 0);
  assert.equal(pose.opacity, .12);
  assert.equal(Math.abs(pose.rotateX), 0); assert.equal(Math.abs(pose.rotateY), 0); assert.equal(Math.abs(pose.rotateZ), 0);
});

test('both SVG silhouettes fit phones, tablets and short landscape stages without crossing the header', () => {
  for (const stage of [{ left: 20, top: 223, width: 280, height: 250 },
    { left: 20, top: 180, width: 728, height: 310 }, { left: 20, top: 150, width: 804, height: 200 }]) {
    for (const width of [56, 69, 88]) {
      const input = { viewDirection, target: { left: stage.left + stage.width - width - 12, top: stage.top + 14, width, height: width },
        mouth: { left: { x: stage.left + stage.width * .2, y: stage.top + stage.height * .52 },
          right: { x: stage.left + stage.width * .8, y: stage.top + stage.height * .62 },
          center: { x: stage.left + stage.width / 2, y: stage.top + stage.height * .55 } }, stage };
      for (const silhouette of Object.values(ICON_INK)) {
        const pose = createIconFlight({ ...input, ink: silhouette })(timing.settleAt);
        const bounds = inkBounds(pose, input.target, silhouette);
        assert.ok(bounds.top >= stage.top + 24 - .001);
        assert.ok(bounds.left >= stage.left && bounds.right <= stage.left + stage.width);
        assert.ok(bounds.bottom < input.mouth.left.y);
        assert.ok(bounds.right - bounds.left <= stage.width - 40);
      }
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


test('the compact page grows to the native puzzle height before that panel becomes visible', () => {
  for (const [closed, puzzle] of [[290, 650], [544, 510], [310, 740]]) {
    assert.equal(revealHeight(0, closed, puzzle), closed);
    assert.equal(revealHeight(timing.settleAt, closed, puzzle), closed);
    const midpoint = revealHeight(timing.settleAt + timing.growFor / 2, closed, puzzle);
    assert.equal(midpoint, (closed + puzzle) / 2);
    assert.equal(revealHeight(timing.settleAt + timing.growFor, closed, puzzle), puzzle);
    assert.equal(revealHeight(timing.assembleAt, closed, puzzle), puzzle);
    assert.equal(revealHeight(timing.finishAt, closed, puzzle), puzzle);
  }
});

const framingSizes = [[288, 250, true], [343, 250, true], [383, 250, true], [553, 250, true],
  [554, 310, false], [736, 310, false], [797, 200, false], [1056, 480, false], [3840, 200, false]];

test('every camera fit protects the measured full lid sweep, including the peak before fully open', () => {
  // Unshortened prop swept through 121 hinge positions; the late lid compression
  // remains inside this conservative envelope, whose top peaks near 97 degrees.
  const envelope = { left: -3.313647, right: 3.650736, bottom: -2.156026, top: 2.828978 };
  for (const [width, height, mobile] of framingSizes) {
    const fit = fitBoxCamera(width, height, mobile);
    assert.ok(fit.halfWidth > Math.max(-envelope.left, envelope.right));
    assert.ok(fit.halfHeight > Math.max(-envelope.bottom, envelope.top));
    assert.ok((fit.halfHeight - envelope.top) * height / (2 * fit.halfHeight) >= 8);
    assert.ok(Math.abs(fit.halfWidth / fit.halfHeight - width / height) < 1e-10);
  }
});

test('the fixed poster export and responsive image fit register with the live camera', () => {
  const reference = fitBoxCamera(BOX_FRAME.posterWidth, BOX_FRAME.posterHeight, false);
  assert.equal(reference.halfWidth, BOX_FRAME.desktopHalfWidth);
  assert.equal(reference.halfHeight, BOX_FRAME.halfHeight);
  for (const [width, height, mobile] of framingSizes) {
    const imageBoxWidth = width * (mobile ? BOX_FRAME.desktopHalfWidth / BOX_FRAME.mobileHalfWidth : 1);
    const paintedWidth = Math.min(imageBoxWidth, height * BOX_FRAME.posterWidth / BOX_FRAME.posterHeight);
    const posterUnit = paintedWidth / (2 * BOX_FRAME.desktopHalfWidth);
    const liveUnit = width / (2 * fitBoxCamera(width, height, mobile).halfWidth);
    assert.ok(Math.abs(posterUnit - liveUnit) < 1e-10);
  }
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
