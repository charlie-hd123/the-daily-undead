export const BOX_SEQUENCE = Object.freeze({
  lid: 850, liftAt: 620, liftFor: 1050, settleAt: 2010, settleFor: 880,
  assembleAt: 2540, finishAt: 3500,
});

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const mix = (a, b, amount) => a + (b - a) * amount;
const smooth = (value) => value < .5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;

// Viewport CSS pixels. The same branded title travels into its native heading slot.
export function createTitleFlight({ target, mouth, stage }) {
  const lipY = (x) => mix(mouth.left.y, mouth.right.y,
    (x - mouth.left.x) / (mouth.right.x - mouth.left.x));
  const openingWidth = Math.abs(mouth.right.x - mouth.left.x);
  const peakScale = Math.min(2.25, (stage.width - 40) / target.width,
    openingWidth * 1.1 / target.width,
    Math.max(40, lipY(mouth.center.x) - stage.top - 38) / (target.height * 1.8));
  const startScale = peakScale * .66;
  const startTop = Math.max(mouth.left.y, mouth.right.y) + target.height * startScale;
  const peakTop = Math.max(stage.top + 24,
    Math.min(mouth.left.y, mouth.right.y) - target.height * peakScale - 38);

  return (elapsed) => {
    const lift = 1 - (1 - clamp((elapsed - BOX_SEQUENCE.liftAt) / BOX_SEQUENCE.liftFor)) ** 3;
    const settle = smooth(clamp((elapsed - BOX_SEQUENCE.settleAt) / BOX_SEQUENCE.settleFor));
    const scale = mix(mix(startScale, peakScale, lift), 1, settle);
    const left = mix(mouth.center.x - target.width * scale / 2, target.left, settle);
    const top = mix(mix(startTop, peakTop, lift), target.top, settle);
    return { left, top, scale,
      rotateX: mix(-52, -10, lift) * (1 - settle),
      rotateY: mix(-28, -16, lift) * (1 - settle),
      rotateZ: mix(-5, -2, lift) * (1 - settle),
      depth: (1 - settle), light: (.8 - .45 * lift) * (1 - settle),
      // A screen-space portal follows the actual sloping front rim, independent of the title's tilt.
      clipLeft: lipY(stage.left) - stage.top,
      clipRight: lipY(stage.left + stage.width) - stage.top,
    };
  };
}
