import { createBloodTiesPuzzleBuilder } from './blood-ties-engine.js';
import { productionBloodTiesContents } from './blood-ties-production-content.js';

export { createBloodTiesSession, normalizeBloodTiesSession, replayBloodTiesAttempts } from './blood-ties-engine.js';

const buildProductionPuzzle = createBloodTiesPuzzleBuilder(productionBloodTiesContents);

export async function loadBloodTiesPuzzleBuilder({ production }) {
  if (production) return buildProductionPuzzle;
  // The staging history includes the one-day October trial and its cooldown effects.
  const { buildDailyBloodTiesPuzzle } = await import('./blood-ties-core.js?v=20261108-2');
  return buildDailyBloodTiesPuzzle;
}
