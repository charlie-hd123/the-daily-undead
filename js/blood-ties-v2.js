// Frozen v2 assignments. Never edit: already issued puzzles depend on this generator.
import { createRng, hashString, isValidDateKey, shuffle } from './game-core.js';
import { bloodTiesCatalogue } from './blood-ties-catalogue-v2.js';
import { bloodTiesBoards } from './blood-ties-boards-v2.js';
import { buildDailyBloodTiesPuzzle as buildLegacyBloodTiesPuzzle } from './blood-ties-legacy.js';
export { countBloodTiesSolutions } from './blood-ties-legacy.js';

export const BLOOD_TIES_LAUNCH_DATE = '2026-10-22';
export const BLOOD_TIES_RULES_VERSION = 3;
export const BLOOD_TIES_MAX_STRIKES = 3;
export const BLOOD_TIES_CONTENT_DATE = '2026-10-23';
export const BLOOD_TIES_CATEGORY_COOLDOWN = 14;
export const BLOOD_TIES_TILE_COOLDOWN = 7;
const epoch = Date.parse(`${BLOOD_TIES_CONTENT_DATE}T00:00:00Z`) / 86400000;
const trioKey = (tiles) => [...tiles].sort().join('\u001f');
const days = [];
const categoryUsage = new Map();
let pool;
let historicalDay;

function preparePool() {
  if (pool) return pool;
  if (bloodTiesBoards.sourceSha256 !== bloodTiesCatalogue.sourceSha256) throw new Error('Blood Ties board pool does not match its workbook.');
  const connections = new Map(bloodTiesCatalogue.connections.map(g => [g.id, g]));
  pool = bloodTiesBoards.boards.map(board => {
    const groups = board.map(([id, ...indices]) => {
      const group = connections.get(id);
      return { ...group, answers: indices.map(i => group.tiles[i]) };
    });
    const tiles = groups.flatMap(g => g.answers);
    const signature = groups.map(g => `${g.id}:${trioKey(g.answers)}`).sort().join('|');
    const redHerrings = groups.flatMap(owner => owner.answers.filter(t => groups.some(g => g.id !== owner.id && g.tiles.includes(t))));
    return { groups, tiles, redHerrings, signature };
  });
  // The first release already had a real round on 22 October. Its labels must
  // respect the new cooldown too, even where the workbook renamed a category.
  const old = buildLegacyBloodTiesPuzzle('2026-10-22');
  historicalDay = { ...old, groups: old.groups.map(g => ({ ...g,
    id: bloodTiesCatalogue.connections.find(c => c.name === g.name)?.id || `historical:${g.id}`,
  })) };
  return pool;
}

export function buildDailyBloodTiesPuzzle(dateKey) {
  if (!isValidDateKey(dateKey)) throw new Error('A valid UTC date is required.');
  // Keep already played dates, saved results and yesterday's answers immutable.
  if (dateKey < BLOOD_TIES_CONTENT_DATE) return buildLegacyBloodTiesPuzzle(dateKey);
  const candidates = preparePool();
  const day = Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86400000) - epoch;
  for (let index = days.length; index <= day; index++) {
    const history = index < 42 ? [historicalDay, ...days] : days;
    const recentCategories = new Set(history.slice(-BLOOD_TIES_CATEGORY_COOLDOWN).flatMap(p => p.groups.map(g => g.id)));
    const recentTiles = new Set(history.slice(-BLOOD_TIES_TILE_COOLDOWN).flatMap(p => p.tiles));
    const olderCategories = new Set(history.slice(-42, -BLOOD_TIES_CATEGORY_COOLDOWN).flatMap(p => p.groups.map(g => g.id)));
    const olderTiles = new Set(history.slice(-21, -BLOOD_TIES_TILE_COOLDOWN).flatMap(p => p.tiles));
    let best, bestRank = Infinity;
    for (const candidate of candidates) {
      if (candidate.groups.some(g => recentCategories.has(g.id)) || candidate.tiles.some(t => recentTiles.has(t))) continue;
      // Prefer broad coverage, then longer gaps, then a reproducible daily tie break.
      const repeats = candidate.groups.reduce((n, g) => n + (categoryUsage.get(g.id) || 0), 0);
      const recent = candidate.groups.filter(g => olderCategories.has(g.id)).length * 12 + candidate.tiles.filter(t => olderTiles.has(t)).length;
      const rank = (repeats * 64 + recent) * 4294967296 + hashString(`${index}:blood-ties:v2:${candidate.signature}`);
      if (rank < bestRank) { best = candidate; bestRank = rank; }
    }
    if (!best) throw new Error('No Blood Ties board satisfies the category and tile cooldowns.');
    days.push(best);
    best.groups.forEach(g => categoryUsage.set(g.id, (categoryUsage.get(g.id) || 0) + 1));
  }
  const selected = days[day];
  const groups = selected.groups.map(({ tiles, ...group }) => ({ ...group, eligibleTiles: [...tiles], answers: [...group.answers] }));
  const key = `${dateKey}:blood:v2:${hashString(selected.signature).toString(16)}`;
  return { dateKey, key, contentVersion: 2, groups, tiles: shuffle(selected.tiles, createRng(hashString(`${key}:display`))), redHerrings: [...selected.redHerrings] };
}

