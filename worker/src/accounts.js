import {
  buildDailyPuzzle,
  calculateBonusPoints,
  calculateMapPoints,
  getUtcDateKey,
  isAcceptedMapSelection,
  isCorrectOrder,
  isValidDateKey,
} from "../../js/game-core.js";
import { answerEquivalents, workerMaps } from "./generated-map-catalog.js";

const maximumCounter = 1_000_000_000;
const allowedPhases = new Set(["clues", "game", "map", "result"]);

function safeCounter(value) {
  return Number.isInteger(value) && value >= 0 && value <= maximumCounter ? value : 0;
}

export function normalizeUsername(value) {
  const username = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z0-9_]{3,20}$/.test(username) ? username : null;
}

export function sanitizeProgress(value = {}) {
  const lastPlayedDate = isValidDateKey(value.lastPlayedDate) ? value.lastPlayedDate : null;
  let missedDayState = null;

  if (value.missedDayState && typeof value.missedDayState === "object") {
    const candidate = value.missedDayState;
    if (
      isValidDateKey(candidate.dateKey) &&
      Number.isInteger(candidate.missedDays) &&
      candidate.missedDays > 0
    ) {
      missedDayState = {
        dateKey: candidate.dateKey,
        missedDays: Math.min(candidate.missedDays, 100_000),
        roundsBeforeLoss: safeCounter(candidate.roundsBeforeLoss),
        pointsBeforeLoss: safeCounter(candidate.pointsBeforeLoss),
        revived: Boolean(candidate.revived),
        resolved: Boolean(candidate.resolved),
        reviveCostPaid: safeCounter(candidate.reviveCostPaid),
      };
    }
  }

  const currentRound = safeCounter(value.currentRound);
  return {
    currentRound,
    bestRound: Math.max(currentRound, safeCounter(value.bestRound)),
    pointsBalance: safeCounter(value.pointsBalance),
    totalRounds: safeCounter(value.totalRounds),
    reviveCount: safeCounter(value.reviveCount),
    lastPlayedDate,
    missedDayState,
  };
}

export function sanitizeDailyState(value, puzzleDate) {
  if (!value || typeof value !== "object" || !isValidDateKey(puzzleDate)) return null;
  if (!allowedPhases.has(value.phase)) return null;
  if (typeof value.puzzleKey !== "string" || !value.puzzleKey.startsWith(`${puzzleDate}:`)) {
    return null;
  }

  const stringOrNull = (candidate, maximumLength = 160) =>
    typeof candidate === "string" && candidate.length <= maximumLength ? candidate : null;
  const idList = (candidate) =>
    Array.isArray(candidate)
      ? candidate.filter((item) => typeof item === "string" && item.length <= 160).slice(0, 3)
      : [];

  return {
    stateVersion: safeCounter(value.stateVersion),
    puzzleKey: value.puzzleKey.slice(0, 1024),
    phase: value.phase,
    cluesRevealed: Math.min(3, Math.max(1, safeCounter(value.cluesRevealed))),
    lockedClues: value.lockedClues == null
      ? null
      : Math.min(3, Math.max(1, safeCounter(value.lockedClues))),
    selectedGameId: stringOrNull(value.selectedGameId, 100),
    selectedMapId: stringOrNull(value.selectedMapId, 100),
    isCorrect: typeof value.isCorrect === "boolean" ? value.isCorrect : null,
    bonusOrder: idList(value.bonusOrder),
    bonusComplete: Boolean(value.bonusComplete),
    bonusFailed: Boolean(value.bonusFailed),
    streakRecorded: Boolean(value.streakRecorded),
    totalRoundsRecorded: Boolean(value.totalRoundsRecorded),
    roundsSurvivedBeforeLoss: safeCounter(value.roundsSurvivedBeforeLoss),
    pointsBeforeLoss: safeCounter(value.pointsBeforeLoss),
    revived: Boolean(value.revived),
    reviveCostPaid: safeCounter(value.reviveCostPaid),
    reviveCostOffered: safeCounter(value.reviveCostOffered),
    mapPoints: safeCounter(value.mapPoints),
    bonusPoints: safeCounter(value.bonusPoints),
    pointsRecorded: Boolean(value.pointsRecorded),
    bonusPointsRecorded: Boolean(value.bonusPointsRecorded),
  };
}

function rowToProfile(row) {
  return row
    ? {
        username: row.username,
        leaderboardVisible: Boolean(row.leaderboard_visible),
        createdAt: row.created_at,
      }
    : null;
}

function rowToProgress(row) {
  if (!row) return null;
  let missedDayState = null;
  try {
    missedDayState = row.missed_day_json ? JSON.parse(row.missed_day_json) : null;
  } catch {
    missedDayState = null;
  }
  return {
    currentRound: Number(row.current_round || 0),
    bestRound: Number(row.best_round || 0),
    pointsBalance: Number(row.points_balance || 0),
    totalRounds: Number(row.total_rounds || 0),
    reviveCount: Number(row.revive_count || 0),
    lastPlayedDate: row.last_played_date || null,
    missedDayState,
    revision: Number(row.revision || 1),
    updatedAt: row.updated_at,
  };
}

function rowToResult(row) {
  return row
    ? {
        puzzleDate: row.puzzle_date,
        puzzleId: row.puzzle_id,
        selectedMapId: row.selected_map_id,
        cluesUsed: Number(row.clues_used),
        mapCorrect: Boolean(row.map_correct),
        mapPoints: Number(row.map_points),
        bonusStatus: row.bonus_status,
        bonusPoints: Number(row.bonus_points),
        pointsEarned: Number(row.points_earned),
        completedAt: row.completed_at || null,
      }
    : null;
}

async function readJsonBody(request, maximumBytes = 20_000) {
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > maximumBytes) throw new Error("The request body is too large.");
  const body = await request.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("A JSON object is required.");
  }
  return body;
}

export async function getAccount(db, userId, dateKey) {
  if (!isValidDateKey(dateKey)) return { status: 400, body: { error: "A valid date is required." } };
  const [profileResult, progressResult, dailyResult, verifiedResult] = await db.batch([
    db.prepare("SELECT * FROM player_profiles WHERE user_id = ?").bind(userId),
    db.prepare("SELECT * FROM player_saves WHERE user_id = ?").bind(userId),
    db
      .prepare("SELECT state_json FROM player_daily_saves WHERE user_id = ? AND puzzle_date = ?")
      .bind(userId, dateKey),
    db
      .prepare("SELECT * FROM player_daily_results WHERE user_id = ? AND puzzle_date = ?")
      .bind(userId, dateKey),
  ]);

  const profile = rowToProfile(profileResult.results?.[0]);
  if (!profile) return { status: 200, body: { needsOnboarding: true } };

  let dailyState = null;
  try {
    dailyState = dailyResult.results?.[0]?.state_json
      ? JSON.parse(dailyResult.results[0].state_json)
      : null;
  } catch {
    dailyState = null;
  }

  return {
    status: 200,
    body: {
      needsOnboarding: false,
      profile,
      progress: rowToProgress(progressResult.results?.[0]),
      dailyState,
      verifiedResult: rowToResult(verifiedResult.results?.[0]),
    },
  };
}

export async function registerAccount(db, request, userId) {
  const body = await readJsonBody(request);
  const username = normalizeUsername(body.username);
  if (!username) {
    return {
      status: 400,
      body: { error: "Use 3–20 letters, numbers or underscores for your username." },
    };
  }

  const existing = await db
    .prepare("SELECT username FROM player_profiles WHERE user_id = ?")
    .bind(userId)
    .first();
  if (existing) return { status: 409, body: { error: "This account is already set up." } };

  const progress = sanitizeProgress(body.progress);
  const puzzleDate = isValidDateKey(body.puzzleDate) ? body.puzzleDate : null;
  const dailyState = puzzleDate ? sanitizeDailyState(body.dailyState, puzzleDate) : null;
  const importedAt = body.importLocalProgress ? new Date().toISOString() : null;

  const statements = [
    db
      .prepare(
        `INSERT INTO player_profiles (
          user_id, username, leaderboard_visible, legacy_imported_at
        ) VALUES (?, ?, 1, ?)`,
      )
      .bind(userId, username, importedAt),
    db
      .prepare(
        `INSERT INTO player_saves (
          user_id, current_round, best_round, points_balance, total_rounds,
          revive_count, last_played_date, missed_day_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        userId,
        body.importLocalProgress ? progress.currentRound : 0,
        body.importLocalProgress ? progress.bestRound : 0,
        body.importLocalProgress ? progress.pointsBalance : 0,
        body.importLocalProgress ? progress.totalRounds : 0,
        body.importLocalProgress ? progress.reviveCount : 0,
        body.importLocalProgress ? progress.lastPlayedDate : null,
        body.importLocalProgress && progress.missedDayState
          ? JSON.stringify(progress.missedDayState)
          : null,
      ),
  ];

  if (body.importLocalProgress && puzzleDate && dailyState) {
    statements.push(
      db
        .prepare(
          "INSERT INTO player_daily_saves (user_id, puzzle_date, state_json) VALUES (?, ?, ?)",
        )
        .bind(userId, puzzleDate, JSON.stringify(dailyState)),
    );
  }

  try {
    await db.batch(statements);
  } catch (error) {
    if (/unique/i.test(String(error?.message || error))) {
      return { status: 409, body: { error: "That username is already taken." } };
    }
    throw error;
  }

  return { status: 201, body: { username } };
}

export async function updateAccountUsername(db, request, userId) {
  const body = await readJsonBody(request, 1_000);
  const username = normalizeUsername(body.username);
  if (!username) {
    return {
      status: 400,
      body: { error: "Use 3–20 letters, numbers or underscores for your username." },
    };
  }

  const profile = await db
    .prepare("SELECT username FROM player_profiles WHERE user_id = ?")
    .bind(userId)
    .first();
  if (!profile) {
    return { status: 409, body: { error: "Finish setting up your account first." } };
  }

  try {
    await db
      .prepare(
        `UPDATE player_profiles
        SET username = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?`,
      )
      .bind(username, userId)
      .run();
  } catch (error) {
    if (/unique/i.test(String(error?.message || error))) {
      return { status: 409, body: { error: "That username is already taken." } };
    }
    throw error;
  }

  return { status: 200, body: { username } };
}

export async function saveAccount(db, request, userId) {
  const body = await readJsonBody(request);
  const progress = sanitizeProgress(body.progress);
  const puzzleDate = isValidDateKey(body.puzzleDate) ? body.puzzleDate : null;
  const dailyState = puzzleDate ? sanitizeDailyState(body.dailyState, puzzleDate) : null;
  const profile = await db
    .prepare("SELECT user_id FROM player_profiles WHERE user_id = ?")
    .bind(userId)
    .first();
  if (!profile) return { status: 409, body: { error: "Finish setting up your account first." } };

  const statements = [
    db
      .prepare(
        `UPDATE player_saves SET
          current_round = ?,
          best_round = MAX(best_round, ?),
          points_balance = ?,
          total_rounds = ?,
          revive_count = ?,
          last_played_date = ?,
          missed_day_json = ?,
          revision = revision + 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?`,
      )
      .bind(
        progress.currentRound,
        progress.bestRound,
        progress.pointsBalance,
        progress.totalRounds,
        progress.reviveCount,
        progress.lastPlayedDate,
        progress.missedDayState ? JSON.stringify(progress.missedDayState) : null,
        userId,
      ),
  ];

  if (puzzleDate && dailyState) {
    statements.push(
      db
        .prepare(
          `INSERT INTO player_daily_saves (user_id, puzzle_date, state_json)
          VALUES (?, ?, ?)
          ON CONFLICT (user_id, puzzle_date) DO UPDATE SET
            state_json = excluded.state_json,
            updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(userId, puzzleDate, JSON.stringify(dailyState)),
    );
  }

  await db.batch(statements);
  const saved = await db
    .prepare("SELECT * FROM player_saves WHERE user_id = ?")
    .bind(userId)
    .first();
  return { status: 200, body: { progress: rowToProgress(saved) } };
}

export async function recordVerifiedMapResult(db, request, userId) {
  const body = await readJsonBody(request, 5_000);
  const today = getUtcDateKey();
  if (body.puzzleDate !== today || !isValidDateKey(body.puzzleDate)) {
    return { status: 400, body: { error: "Only today’s live result can be saved." } };
  }
  if (
    typeof body.selectedMapId !== "string" ||
    body.selectedMapId.length > 100 ||
    !Number.isInteger(body.cluesUsed) ||
    body.cluesUsed < 1 ||
    body.cluesUsed > 3
  ) {
    return { status: 400, body: { error: "The submitted map result is invalid." } };
  }

  const puzzle = buildDailyPuzzle(body.puzzleDate, workerMaps);
  if (body.puzzleId !== puzzle.key) {
    return { status: 400, body: { error: "The submitted puzzle does not match today’s round." } };
  }
  const mapCorrect = isAcceptedMapSelection(
    body.selectedMapId,
    puzzle.map.id,
    answerEquivalents,
  );
  const mapPoints = mapCorrect ? calculateMapPoints(body.cluesUsed) : 0;
  const bonusStatus = mapCorrect ? "pending" : "unavailable";

  await db
    .prepare(
      `INSERT OR IGNORE INTO player_daily_results (
        user_id, puzzle_date, puzzle_id, selected_map_id, clues_used,
        map_correct, map_points, bonus_status, points_earned, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      userId,
      body.puzzleDate,
      puzzle.key,
      body.selectedMapId,
      body.cluesUsed,
      mapCorrect ? 1 : 0,
      mapPoints,
      bonusStatus,
      mapPoints,
      mapCorrect ? null : new Date().toISOString(),
    )
    .run();

  const result = await db
    .prepare("SELECT * FROM player_daily_results WHERE user_id = ? AND puzzle_date = ?")
    .bind(userId, body.puzzleDate)
    .first();
  return { status: 200, body: { result: rowToResult(result) } };
}

export async function recordVerifiedBonusResult(db, request, userId) {
  const body = await readJsonBody(request, 5_000);
  const today = getUtcDateKey();
  if (body.puzzleDate !== today || !Array.isArray(body.bonusOrder)) {
    return { status: 400, body: { error: "The submitted bonus result is invalid." } };
  }

  const result = await db
    .prepare("SELECT * FROM player_daily_results WHERE user_id = ? AND puzzle_date = ?")
    .bind(userId, body.puzzleDate)
    .first();
  if (!result || !result.map_correct) {
    return { status: 409, body: { error: "A correct map result is required first." } };
  }
  if (result.bonus_status !== "pending") {
    return { status: 200, body: { result: rowToResult(result) } };
  }

  const puzzle = buildDailyPuzzle(body.puzzleDate, workerMaps);
  if (result.puzzle_id !== puzzle.key) {
    return { status: 409, body: { error: "The saved map result is for a different puzzle." } };
  }
  const bonusCorrect = isCorrectOrder(body.bonusOrder, puzzle.chronologicalSteps);
  const bonusPoints = calculateBonusPoints(Number(result.map_points), bonusCorrect);
  const bonusStatus = bonusCorrect ? "correct" : "incorrect";

  await db
    .prepare(
      `UPDATE player_daily_results SET
        bonus_status = ?,
        bonus_points = ?,
        points_earned = map_points + ?,
        completed_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND puzzle_date = ? AND bonus_status = 'pending'`,
    )
    .bind(
      bonusStatus,
      bonusPoints,
      bonusPoints,
      new Date().toISOString(),
      userId,
      body.puzzleDate,
    )
    .run();

  const savedResult = await db
    .prepare("SELECT * FROM player_daily_results WHERE user_id = ? AND puzzle_date = ?")
    .bind(userId, body.puzzleDate)
    .first();
  return { status: 200, body: { result: rowToResult(savedResult) } };
}
