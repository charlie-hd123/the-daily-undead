import {
  buildDailyPuzzle,
  calculateBonusPoints,
  calculateMapPoints,
  getUtcDateKey,
  isAcceptedMapSelection,
  isCorrectOrder,
  isValidDateKey,
} from "../../js/game-core.js";
import {
  answerEquivalents,
  profileGames,
  profileMaps,
  workerMaps,
} from "./generated-map-catalog.js";

const maximumCounter = 1_000_000_000;
const allowedPhases = new Set(["clues", "game", "map", "result"]);

function safeCounter(value) {
  return Number.isInteger(value) && value >= 0 && value <= maximumCounter ? value : 0;
}

export function normalizeUsername(value) {
  const username = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z0-9_]{3,16}$/.test(username) ? username : null;
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
        resolved: Boolean(candidate.resolved),
      };
    }
  }

  const currentRound = Math.max(1, safeCounter(value.currentRound));
  const score = safeCounter(value.score ?? value.pointsBalance);
  const solves = safeCounter(value.solves ?? value.totalRounds);
  return {
    currentRound,
    bestRound: Math.max(currentRound, safeCounter(value.bestRound)),
    score,
    solves,
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
    newBestRound: Boolean(value.newBestRound),
    streakRecorded: Boolean(value.streakRecorded),
    totalRoundsRecorded: Boolean(value.totalRoundsRecorded),
    roundsSurvivedBeforeLoss: safeCounter(value.roundsSurvivedBeforeLoss),
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
        avatarId: normalizeAvatarId(row.avatar_id),
        themeId: row.theme_id && row.theme_id !== "aether" ? row.theme_id : "default",
        favouriteGame: row.favourite_game || "",
        favouriteMap: row.favourite_map || "",
        bio: row.bio || "",
        createdAt: row.created_at,
      }
    : null;
}

const avatarIds = new Set([
  "unselected",
  "richtofen", "dempsey", "takeo", "nikolai", "samantha", "dr-maxis", "dr-monty", "warden",
  "misty", "stuhlinger", "marlton", "russman", "scarlett", "diego", "bruno", "stanton",
  "weaver", "grey", "carver", "maya", "shadowman", "tedd", "brutus",
]);
const legacyAvatarIds = new Map([
  ["scientist", "richtofen"], ["soldier", "dempsey"], ["warrior", "takeo"],
  ["explorer", "nikolai"], ["punk", "misty"], ["hazmat", "carver"],
]);
const avatarUnlocks = new Map([
  ["samantha", { type: "round", value: 5 }], ["dr-maxis", { type: "round", value: 5 }],
  ["misty", { type: "round", value: 15 }], ["stuhlinger", { type: "round", value: 15 }],
  ["marlton", { type: "round", value: 15 }], ["russman", { type: "round", value: 15 }],
  ["tedd", { type: "maps", value: 20 }], ["brutus", { type: "maps", value: 50 }],
  ["shadowman", { type: "round", value: 30 }], ["dr-monty", { type: "maps", value: 100 }],
  ["scarlett", { type: "maps", value: 25 }], ["diego", { type: "maps", value: 25 }],
  ["bruno", { type: "maps", value: 25 }], ["stanton", { type: "maps", value: 25 }],
  ["weaver", { type: "round", value: 10 }], ["grey", { type: "round", value: 10 }],
  ["carver", { type: "round", value: 10 }], ["maya", { type: "round", value: 10 }],
  ["warden", { type: "round", value: 30 }],
]);

function normalizeAvatarId(value) {
  if (avatarIds.has(value)) return value;
  return legacyAvatarIds.get(value) || "unselected";
}
const themeUnlocks = new Map([
  ["default", 0],
  ["afterlife", 50],
  ["outbreak", 100],
  ["hellfire", 250],
  ["blood-moon", 500],
  ["dark-aether", 1000],
]);
const allowedFavouriteGames = new Set(profileGames);
const allowedFavouriteMaps = new Set(profileMaps);

function cleanProfileText(value, maximumLength) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maximumLength);
}

export function sanitizeSocialProfile(value = {}) {
  const favouriteGame = cleanProfileText(value.favouriteGame, 50);
  const favouriteMap = cleanProfileText(value.favouriteMap, 50);
  return {
    avatarId: normalizeAvatarId(value.avatarId),
    themeId: themeUnlocks.has(value.themeId) ? value.themeId : "default",
    favouriteGame: allowedFavouriteGames.has(favouriteGame) ? favouriteGame : "",
    favouriteMap: allowedFavouriteMaps.has(favouriteMap) ? favouriteMap : "",
    bio: cleanProfileText(value.bio, 180),
  };
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
    score: Number(row.score || 0),
    solves: Number(row.total_rounds || 0),
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

function followingDateKey(dateKey) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export async function reconstructRound(db, userId, progressRow, todayDateKey) {
  const anchorDate = progressRow?.round_anchor_date;
  if (!isValidDateKey(anchorDate) || anchorDate >= todayDateKey) return progressRow;

  const [resultsQuery, protectedQuery] = await db.batch([
    db.prepare(
      `SELECT puzzle_date, map_correct
      FROM player_daily_results
      WHERE user_id = ? AND puzzle_date > ? AND puzzle_date <= ?
      ORDER BY puzzle_date`,
    ).bind(userId, anchorDate, todayDateKey),
    db.prepare(
      `SELECT game_date
      FROM game_dates
      WHERE game_date > ? AND game_date < ? AND counts_for_round = 0`,
    ).bind(anchorDate, todayDateKey),
  ]);

  const results = new Map(
    (resultsQuery.results || []).map((row) => [row.puzzle_date, Boolean(row.map_correct)]),
  );
  const protectedDates = new Set(
    (protectedQuery.results || []).map((row) => row.game_date),
  );
  let currentRound = Math.max(1, Number(progressRow.round_anchor_value || 0));
  let bestRound = Math.max(Number(progressRow.best_round || 0), currentRound);

  for (let date = followingDateKey(anchorDate); date <= todayDateKey; date = followingDateKey(date)) {
    if (protectedDates.has(date)) continue;
    if (results.has(date)) {
      currentRound = results.get(date) ? currentRound + 1 : 1;
      bestRound = Math.max(bestRound, currentRound);
    } else if (date < todayDateKey) {
      currentRound = 1;
    }
  }

  if (
    currentRound === Number(progressRow.current_round || 0) &&
    bestRound === Number(progressRow.best_round || 0)
  ) return progressRow;

  await db.prepare(
    `UPDATE player_saves SET
      current_round = ?,
      best_round = MAX(best_round, ?),
      revision = revision + 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?`,
  ).bind(currentRound, bestRound, userId).run();
  return db.prepare("SELECT * FROM player_saves WHERE user_id = ?").bind(userId).first();
}

export async function readJsonBody(request, maximumBytes = 20_000) {
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > maximumBytes) {
    throw Object.assign(new Error("The request body is too large."), { status: 413 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    throw Object.assign(new Error("The request body must be valid JSON."), { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw Object.assign(new Error("A JSON object is required."), { status: 400 });
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

  const reconstructedProgress = await reconstructRound(
    db,
    userId,
    progressResult.results?.[0],
    dateKey,
  );

  return {
    status: 200,
    body: {
      needsOnboarding: false,
      profile,
      progress: rowToProgress(reconstructedProgress),
      dailyState,
      verifiedResult: rowToResult(verifiedResult.results?.[0]),
    },
  };
}

export async function registerAccount(
  db,
  request,
  userId,
  { accountId = userId, identity = null } = {},
) {
  const body = await readJsonBody(request);
  const username = normalizeUsername(body.username);
  if (!username) {
    return {
      status: 400,
      body: { error: "Use 3–16 letters, numbers or underscores for your username." },
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
          user_id, account_id, username, leaderboard_visible, legacy_imported_at
        ) VALUES (?, ?, ?, 1, ?)`,
      )
      .bind(userId, accountId, username, importedAt),
    db
      .prepare(
        `INSERT INTO player_saves (
          user_id, current_round, best_round, points_balance, total_rounds,
          last_played_date, missed_day_json, score,
          score_migration_method, score_migrated_at, round_anchor_date,
          round_anchor_value
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        userId,
        body.importLocalProgress ? progress.currentRound : 1,
        body.importLocalProgress ? progress.bestRound : 1,
        body.importLocalProgress ? progress.score : 0,
        body.importLocalProgress ? progress.solves : 0,
        body.importLocalProgress ? progress.lastPlayedDate : null,
        body.importLocalProgress && progress.missedDayState
          ? JSON.stringify(progress.missedDayState)
          : null,
        body.importLocalProgress ? progress.score : 0,
        body.importLocalProgress ? "guest-local-import" : "new-account",
        new Date().toISOString(),
        body.importLocalProgress ? progress.lastPlayedDate : puzzleDate,
        body.importLocalProgress ? progress.currentRound : 1,
      ),
  ];

  if (identity) {
    statements.push(
      db.prepare(
        `INSERT INTO account_identities (provider, provider_subject, account_id)
        VALUES (?, ?, ?)`,
      ).bind(identity.provider, identity.subject, accountId),
    );
  }

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

  return { status: 201, body: { username, accountId } };
}

export async function updateAccountUsername(db, request, userId) {
  const body = await readJsonBody(request, 1_000);
  const username = normalizeUsername(body.username);
  if (!username) {
    return {
      status: 400,
      body: { error: "Use 3–16 letters, numbers or underscores for your username." },
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

export async function updateSocialProfile(db, request, userId) {
  const body = await readJsonBody(request, 4_000);
  const progress = await db.prepare(
    `SELECT profiles.avatar_id, saves.best_round, saves.total_rounds
    FROM player_profiles AS profiles
    LEFT JOIN player_saves AS saves ON saves.user_id = profiles.user_id
    WHERE profiles.user_id = ?`,
  )
    .bind(userId).first();
  if (!progress) {
    return { status: 404, body: { error: "Finish setting up your account first." } };
  }
  if (body.avatarId != null && (!avatarIds.has(body.avatarId) || body.avatarId === "unselected")) {
    return { status: 400, body: { error: "Choose one of the available character avatars." } };
  }
  const profile = sanitizeSocialProfile({
    ...body,
    avatarId: body.avatarId ?? normalizeAvatarId(progress.avatar_id),
  });
  const highestRound = Number(progress?.best_round || 0);
  const mapsSolved = Number(progress?.total_rounds || 0);
  const avatarUnlock = avatarUnlocks.get(profile.avatarId);
  const avatarLocked = avatarUnlock?.type === "round"
    ? highestRound < avatarUnlock.value
    : avatarUnlock?.type === "maps" && mapsSolved < avatarUnlock.value;
  if (avatarLocked) {
    const requirement = avatarUnlock.type === "round"
      ? `reach Round ${avatarUnlock.value}`
      : `solve ${avatarUnlock.value} maps`;
    return { status: 403, body: { error: `${profile.avatarId} unlocks when you ${requirement}.` } };
  }
  const requiredMaps = themeUnlocks.get(profile.themeId) || 0;
  if (mapsSolved < requiredMaps) {
    return {
      status: 403,
      body: { error: `${profile.themeId} unlocks at ${requiredMaps} solves.` },
    };
  }
  const result = await db.prepare(
    `UPDATE player_profiles SET
      avatar_id = ?, theme_id = ?, favourite_game = ?, favourite_map = ?, bio = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?`,
  ).bind(
    profile.avatarId,
    profile.themeId,
    profile.favouriteGame,
    profile.favouriteMap,
    profile.bio,
    userId,
  ).run();
  if (!Number(result.meta?.changes || 0)) {
    return { status: 404, body: { error: "Finish setting up your account first." } };
  }
  return { status: 200, body: { profile } };
}

export async function getPublicProfile(db, username) {
  const normalized = normalizeUsername(username);
  if (!normalized) return { status: 400, body: { error: "That player name is invalid." } };
  const row = await db.prepare(
    `SELECT
      profiles.*,
      COALESCE(saves.current_round, 0) AS current_round,
      COALESCE(saves.best_round, 0) AS best_round,
      COALESCE(saves.score, 0) AS score,
      COALESCE(saves.total_rounds, 0) AS total_rounds
    FROM player_profiles AS profiles
    LEFT JOIN player_saves AS saves ON saves.user_id = profiles.user_id
    WHERE profiles.username = ? COLLATE NOCASE
      AND profiles.leaderboard_visible = 1`,
  ).bind(normalized).first();
  if (!row) return { status: 404, body: { error: "Player not found." } };
  return {
    status: 200,
    body: {
      profile: rowToProfile(row),
      stats: {
        solves: Number(row.total_rounds || 0),
        bestRound: Number(row.best_round || 0),
        currentRound: Number(row.current_round || 0),
        score: Number(row.score || 0),
      },
    },
  };
}

export async function saveAccount(db, request, userId) {
  const body = await readJsonBody(request);
  const progress = sanitizeProgress(body.progress);
  const baseRevision = Number.isInteger(body.baseRevision) && body.baseRevision > 0
    ? body.baseRevision
    : null;
  const puzzleDate = isValidDateKey(body.puzzleDate) ? body.puzzleDate : null;
  const dailyState = puzzleDate ? sanitizeDailyState(body.dailyState, puzzleDate) : null;
  const profile = await db
    .prepare("SELECT user_id FROM player_profiles WHERE user_id = ?")
    .bind(userId)
    .first();
  if (!profile) return { status: 409, body: { error: "Finish setting up your account first." } };

  const updateSql = `UPDATE player_saves SET
          current_round = ?,
          best_round = MAX(best_round, ?),
          last_played_date = ?,
          missed_day_json = ?,
          revision = revision + 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?${baseRevision == null ? "" : " AND revision = ?"}`;
  const updateBindings = [
    progress.currentRound,
    progress.bestRound,
    progress.lastPlayedDate,
    progress.missedDayState ? JSON.stringify(progress.missedDayState) : null,
    userId,
  ];
  if (baseRevision != null) updateBindings.push(baseRevision);
  const statements = [db.prepare(updateSql).bind(...updateBindings)];

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

  const results = await db.batch(statements);
  if (baseRevision != null && Number(results?.[0]?.meta?.changes || 0) === 0) {
    const current = await db
      .prepare("SELECT * FROM player_saves WHERE user_id = ?")
      .bind(userId)
      .first();
    return {
      status: 409,
      body: {
        error: "This account changed on another device.",
        progress: rowToProgress(current),
      },
    };
  }
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

  await db.batch([
    db.prepare(
      `INSERT OR IGNORE INTO player_daily_results (
        user_id, puzzle_date, puzzle_id, selected_map_id, clues_used,
        map_correct, map_points, bonus_status, points_earned, completed_at,
        score_awarded, progression_applied
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
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
    ,
    db.prepare(
      `UPDATE player_saves SET
        score = score + COALESCE((
          SELECT points_earned - score_awarded
          FROM player_daily_results
          WHERE user_id = ? AND puzzle_date = ? AND progression_applied = 0
        ), 0),
        total_rounds = total_rounds + COALESCE((
          SELECT map_correct
          FROM player_daily_results
          WHERE user_id = ? AND puzzle_date = ? AND progression_applied = 0
        ), 0),
        current_round = CASE
          WHEN COALESCE((
            SELECT map_correct
            FROM player_daily_results
            WHERE user_id = ? AND puzzle_date = ? AND progression_applied = 0
          ), 1) = 1 THEN current_round
          ELSE 1
        END,
        revision = revision + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND EXISTS (
        SELECT 1 FROM player_daily_results
        WHERE user_id = ? AND puzzle_date = ? AND progression_applied = 0
      )`,
    ).bind(
      userId, body.puzzleDate,
      userId, body.puzzleDate,
      userId, body.puzzleDate,
      userId,
      userId, body.puzzleDate,
    ),
    db.prepare(
      `UPDATE player_daily_results SET
        score_awarded = points_earned,
        progression_applied = 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND puzzle_date = ? AND progression_applied = 0`,
    ).bind(userId, body.puzzleDate),
  ]);

  const result = await db
    .prepare("SELECT * FROM player_daily_results WHERE user_id = ? AND puzzle_date = ?")
    .bind(userId, body.puzzleDate)
    .first();
  const progress = await db.prepare("SELECT * FROM player_saves WHERE user_id = ?")
    .bind(userId).first();
  return { status: 200, body: { result: rowToResult(result), progress: rowToProgress(progress) } };
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

  await db.batch([
    db.prepare(
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
    ,
    db.prepare(
      `UPDATE player_saves SET
        score = score + COALESCE((
          SELECT points_earned - score_awarded
          FROM player_daily_results
          WHERE user_id = ? AND puzzle_date = ? AND points_earned > score_awarded
        ), 0),
        revision = revision + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND EXISTS (
        SELECT 1 FROM player_daily_results
        WHERE user_id = ? AND puzzle_date = ? AND points_earned > score_awarded
      )`,
    ).bind(userId, body.puzzleDate, userId, userId, body.puzzleDate),
    db.prepare(
      `UPDATE player_daily_results SET
        score_awarded = points_earned,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND puzzle_date = ? AND points_earned > score_awarded`,
    ).bind(userId, body.puzzleDate),
  ]);

  const savedResult = await db
    .prepare("SELECT * FROM player_daily_results WHERE user_id = ? AND puzzle_date = ?")
    .bind(userId, body.puzzleDate)
    .first();
  const progress = await db.prepare("SELECT * FROM player_saves WHERE user_id = ?")
    .bind(userId).first();
  return { status: 200, body: { result: rowToResult(savedResult), progress: rowToProgress(progress) } };
}
