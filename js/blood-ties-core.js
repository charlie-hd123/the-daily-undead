import { bloodTiesContents } from './blood-ties-content.js';
import { createBloodTiesPuzzleBuilder } from './blood-ties-engine.js';
import { productionBloodTiesContents } from './blood-ties-production-content.js';

export * from './blood-ties-engine.js';
export const BLOOD_TIES_CONTENT_DATE = bloodTiesContents.at(-1).catalogue.effectiveDate;

const buildStagingPuzzle = createBloodTiesPuzzleBuilder(bloodTiesContents);
const buildProductionPuzzle = createBloodTiesPuzzleBuilder(productionBloodTiesContents);

export function buildDailyBloodTiesPuzzle(dateKey, { production = false } = {}) {
  return (production ? buildProductionPuzzle : buildStagingPuzzle)(dateKey);
}
