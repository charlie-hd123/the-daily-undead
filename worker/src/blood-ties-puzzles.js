import { isValidDateKey } from '../../js/game-core.js';
import { buildDailyBloodTiesPuzzle as generatePuzzle } from '../../js/blood-ties-core.js';
import { workerBloodTiesCatalogue as catalogue } from './generated-blood-ties-catalog.js';

// Compilation moves catalogue preparation out of the Worker request CPU budget.
// These are copies of the shared generator's outputs, never a new assignment rule.
export function buildDailyBloodTiesPuzzle(dateKey, options = {}) {
  if (!isValidDateKey(dateKey) || dateKey < catalogue.from || dateKey > catalogue.through) {
    return generatePuzzle(dateKey, options);
  }
  const index = (Date.parse(`${dateKey}T00:00:00Z`) - Date.parse(`${catalogue.from}T00:00:00Z`)) / 86400000;
  const [key, contentVersion, groupIds, tiles, redHerrings] = catalogue.schedules[options.production ? 'production' : 'staging'][index];
  // Callers can change a returned puzzle without changing later requests.
  return structuredClone({ dateKey, key, ...(contentVersion == null ? {} : { contentVersion }), groups: groupIds.map(id => catalogue.groups[id]), tiles, redHerrings });
}
