export const BOX_SEQUENCE = Object.freeze({
  lid: 850, liftAt: 760, liftFor: 900, settleAt: 1880, settleFor: 800,
  assembleAt: 2680, finishAt: 3320,
});

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const mix = (a, b, amount) => a + (b - a) * amount;
const smooth = (value) => value < .5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;

// All coordinates are CSS pixels in the viewport. The real DOM card keeps its native size.
export function createRewardFlight({ target, mouth, stage }) {
  const lipY = (x) => mix(mouth.left.y, mouth.right.y,
    (x - mouth.left.x) / (mouth.right.x - mouth.left.x));
  const lip = lipY(mouth.center.x);
  const openingWidth = Math.abs(mouth.right.x - mouth.left.x);
  const slope = Math.abs((mouth.right.y - mouth.left.y) / (mouth.right.x - mouth.left.x));
  const peakScale = Math.min(1.06, (stage.width - 28) / target.width,
    openingWidth * 1.28 / target.width,
    Math.max(36, lip - stage.top - 30) / (target.height + slope * target.width / 2));
  const startScale = Math.min(peakScale * .78, openingWidth * .70 / target.width);
  const startLeft = mouth.center.x - target.width * startScale / 2;
  const startTop = Math.max(lipY(startLeft), lipY(startLeft + target.width * startScale)) + 8;
  const peakLeft = mouth.center.x - target.width * peakScale / 2;
  const peakTop = Math.min(lipY(peakLeft), lipY(peakLeft + target.width * peakScale)) - 16 - target.height * peakScale;

  return (elapsed) => {
    const lift = 1 - (1 - clamp((elapsed - BOX_SEQUENCE.liftAt) / BOX_SEQUENCE.liftFor)) ** 3;
    const settle = smooth(clamp((elapsed - BOX_SEQUENCE.settleAt) / BOX_SEQUENCE.settleFor));
    const floatingScale = mix(startScale, peakScale, lift);
    const floatingLeft = mouth.center.x - target.width * floatingScale / 2;
    const floatingTop = mix(startTop, peakTop, lift);
    const scale = mix(floatingScale, 1, settle);
    const left = mix(floatingLeft, target.left, settle);
    const top = mix(floatingTop, target.top, settle);
    const clipped = elapsed < BOX_SEQUENCE.settleAt;
    const clipLeft = clipped ? clamp((lipY(left) - top) / scale, 0, target.height) : target.height;
    const clipRight = clipped ? clamp((lipY(left + target.width * scale) - top) / scale, 0, target.height) : target.height;
    return { left, top, scale, clipLeft, clipRight,
      light: (.8 - .35 * lift) * (1 - settle), surface: 1 - settle };
  };
}
