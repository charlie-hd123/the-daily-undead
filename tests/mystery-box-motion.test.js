import test from 'node:test';
import assert from 'node:assert/strict';
import { BOX_SEQUENCE as timing, createRewardFlight } from '../js/mystery-box-motion.js';

const desktop = { target: { left: 226, top: 360, width: 330, height: 156 },
  mouth: { left: { x: 450, y: 368 }, right: { x: 950, y: 424 }, center: { x: 715, y: 370 } },
  stage: { top: 134, width: 1056, height: 480 } };

test('the real card starts fully occluded by the front rim and clears both sloping edges', () => {
  const flight = createRewardFlight(desktop);
  const start = flight(timing.liftAt);
  assert.equal(start.clipLeft, 0); assert.equal(start.clipRight, 0);
  const raised = flight(timing.liftAt + timing.liftFor);
  assert.equal(raised.clipLeft, desktop.target.height);
  assert.equal(raised.clipRight, desktop.target.height);
  assert.ok(raised.top > desktop.stage.top);
  assert.ok(raised.top + desktop.target.height * raised.scale < desktop.mouth.left.y);
});

test('the reward lands exactly in its native slot with its native scale and no residual light', () => {
  const pose = createRewardFlight(desktop)(timing.assembleAt);
  assert.equal(pose.left, desktop.target.left); assert.equal(pose.top, desktop.target.top);
  assert.equal(pose.scale, 1); assert.equal(pose.light, 0); assert.equal(pose.surface, 0);
  assert.equal(pose.clipLeft, desktop.target.height); assert.equal(pose.clipRight, desktop.target.height);
});

test('phone cards and wide word boards fit above the mouth without crossing the header', () => {
  for (const dimensions of [{ width: 310, height: 200 }, { width: 672, height: 144 }]) {
    const input = { target: { left: 30, top: 440, ...dimensions },
      mouth: { left: { x: 66, y: 368 }, right: { x: 290, y: 392 }, center: { x: 185, y: 365 } },
      stage: { top: 223, width: 343, height: 310 } };
    const pose = createRewardFlight(input)(timing.settleAt);
    assert.ok(pose.top >= input.stage.top + 10);
    assert.ok(pose.scale > 0 && pose.scale <= 1.06);
    assert.ok(dimensions.width * pose.scale <= input.stage.width - 28);
    assert.equal(pose.clipLeft, dimensions.height); assert.equal(pose.clipRight, dimensions.height);
  }
});

test('the card stays in the same pose during the reward pause before travelling to its slot', () => {
  const flight = createRewardFlight(desktop);
  assert.deepEqual(flight(timing.liftAt + timing.liftFor), flight(timing.settleAt));
  const halfway = flight(timing.settleAt + timing.settleFor / 2);
  const raised = flight(timing.settleAt);
  assert.ok(halfway.left < raised.left && halfway.left > desktop.target.left);
  assert.ok(halfway.top > raised.top && halfway.top < desktop.target.top);
});
