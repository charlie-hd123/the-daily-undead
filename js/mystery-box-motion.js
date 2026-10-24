export const BOX_SEQUENCE = Object.freeze({
  lid: 850, liftAt: 620, liftFor: 1100, cycleAt: 1250, cycleFor: 2500,
  settleAt: 4300, settleFor: 1000, growFor: 600, fadeFor: 600,
  assembleAt: 4900, finishAt: 5800,
});

// A slowing carousel of the available games, ending on the already assigned puzzle.
// This is presentation only: it never changes the daily selection.
export function boxRewardAt(elapsed, finalType, availableTypes) {
  const types = [...new Set(availableTypes)].filter(type => ICON_INK[type]);
  if (!types.includes(finalType)) types.push(finalType);
  const time = clamp((elapsed - BOX_SEQUENCE.cycleAt) / BOX_SEQUENCE.cycleFor);
  // One continuous ease-out makes each successive icon dwell longer. End on an
  // exact whole slot, so the last transition cannot flash or repeat the winner.
  const slots = types.length * 3 - 1;
  const cursor = slots * (1 - (1 - time) ** 2);
  const step = Math.floor(cursor);
  const fromType = types[(types.indexOf(finalType) + step + 1) % types.length];
  const toType = time === 1 ? finalType : types[(types.indexOf(finalType) + step + 2) % types.length];
  // Hold each silhouette before a restrained depth turn to the next one.
  const blend = time === 1 ? 0 : smoother(clamp((cursor - step - .4) / .6));
  return { fromType, toType, blend, type: blend < .5 ? fromType : toType, locked: time === 1 };
}

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const mix = (a, b, amount) => a + (b - a) * amount;
const smooth = (value) => value < .5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
const smoother = (value) => value ** 3 * (value * (value * 6 - 15) + 10);

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
  const availableHeight = Math.max(30, Math.min(mouth.left.y, mouth.right.y) - stage.top - 40);
  // Optical scales balance visible width and height across the three compact silhouettes.
  const peakInkWidth = .65 * Math.min(168, (stage.width - 40) / widestIcon, openingWidth * .62, availableHeight / tallestIcon);
  const peakSize = peakInkWidth * ink.visualScale / ink.width;
  const peakScale = peakSize / target.width;
  const startScale = peakScale * .62;
  const startTop = Math.max(mouth.left.y, mouth.right.y) + target.height * startScale;
  const peakTop = Math.min(mouth.left.y, mouth.right.y) - 16
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
    // Keep the front plane aligned with the real camera throughout the lift.
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
