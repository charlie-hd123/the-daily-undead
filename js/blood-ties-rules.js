export const BLOOD_TIES_RULES_VERSION = 4;
export const BLOOD_TIES_MAX_STRIKES = 3;

export const trioKey = (tiles) => [...tiles].sort().join('\u001f');

// Scoring is tied to dated content, so old boards, saves and awards never change.
export const bloodTiesRulesVersion = puzzle => puzzle.contentVersion >= 5 ? 4 : 3;

export function createBloodTiesSession(puzzle, rulesVersion = bloodTiesRulesVersion(puzzle)) {
  if (![1, 2, 3, BLOOD_TIES_RULES_VERSION].includes(rulesVersion)) throw new Error('Invalid Blood Ties rules version.');
  const currentRules = bloodTiesRulesVersion(puzzle);
  if (rulesVersion > currentRules || puzzle.contentVersion >= 2 && rulesVersion !== currentRules) throw new Error('Blood Ties puzzles require the current rules for their content version.');
  return { key: puzzle.key, rulesVersion, attempts: [], selected: [], solved: [], misses: 0, strikes: 0, potentialPoints: 100, complete: false, success: null, points: 0, message: '', shuffleCount: 0 };
}

export function calculateBloodTiesPoints(misses, rulesVersion = BLOOD_TIES_RULES_VERSION) {
  if (!Number.isInteger(misses) || misses < 0) return 0;
  if (rulesVersion === 1) return [100, 70, 40][misses] ?? 0;
  return rulesVersion >= 4 ? [100, 80, 60, 40, 30, 20][misses] ?? 10 : Math.max(0, 100 - 10 * misses);
}

// Shared replay is authoritative for browser restores, account saves and scoring.
export function replayBloodTiesAttempts(puzzle, attempts = [], rulesVersion = bloodTiesRulesVersion(puzzle)) {
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
    // Completed saves retain their verified rules. Unfinished saves replay under
    // the rules for their dated board, preserving issued puzzles and scores.
    if (value.rulesVersion !== undefined && ![1, 2, 3, BLOOD_TIES_RULES_VERSION].includes(value.rulesVersion)) return null;
    const rulesVersion = value.complete ? value.rulesVersion ?? 1 : bloodTiesRulesVersion(puzzle);
    const replay = replayBloodTiesAttempts(puzzle, value.attempts, rulesVersion);
    const remaining = puzzle.groups.filter((g) => !replay.solved.includes(g.id)).flatMap((g) => g.answers);
    return { ...replay, selected: Array.isArray(value.selected) ? [...new Set(value.selected)].filter((t) => remaining.includes(t)).slice(0, 3) : [],
      shuffleCount: Number.isInteger(value.shuffleCount) && value.shuffleCount >= 0 ? value.shuffleCount : 0,
      newBestRound: Boolean(value.newBestRound), roundsSurvivedBeforeLoss: Number(value.roundsSurvivedBeforeLoss) || 0 };
  } catch { return null; }
}
