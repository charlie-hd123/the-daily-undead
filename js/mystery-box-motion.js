export const BOX_SEQUENCE = Object.freeze({
  lid: 850, liftAt: 620, liftFor: 1050, settleAt: 2010, settleFor: 880,
  growFor: 500, assembleAt: 2540, finishAt: 3500,
});

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const mix = (a, b, amount) => a + (b - a) * amount;
const smooth = (value) => value < .5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;

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

// Viewport CSS pixels. Both SVGs paint inside this shared portion of their viewBox.
export const ICON_INK = Object.freeze({ left: .1, top: .2, width: .8, height: .6 });

export function createIconFlight({ target, mouth, stage, viewDirection }) {
  // CSS uses screen Y down and positive Z towards the player. Both rotations
  // must be negative for this camera, including the depth of the thin side layers.
  const pitch = Math.asin(clamp(viewDirection.y, -1, 1)) * 180 / Math.PI;
  const yaw = Math.atan2(viewDirection.x, -viewDirection.z) * 180 / Math.PI;
  const lipY = (x) => mix(mouth.left.y, mouth.right.y,
    (x - mouth.left.x) / (mouth.right.x - mouth.left.x));
  const openingWidth = Math.abs(mouth.right.x - mouth.left.x);
  const availableHeight = Math.max(30, Math.min(mouth.left.y, mouth.right.y) - stage.top - 40);
  const peakSize = Math.min(210, (stage.width - 40) / ICON_INK.width,
    openingWidth * .62 / ICON_INK.width, availableHeight / ICON_INK.height);
  const peakScale = peakSize / target.width;
  const startScale = peakScale * .62;
  const startTop = Math.max(mouth.left.y, mouth.right.y) + target.height * startScale;
  const peakTop = Math.min(mouth.left.y, mouth.right.y) - 16
    - (ICON_INK.top + ICON_INK.height) * target.height * peakScale;

  return (elapsed) => {
    const lift = 1 - (1 - clamp((elapsed - BOX_SEQUENCE.liftAt) / BOX_SEQUENCE.liftFor)) ** 3;
    const settle = smooth(clamp((elapsed - BOX_SEQUENCE.settleAt) / BOX_SEQUENCE.settleFor));
    const fade = smooth(clamp((elapsed - BOX_SEQUENCE.settleAt - BOX_SEQUENCE.settleFor * .3) / (BOX_SEQUENCE.settleFor * .7)));
    const floatingScale = mix(startScale, peakScale, lift);
    const scale = mix(floatingScale, 1, settle);
    const left = mix(mouth.center.x - target.width * floatingScale / 2, target.left, settle);
    const arc = settle > 0 && settle < 1 ? Math.sin(Math.PI * settle) * Math.min(28, stage.height * .08) : 0;
    const top = mix(mix(startTop, peakTop, lift), target.top, settle) - arc;
    // Keep the front plane aligned with the real camera throughout the lift.
    return { left, top, scale,
      rotateX: pitch * (1 - settle),
      rotateY: yaw * (1 - settle),
      rotateZ: 0,
      depth: 1 - settle, light: (.8 - .45 * lift) * (1 - settle),
      opacity: mix(1, .12, fade),
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
