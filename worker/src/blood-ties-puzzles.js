import { readCompiledBloodTiesPuzzle } from '../../js/blood-ties-compiled.js';
import { buildDailyBloodTiesPuzzle as generatePuzzle } from '../../js/blood-ties-core.js';
import { workerBloodTiesCatalogue as catalogue } from './generated-blood-ties-catalog.js';

// Compilation moves catalogue preparation out of the Worker request CPU budget.
// These are copies of the shared generator's outputs, never a new assignment rule.
export function buildDailyBloodTiesPuzzle(dateKey, options = {}) {
  const days = catalogue.schedules[options.production ? 'production' : 'staging'];
  return readCompiledBloodTiesPuzzle(catalogue, days, dateKey) ?? generatePuzzle(dateKey, options);
}
