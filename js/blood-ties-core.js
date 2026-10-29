import { createRng, hashString, isValidDateKey, shuffle } from './game-core.js';
import { bloodTiesContents } from './blood-ties-content.js';
import { buildDailyBloodTiesPuzzle as buildV2BloodTiesPuzzle } from './blood-ties-v2.js';
import { BLOOD_TIES_DISCOVERY_VERSION, resolveBloodTiesTrioDiscovery } from './blood-ties-discovery.js';
export { countBloodTiesSolutions } from './blood-ties-legacy.js';

export const BLOOD_TIES_LAUNCH_DATE = '2026-10-22';
export const BLOOD_TIES_RULES_VERSION = 3;
export const BLOOD_TIES_MAX_STRIKES = 3;
export const BLOOD_TIES_CONTENT_DATE = bloodTiesContents.at(-1).catalogue.effectiveDate;
export const BLOOD_TIES_CATEGORY_COOLDOWN = 14;
export const BLOOD_TIES_TILE_COOLDOWN = 7;
const firstFairDate = '2026-10-26';
const epoch = Date.parse(`${firstFairDate}T00:00:00Z`) / 86400000;
const trioKey = (tiles) => [...tiles].sort().join('\u001f');
const days = [];
const categoryUsage = new Map();
let contents;
let seedHistory;
const pairs = groups => groups.flatMap((g,i) => groups.slice(i+1).map(h => [g.id,h.id].sort().join(':')));

function prepareContents() {
  if (contents) return contents;
  contents = bloodTiesContents.map(({ catalogue, boards },i) => {
    if (boards.sourceSha256 !== catalogue.sourceSha256 || boards.version !== catalogue.version || boards.effectiveDate !== catalogue.effectiveDate
      || !isValidDateKey(catalogue.effectiveDate) || catalogue.version < 3
      || (i === 0 ? catalogue.effectiveDate !== firstFairDate : catalogue.effectiveDate <= bloodTiesContents[i-1].catalogue.effectiveDate)) throw new Error('Blood Ties content history or board pool does not match its workbook.');
    if ((catalogue.generationPolicy === 'discovery-v1') !== (boards.discoveryVersion === BLOOD_TIES_DISCOVERY_VERSION)
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
      return { groups, tiles, redHerrings, signature, pairs: pairs(groups), ambiguity: boards.ambiguity[index], ...(boards.discoveryVersion ? { opening: boards.opening[index], nameGroups: groups.filter(g => g.discovery.method === 'name').length } : {}) };
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

export function buildDailyBloodTiesPuzzle(dateKey) {
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
      // Budget scarce name themes across the full cooldown, rather than using
      // three or four on early days and exhausting every approachable board.
      const rank = [content.discoveryVersion ? candidate.nameGroups - 1 : 0,
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
}

export function createBloodTiesSession(puzzle, rulesVersion = BLOOD_TIES_RULES_VERSION) {
  if (![1, 2, BLOOD_TIES_RULES_VERSION].includes(rulesVersion)) throw new Error('Invalid Blood Ties rules version.');
  if (puzzle.contentVersion >= 2 && rulesVersion !== BLOOD_TIES_RULES_VERSION) throw new Error('New Blood Ties puzzles require the current rules.');
  return { key: puzzle.key, rulesVersion, attempts: [], selected: [], solved: [], misses: 0, strikes: 0, potentialPoints: 100, complete: false, success: null, points: 0, message: '', shuffleCount: 0 };
}

export function calculateBloodTiesPoints(misses, rulesVersion = BLOOD_TIES_RULES_VERSION) {
  if (!Number.isInteger(misses) || misses < 0) return 0;
  return rulesVersion === 1 ? [100, 70, 40][misses] ?? 0 : Math.max(0, 100 - 10 * misses);
}

// Shared replay is authoritative for browser restores, account saves and scoring.
export function replayBloodTiesAttempts(puzzle, attempts = [], rulesVersion = BLOOD_TIES_RULES_VERSION) {
  const session = createBloodTiesSession(puzzle, rulesVersion);
  // Two misses can precede each of the first three solves; the last trio is submitted too.
  if (!Array.isArray(attempts) || attempts.length > (rulesVersion === 1 ? 5 : rulesVersion === 2 ? 9 : 10)) throw new Error('Invalid Blood Ties attempt history.');
  const seen = new Set();
  for (const attempt of attempts) {
    if (session.complete || !Array.isArray(attempt) || attempt.length !== 3 || new Set(attempt).size !== 3
      || attempt.some((tile) => !puzzle.tiles.includes(tile) || puzzle.groups.some((g) => session.solved.includes(g.id) && g.answers.includes(tile)))
      || seen.has(trioKey(attempt))) throw new Error('Invalid Blood Ties attempt.');
    seen.add(trioKey(attempt));
    session.attempts.push([...attempt]);
    const match = puzzle.groups.find((g) => trioKey(g.answers) === trioKey(attempt));
    if (match) {
      session.solved.push(match.id);
      if (rulesVersion !== 1) session.strikes = 0;
      session.message = `${match.name}. Connection found!`;
      if (session.solved.length === (rulesVersion < 3 ? 3 : 4)) {
        if (rulesVersion < 3) session.solved.push(puzzle.groups.find((g) => !session.solved.includes(g.id)).id);
        session.complete = true;
        session.success = true;
        session.points = session.potentialPoints;
        session.message = rulesVersion < 3 ? 'Three connections found. The final Blood Tie is revealed.' : 'All four connections found!';
      }
    } else {
      session.misses++;
      session.strikes++;
      session.potentialPoints = calculateBloodTiesPoints(session.misses, rulesVersion);
      const near = puzzle.groups.some((g) => !session.solved.includes(g.id) && attempt.filter((t) => g.answers.includes(t)).length === 2);
      session.message = near ? 'One tile away. Try a different connection.' : 'Those tiles don’t match this puzzle’s connections. Try again.';
      if (session.strikes === BLOOD_TIES_MAX_STRIKES) {
        session.complete = true; session.success = false; session.message = 'Three strikes. Here are the connections.';
      }
    }
  }
  return session;
}

export function normalizeBloodTiesSession(puzzle, value) {
  if (!value || value.key !== puzzle.key) return null;
  try {
    // Completed pre-update saves retain their verified old result. Unfinished
    // saves adopt the new rules by replaying their original submission history.
    if (value.rulesVersion !== undefined && ![1, 2, BLOOD_TIES_RULES_VERSION].includes(value.rulesVersion)) return null;
    const rulesVersion = value.complete ? value.rulesVersion ?? 1 : BLOOD_TIES_RULES_VERSION;
    const replay = replayBloodTiesAttempts(puzzle, value.attempts, rulesVersion);
    const remaining = puzzle.groups.filter((g) => !replay.solved.includes(g.id)).flatMap((g) => g.answers);
    return { ...replay, selected: Array.isArray(value.selected) ? [...new Set(value.selected)].filter((t) => remaining.includes(t)).slice(0, 3) : [],
      shuffleCount: Number.isInteger(value.shuffleCount) && value.shuffleCount >= 0 ? value.shuffleCount : 0,
      newBestRound: Boolean(value.newBestRound), roundsSurvivedBeforeLoss: Number(value.roundsSurvivedBeforeLoss) || 0 };
  } catch { return null; }
}
