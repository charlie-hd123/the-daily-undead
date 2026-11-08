import { isValidDateKey } from './game-core.js';

export function bloodTiesCatalogueQuarter(dateKey) {
  const month = Number(dateKey.slice(5, 7));
  return `${dateKey.slice(0, 4)}-q${Math.ceil(month / 3)}`;
}

// Both the browser and Worker read the exact same compiled board format.
export function readCompiledBloodTiesPuzzle(catalogue, days, dateKey) {
  if (!isValidDateKey(dateKey) || dateKey < catalogue.from || dateKey > catalogue.through) return null;
  const index = (Date.parse(dateKey) - Date.parse(catalogue.from)) / 86400000;
  const row = days[index];
  if (!row) return null;
  const [key, contentVersion, groupIds, tiles, redHerrings] = row;
  return structuredClone({ dateKey, key, ...(contentVersion == null ? {} : { contentVersion }), groups: groupIds.map(id => catalogue.groups[id]), tiles, redHerrings });
}
