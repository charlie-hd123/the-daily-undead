import { createRng, hashString, isValidDateKey, shuffle } from './game-core.js';
import { bloodTiesCatalogue } from './blood-ties-catalogue.js';

export const BLOOD_TIES_LAUNCH_DATE = '2026-10-22';
export const BLOOD_TIES_RULES_VERSION = 3;
export const BLOOD_TIES_MAX_STRIKES = 3;
const epoch = Date.parse('2026-10-01T00:00:00Z') / 86400000;
const catalogues = new WeakMap();
const trioKey = (tiles) => [...tiles].sort().join('\u001f');

function triples(items) {
  const result = [];
  for (let a = 0; a < items.length - 2; a++)
    for (let b = a + 1; b < items.length - 1; b++)
      for (let c = b + 1; c < items.length; c++) result.push([items[a], items[b], items[c]]);
  return result;
}

// Exact cover: every selected connection is used once, every tile once.
// Stop at two; alternate solve orders of the same partition are not ambiguity.
export function countBloodTiesSolutions(groups, tiles, limit = 2) {
  if (tiles.length !== 12 || new Set(tiles).size !== 12 || groups.length !== 4) return 0;
  const choices = groups.map((group) => triples(tiles.map((tile, i) => group.tiles.includes(tile) ? i : -1).filter((i) => i >= 0))
    .map((indices) => indices.reduce((mask, i) => mask | (1 << i), 0)))
    .sort((a, b) => a.length - b.length);
  let count = 0;
  function visit(index, used) {
    if (count >= limit) return;
    if (index === 4) { if (used === 4095) count++; return; }
    for (const mask of choices[index]) if (!(mask & used)) visit(index + 1, mask | used);
  }
  visit(0, 0);
  return count;
}

function prepareCatalogue(catalogue) {
  if (catalogues.has(catalogue)) return catalogues.get(catalogue);
  const connections = catalogue.connections.filter((g) => new Set(g.tiles).size >= 3)
    .slice().sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const random = createRng(hashString(`blood-ties:v1:${catalogue.sourceSha256 || JSON.stringify(connections)}`));
  const pool = [], seen = new Set();
  for (let attempt = 0; attempt < 100000 && pool.length < 1536; attempt++) {
    const selected = shuffle(connections, random).slice(0, 4);
    const used = new Set();
    const groups = selected.map((connection) => {
      const tiles = shuffle(connection.tiles.filter((tile) => !used.has(tile)), random).slice(0, 3);
      tiles.forEach((tile) => used.add(tile));
      return { ...connection, answers: tiles };
    });
    if (groups.some((g) => g.answers.length !== 3)) continue;
    const tiles = groups.flatMap((g) => g.answers);
    // At least two tiles deliberately look at home in another selected category.
    const redHerrings = groups.flatMap((owner) => owner.answers.filter((tile) => groups.some((g) => g.id !== owner.id && g.tiles.includes(tile))));
    if (redHerrings.length < 2 || countBloodTiesSolutions(groups, tiles) !== 1) continue;
    const signature = groups.map((g) => `${g.id}:${trioKey(g.answers)}`).sort().join('|');
    if (seen.has(signature)) continue;
    seen.add(signature);
    pool.push({ groups, tiles, redHerrings, signature });
  }
  if (pool.length < 100) throw new Error('The Blood Ties database needs more unambiguous overlapping connections.');
  const prepared = { pool, days: [] };
  catalogues.set(catalogue, prepared);
  return prepared;
}

export function buildDailyBloodTiesPuzzle(dateKey, catalogue = bloodTiesCatalogue) {
  if (!isValidDateKey(dateKey)) throw new Error('A valid UTC date is required.');
  const { pool, days } = prepareCatalogue(catalogue);
  const day = Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86400000) - epoch;
  // The frozen demo catalogue and generator version preserve previous assignments.
  // History is computed from a fixed UTC epoch, never from this browser's play history.
  for (let index = days.length; index <= Math.max(0, day); index++) {
    const recentCategories = new Set(days.slice(-3).flatMap((p) => p.groups.map((g) => g.id)));
    const recentTiles = new Set(days.slice(-3).flatMap((p) => p.tiles));
    const olderTiles = new Set(days.slice(-7, -3).flatMap((p) => p.tiles));
    let best, bestRank = Infinity;
    for (const candidate of pool) {
      if (candidate.groups.some((g) => recentCategories.has(g.id)) || candidate.tiles.some((t) => recentTiles.has(t))) continue;
      const repeats = candidate.tiles.filter((t) => olderTiles.has(t)).length;
      const rank = repeats * 4294967296 + hashString(`${index}:blood-ties:v1:${candidate.signature}`);
      if (rank < bestRank) { best = candidate; bestRank = rank; }
    }
    if (!best) throw new Error('No Blood Ties board satisfies the recent-category and tile cooldowns.');
    days.push(best);
  }
  const selected = day < 0 ? pool[hashString(dateKey) % pool.length] : days[day];
  const groups = selected.groups.map(({ tiles, ...group }) => ({ ...group, eligibleTiles: [...tiles], answers: [...group.answers] }));
  const key = `${dateKey}:blood:v1:${hashString(selected.signature).toString(16)}`;
  return { dateKey, key, groups, tiles: shuffle(selected.tiles, createRng(hashString(`${key}:display`))), redHerrings: [...selected.redHerrings] };
}

export function createBloodTiesSession(puzzle, rulesVersion = BLOOD_TIES_RULES_VERSION) {
  if (![1, 2, BLOOD_TIES_RULES_VERSION].includes(rulesVersion)) throw new Error('Invalid Blood Ties rules version.');
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
