import { createRng, hashString, isValidDateKey, shuffle } from './game-core.js';
import { buildDailyBloodTiesPuzzle as buildV2BloodTiesPuzzle } from './blood-ties-v2.js';
import { BLOOD_TIES_DISCOVERY_VERSION, countBloodTiesApproachableGroups, hasBloodTiesCategoryPairs, isBloodTiesLiteralGroup, resolveBloodTiesTrioDiscovery } from './blood-ties-discovery.js';
import { trioKey } from './blood-ties-rules.js';
export { countBloodTiesSolutions } from './blood-ties-legacy.js';
export { BLOOD_TIES_RULES_VERSION, BLOOD_TIES_MAX_STRIKES, bloodTiesRulesVersion, createBloodTiesSession, calculateBloodTiesPoints, replayBloodTiesAttempts, normalizeBloodTiesSession } from './blood-ties-rules.js';

export const BLOOD_TIES_LAUNCH_DATE = '2026-10-22';
export const BLOOD_TIES_CATEGORY_COOLDOWN = 14;
export const BLOOD_TIES_TILE_COOLDOWN = 7;
const firstFairDate = '2026-10-26';
const epoch = Date.parse(`${firstFairDate}T00:00:00Z`) / 86400000;
const pairs = groups => groups.flatMap((g,i) => groups.slice(i+1).map(h => [g.id,h.id].sort().join(':')));

// Each history has its own cache so staging boards cannot seed the live schedule.
export function createBloodTiesPuzzleBuilder(bloodTiesContents) {
  let contents;
  let seedHistory;
  const categoryUsage = new Map();
  const days = [];

  function prepareContents() {
    if (contents) return contents;
    contents = bloodTiesContents.map(({ catalogue, boards },i) => {
      if (boards.sourceSha256 !== catalogue.sourceSha256 || boards.version !== catalogue.version || boards.effectiveDate !== catalogue.effectiveDate
        || !isValidDateKey(catalogue.effectiveDate) || catalogue.version < 3
        || (i === 0 ? catalogue.effectiveDate !== firstFairDate : catalogue.effectiveDate <= bloodTiesContents[i-1].catalogue.effectiveDate)) throw new Error('Blood Ties content history or board pool does not match its workbook.');
      if ((catalogue.generationPolicy || '') !== (boards.discoveryVersion ? `discovery-v${boards.discoveryVersion}` : '')
        || boards.discoveryVersion && ![1,2,3,BLOOD_TIES_DISCOVERY_VERSION].includes(boards.discoveryVersion)
        || boards.discoveryVersion && boards.opening?.length !== boards.boards.length) throw new Error('Blood Ties discovery policy does not match the compiled pool.');
      const connections = new Map(catalogue.connections.map(g => [g.id, g]));
      const pool = boards.boards.map((board,index) => {
        const groups = board.map(([id, ...indices]) => {
          const group = connections.get(id);
          const selected = { ...group, answers: indices.map(i => group.tiles[i]) };
          return boards.discoveryVersion ? resolveBloodTiesTrioDiscovery(selected) : selected;
        });
        const tiles = groups.flatMap(g => g.answers);
        const signature = groups.map(g => `${g.id}:${trioKey(g.answers)}`).sort().join('|');
        const redHerrings = groups.flatMap(owner => owner.answers.filter(t => groups.some(g => g.id !== owner.id && g.tiles.includes(t))));
        return { groups, tiles, redHerrings, signature, pairs: pairs(groups), ambiguity: boards.ambiguity[index], ...(boards.discoveryVersion ? { approachableGroups: countBloodTiesApproachableGroups(groups), categoryPairs: hasBloodTiesCategoryPairs(groups), opening: boards.opening[index], nameGroups: groups.filter(g => g.discovery.method === 'name').length, literalGroups: groups.filter(isBloodTiesLiteralGroup).length } : {}) };
      });
      return { version: catalogue.version, effectiveDate: catalogue.effectiveDate, fairnessVersion: boards.fairnessVersion, discoveryVersion: boards.discoveryVersion, pool };
    });
    // Include every actually issued day at the boundary, including the original
    // 22 October round. Workbook IDs are stable; historical renamed IDs use names.
    seedHistory = [];
    for (let date = Date.parse(`${BLOOD_TIES_LAUNCH_DATE}T00:00:00Z`); date < epoch * 86400000; date += 86400000) {
      const old = buildV2BloodTiesPuzzle(new Date(date).toISOString().slice(0,10));
      const groups = old.groups.map(g => ({ ...g, id: bloodTiesContents[0].catalogue.connections.find(c => c.name === g.name)?.id || `historical:${g.id}` }));
      const previous = { ...old, groups, pairs: pairs(groups) };
      seedHistory.push(previous);
      groups.forEach(g => categoryUsage.set(g.id, (categoryUsage.get(g.id) || 0) + 1));
    }
    return contents;
  }

  return function buildDailyBloodTiesPuzzle(dateKey) {
    if (!isValidDateKey(dateKey)) throw new Error('A valid UTC date is required.');
    // Keep already played dates, saved results and yesterday's answers immutable.
    if (dateKey < firstFairDate) return buildV2BloodTiesPuzzle(dateKey);
    const versions = prepareContents();
    const day = Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86400000) - epoch;
    for (let index = days.length; index <= day; index++) {
      const date = new Date((epoch + index) * 86400000).toISOString().slice(0,10);
      const content = versions.findLast(v => v.effectiveDate <= date);
      const history = index < 42 ? [...seedHistory, ...days] : days;
      const recentCategories = new Set(history.slice(-BLOOD_TIES_CATEGORY_COOLDOWN).flatMap(p => p.groups.map(g => g.id)));
      const recentTiles = new Set(history.slice(-BLOOD_TIES_TILE_COOLDOWN).flatMap(p => p.tiles));
      const olderCategories = new Set(history.slice(-42, -BLOOD_TIES_CATEGORY_COOLDOWN).flatMap(p => p.groups.map(g => g.id)));
      const olderTiles = new Set(history.slice(-21, -BLOOD_TIES_TILE_COOLDOWN).flatMap(p => p.tiles));
      const recentPairs = new Map();
      history.slice(-42).forEach(p => p.pairs.forEach(pair => recentPairs.set(pair, (recentPairs.get(pair) || 0) + 1)));
      // Keep a mix of gentle days and small deduction puzzles, instead of always
      // spending the easiest boards first. This is a preference, never a fallback
      // that relaxes fairness, coverage or either cooldown.
      const gentleDay = hashString(`${date}:blood-ties:gentle:v1`) % 5 === 0;
      // Occasionally prioritise a third recognisable connection; otherwise keep
      // coverage first, with a smaller clarity preference among equally used boards.
      const clearerDay = content.discoveryVersion >= 4 && hashString(`${date}:blood-ties:clearer:v4`) % 4 === 0;
      const overlapTarget = content.discoveryVersion >= 4
        ? Number(!gentleDay && hashString(`${date}:blood-ties:overlap:v4`) % 2 === 0)
        : gentleDay ? 0 : 1;
      let best, bestRank;
      for (const candidate of content.pool) {
        if (candidate.groups.some(g => recentCategories.has(g.id)) || candidate.tiles.some(t => recentTiles.has(t))) continue;
        // Coverage comes first. Then balance longer gaps, smaller ambiguity and
        // fresh category pairings, with a reproducible daily tie break.
        const repeats = candidate.groups.reduce((n, g) => n + (categoryUsage.get(g.id) || 0), 0);
        const recent = candidate.groups.filter(g => olderCategories.has(g.id)).length * 12 + candidate.tiles.filter(t => olderTiles.has(t)).length;
        const pairRepeats = candidate.pairs.reduce((n,pair) => n + (recentPairs.get(pair) || 0), 0);
        const pacing = content.discoveryVersion
          ? candidate.opening * 3 + (!gentleDay && candidate.redHerrings.length === 0 ? 4 : 0)
          : content.fairnessVersion >= 2 && !gentleDay && candidate.redHerrings.length === 0 ? 12 : 0;
        // V3 prefers two related pairs on ordinary days; variation days retain
        // the broader pool so rare families and every category can still appear.
        // Earlier policies retain their original rankings.
        const openingPreference = gentleDay || (content.discoveryVersion >= 3 ? candidate.categoryPairs : candidate.opening <= 1) ? 0 : 1;
        const rank = content.discoveryVersion >= 2 ? [openingPreference, clearerDay && candidate.approachableGroups < 3 ? 1 : 0, repeats,
          recent + pairRepeats * 4 + candidate.ambiguity * 2 + candidate.opening * 14
            + Math.abs(candidate.redHerrings.length - overlapTarget) * (content.discoveryVersion >= 4 ? 48 : 30)
            + (content.discoveryVersion >= 4 ? Math.max(0, 3 - candidate.approachableGroups) * 36 : 0) + candidate.literalGroups * 6,
          hashString(`${index}:blood-ties:v${content.version}:${candidate.signature}`)]
          : [content.discoveryVersion ? candidate.nameGroups - 1 : 0,
          content.discoveryVersion ? candidate.opening : 0,
          repeats, recent + pairRepeats * 4 + candidate.ambiguity * 2 + pacing,
          hashString(`${index}:blood-ties:v${content.version}:${candidate.signature}`)];
        const difference = bestRank ? rank.findIndex((value,i) => value !== bestRank[i]) : -1;
        if (!bestRank || difference >= 0 && rank[difference] < bestRank[difference]) { best = candidate; bestRank = rank; }
      }
      if (!best) throw new Error('No Blood Ties board satisfies the category and tile cooldowns.');
      days.push({ ...best, version: content.version });
      best.groups.forEach(g => categoryUsage.set(g.id, (categoryUsage.get(g.id) || 0) + 1));
    }
    const selected = days[day];
    const groups = selected.groups.map(({ tiles, ...group }) => ({ ...group, eligibleTiles: [...tiles], answers: [...group.answers] }));
    const key = `${dateKey}:blood:v${selected.version}:${hashString(selected.signature).toString(16)}`;
    return { dateKey, key, contentVersion: selected.version, groups, tiles: shuffle(selected.tiles, createRng(hashString(`${key}:display`))), redHerrings: [...selected.redHerrings] };
  };
}
