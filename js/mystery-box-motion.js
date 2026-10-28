export const BOX_SEQUENCE = Object.freeze({
  lid: 850, liftAt: 450, liftFor: 1000, cycleAt: 950, cycleFor: 2950,
  settleAt: 4450, settleFor: 1000, growFor: 600, fadeFor: 600,
  assembleAt: 5050, finishAt: 5950,
});

// A slowing carousel of the available games, ending on the already assigned puzzle.
// This is presentation only: it never changes the daily selection.
export function boxRewardAt(elapsed, finalType, availableTypes, facing = { rotateX: 0, rotateY: 0 }) {
  const types = [...new Set(availableTypes)].filter(type => ICON_INK[type]);
  if (!types.includes(finalType)) types.push(finalType);
  const time = clamp((elapsed - BOX_SEQUENCE.cycleAt) / BOX_SEQUENCE.cycleFor);
  // One continuous ease-out makes each successive icon dwell longer. End on an
  // exact whole slot, so the last transition cannot flash or repeat the winner.
  const slots = types.length * 3 - 1;
  const cursor = slots * (1 - (1 - time) ** 2.7);
  const step = Math.floor(cursor);
  const fromType = types[(types.indexOf(finalType) + step + 1) % types.length];
  const toType = time === 1 ? finalType : types[(types.indexOf(finalType) + step + 2) % types.length];
  // One continuous backward roll. Swap artwork at the horizontal edge, then
  // continue in the same direction; the cursor supplies the gradual slowdown.
  const blend = time === 1 ? 0 : cursor - step;
  // A tilted face reaches its visual edge before a screen-facing one. Exchange
  // at that actual edge so the fixed box angle cannot create a flash or backface.
  const pitch = facing.rotateX * Math.PI / 180, yaw = facing.rotateY * Math.PI / 180;
  const edge = 1 - Math.atan2(Math.cos(pitch) * Math.cos(yaw), -Math.sin(pitch)) / Math.PI;
  const incoming = blend >= edge;
  const rollX = 180 * blend - (incoming ? 180 : 0);
  const confirmation = (elapsed - BOX_SEQUENCE.cycleAt - BOX_SEQUENCE.cycleFor) / 420;
  const glow = confirmation > 0 && confirmation < 1 ? Math.sin(Math.PI * confirmation) ** 2 : 0;
  return { fromType, toType, blend, rollX, glow, type: incoming ? toType : fromType, locked: time === 1 };
}

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const mix = (a, b, amount) => a + (b - a) * amount;
const smooth = (value) => value < .5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
const smoother = (value) => value ** 3 * (value * (value * 6 - 15) + 10);

// Follow visible motion on the same frame as the icon; cache subpixel changes
// and stationary holds instead of throttling slow turns to a separate cadence.
export function iconShadowNeedsUpdate(previous, next) {
  if (!previous) return true;
  const movement = Math.max(Math.abs(next.left - previous.left), Math.abs(next.top - previous.top),
    Math.abs(next.scale - previous.scale) * next.width);
  const turn = Math.abs(next.roll - previous.roll);
  const visibilityChanged = (next.depth > .03) !== (previous.depth > .03);
  if (next.type !== previous.type || visibilityChanged || next.elapsed < previous.elapsed) return true;
  return movement >= .25 || turn >= .25;
}

export function lidOpenness(elapsed) {
  const opening = smooth(clamp(elapsed / BOX_SEQUENCE.lid));
  const closing = smooth(clamp((elapsed - BOX_SEQUENCE.settleAt) / BOX_SEQUENCE.fadeFor));
  return opening * (1 - .24 * closing);
}

// Start compensating as the lid lifts, reaching its final proportions before
// the broad interior faces the player; a late correction causes a mid-swing bulge.
export function lidDepthScale(openness) {
  return 1 - .20 * smooth(clamp((openness - .1) / .55));
}

// Covers the full lid sweep, whose highest point is just past vertical, not at the end.
export const BOX_FRAME = Object.freeze({ desktopHalfWidth: 6.1, mobileHalfWidth: 4.4,
  halfHeight: 3.1, posterWidth: 1220, posterHeight: 620 });

export function fitBoxCamera(width, height, mobile) {
  const halfWidth = Math.max(mobile ? BOX_FRAME.mobileHalfWidth : BOX_FRAME.desktopHalfWidth,
    BOX_FRAME.halfHeight * width / height);
  return { halfWidth, halfHeight: halfWidth * height / width };
}

export function revealHeight(elapsed, closedHeight, puzzleHeight) {
  const amount = smooth(clamp((elapsed - BOX_SEQUENCE.settleAt) / BOX_SEQUENCE.growFor));
  return mix(closedHeight, puzzleHeight, amount);
}

// Painted bounds, including strokes, in the original 240px SVG viewBoxes.
export const ICON_INK = Object.freeze({
  word: Object.freeze({ left: 28 / 240, top: 72 / 240, width: 184 / 240, height: 101 / 240, visualScale: 1.25 }),
  easter: Object.freeze({ left: 33 / 240, top: 70 / 240, width: 174 / 240, height: 107 / 240, visualScale: 1.2 }),
  blood: Object.freeze({ left: 30 / 240, top: 70 / 240, width: 180 / 240, height: 104 / 240, visualScale: 1.23 }),
});
const tallestIcon = Math.max(...Object.values(ICON_INK).map((ink) => ink.height / ink.width * Math.max(1, ink.visualScale)));
const widestIcon = Math.max(...Object.values(ICON_INK).map((ink) => ink.visualScale));

export function createIconFlight({ target, mouth, stage, viewDirection, ink = ICON_INK.easter }) {
  // CSS uses screen Y down and positive Z towards the player. Both rotations
  // must be negative for this camera, including the depth of the thin side layers.
  const pitch = Math.asin(clamp(viewDirection.y, -1, 1)) * 180 / Math.PI;
  const yaw = Math.atan2(viewDirection.x, -viewDirection.z) * 180 / Math.PI;
  const lipY = (x) => mix(mouth.left.y, mouth.right.y,
    (x - mouth.left.x) / (mouth.right.x - mouth.left.x));
  const openingWidth = Math.abs(mouth.right.x - mouth.left.x);
  const clearance = openingWidth * .04;
  const availableHeight = Math.max(0, Math.min(mouth.left.y, mouth.right.y) - stage.top - clearance - 24);
  // Optical scales balance visible width and height across the three compact silhouettes.
  const peakInkWidth = Math.min(openingWidth * .30, (stage.width - 40) / widestIcon, availableHeight / tallestIcon);
  const peakSize = peakInkWidth * ink.visualScale / ink.width;
  const peakScale = peakSize / target.width;
  const startScale = peakScale * .62;
  const startTop = Math.max(mouth.left.y, mouth.right.y) + target.height * startScale;
  const peakTop = Math.min(mouth.left.y, mouth.right.y) - clearance
    - (ink.top + ink.height) * target.height * peakScale;

  return (elapsed) => {
    const lift = smoother(clamp((elapsed - BOX_SEQUENCE.liftAt) / BOX_SEQUENCE.liftFor));
    const settle = smoother(clamp((elapsed - BOX_SEQUENCE.settleAt) / BOX_SEQUENCE.settleFor));
    const fade = smooth(clamp((elapsed - BOX_SEQUENCE.settleAt - BOX_SEQUENCE.settleFor * .3) / (BOX_SEQUENCE.settleFor * .7)));
    const floatingScale = mix(startScale, peakScale, lift);
    const scale = mix(floatingScale, 1, settle);
    const left = mix(mouth.center.x - (ink.left + ink.width / 2) * target.width * floatingScale, target.left, settle);
    const arc = settle > 0 && settle < 1 ? Math.sin(Math.PI * settle) * Math.min(28, stage.height * .08) : 0;
    const top = mix(mix(startTop, peakTop, lift), target.top, settle) - arc;
    // The outer frame keeps the chest's perspective; an independent inner frame
    // rolls forward about the box's horizontal axis without changing that angle.
    return { left, top, scale,
      rotateX: pitch * (1 - settle),
      rotateY: yaw * (1 - settle),
      rotateZ: 0,
      depth: 1 - settle, light: (.8 - .45 * lift) * (1 - settle),
      opacity: mix(1, .18, fade),
      clipLeft: lipY(stage.left) - stage.top,
      clipRight: lipY(stage.left + stage.width) - stage.top,
    };
  };
}

// Readiness alone must never open the box. Either event may arrive first.
export function createBoxActivation(start) {
  let requested = false;
  let ready = false;
  let finished = false;
  function tryStart() {
    if (!finished && requested && ready) { finished = true; start(); }
  }
  return {
    request() { if (!finished) requested = true; tryStart(); },
    ready() { ready = true; tryStart(); },
    cancel() { finished = true; },
    get requested() { return requested; },
  };
}
