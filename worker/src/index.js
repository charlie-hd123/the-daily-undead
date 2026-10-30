import { verifyAccountRequest } from "./auth.js";
import { deleteAccount, isAccountRevoked, retryAuthDeletions } from "./account-deletion.js";
import { retryAuthProfileSync, syncAuthProfile } from "./auth-profile-sync.js";
import { ensureStagingFixtures, fixturesEnabled } from "./staging-fixtures.js";
import { puzzleOptions } from './puzzle-environment.js';
import { buildDailyBloodTiesPuzzle, replayBloodTiesAttempts } from '../../js/blood-ties-core.js';
import {
  getAccount,
  getPublicProfile,
  recordVerifiedBonusResult,
  recordVerifiedMapResult,
  recordVerifiedWordResult,
  recordVerifiedBloodResult,
  registerAccount,
  saveAccount,
  updateSocialProfile,
  updateAccountUsername,
} from "./accounts.js";
import { readLeaderboards } from "./leaderboards.js";
import {
  createAccountId,
  resolveAccountIdentity,
} from "./identities.js";

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function getPreviousDateKey(dateKey) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function getAllowedOrigins(env) {
  return new Set(
    String(env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

export function isAllowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  return !origin || getAllowedOrigins(env).has(origin);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin || !getAllowedOrigins(env).has(origin)) return {};

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonResponse(request, env, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...jsonHeaders, ...corsHeaders(request, env) },
  });
}

function errorResponse(request, env, message, status) {
  return jsonResponse(request, env, { error: message }, status);
}

function textIsValid(value, maximumLength) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximumLength;
}

export function validateAttempt(payload, todayDateKey) {
  if (!payload || typeof payload !== "object") return "A JSON request body is required.";
  if (!textIsValid(payload.playerId, 128)) return "playerId is invalid.";
  if (payload.puzzleType != null && !["easter", "word", "blood"].includes(payload.puzzleType)) {
    return "puzzleType is invalid.";
  }
  if (!isValidDateKey(payload.puzzleDate)) return "puzzleDate is invalid.";
  if (payload.puzzleDate !== todayDateKey) return "Only today’s live puzzle can be submitted.";
  if (!textIsValid(payload.puzzleId, 1024) || !payload.puzzleId.startsWith(`${payload.puzzleDate}:`)) {
    return "puzzleId is invalid.";
  }
  if (!textIsValid(payload.mapId, 100)) return "mapId is invalid.";
  if (!textIsValid(payload.mapName, 160)) return "mapName is invalid.";
  if (typeof payload.isCorrect !== "boolean") return "isCorrect must be true or false.";
  return null;
}

async function hashPlayerId(playerId) {
  const bytes = new TextEncoder().encode(playerId);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function readStats(db, dateKey) {
  const yesterdayDateKey = getPreviousDateKey(dateKey);
  const [todayResult, totalResult, yesterdayResult] = await db.batch([
    db.prepare("SELECT COUNT(DISTINCT player_hash) AS players FROM puzzle_attempts WHERE puzzle_date = ?").bind(dateKey),
    db.prepare("SELECT total_games FROM community_totals WHERE id = 1"),
    db
      .prepare(
        `SELECT
          puzzle_type,
          attempts,
          correct,
          answer_name
        FROM puzzle_daily_stats
        WHERE puzzle_date = ?`,
      )
      .bind(yesterdayDateKey),
  ]);

  const playersToday = Number(todayResult.results?.[0]?.players || 0);
  const totalPuzzles = Number(totalResult.results?.[0]?.total_games || 0);
  const rows = new Map((yesterdayResult.results || []).map((row) => [row.puzzle_type, row]));
  const puzzleStat = (type) => {
    const row = rows.get(type);
    const attempts = Number(row?.attempts || 0);
    const correct = Number(row?.correct || 0);
    return {
      attempts,
      correct,
      solvePercentage: attempts > 0 ? Math.round((correct / attempts) * 100) : null,
      answerName: row?.answer_name || null,
    };
  };
  const easter = puzzleStat("easter");

  return {
    date: dateKey,
    playersToday,
    totalPuzzles,
    totalGames: totalPuzzles,
    yesterday: {
      date: yesterdayDateKey,
      word: puzzleStat("word"),
      blood: puzzleStat('blood'),
      easter,
      attempts: easter.attempts,
      correct: easter.correct,
      solvePercentage: easter.solvePercentage,
      mapName: easter.answerName,
    },
  };
}

async function handleStats(request, env, url) {
  const dateKey = url.searchParams.get("date");
  if (!isValidDateKey(dateKey)) {
    return errorResponse(request, env, "A valid date query parameter is required.", 400);
  }

  const todayDateKey = new Date().toISOString().slice(0, 10);
  if (dateKey > todayDateKey) {
    return errorResponse(request, env, "Future statistics are not available.", 400);
  }

  return jsonResponse(request, env, await readStats(env.DB, dateKey));
}

async function handleLeaderboards(request, env, url) {
  const dateKey = url.searchParams.get("date");
  if (!isValidDateKey(dateKey)) {
    return errorResponse(request, env, "A valid date query parameter is required.", 400);
  }

  const todayDateKey = new Date().toISOString().slice(0, 10);
  if (dateKey > todayDateKey) {
    return errorResponse(request, env, "Future leaderboards are not available.", 400);
  }

  return jsonResponse(request, env, await readLeaderboards(env.DB, dateKey));
}

async function handleGameDates(request, env, url) {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!isValidDateKey(from) || !isValidDateKey(to) || from > to) {
    return errorResponse(request, env, "Valid from and to game dates are required.", 400);
  }
  const rangeDays = Math.floor(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000,
  );
  if (rangeDays > 3660) {
    return errorResponse(request, env, "The requested game-date range is too large.", 400);
  }
  const result = await env.DB.prepare(
    `SELECT game_date, protection_reason
    FROM game_dates
    WHERE game_date BETWEEN ? AND ? AND counts_for_round = 0
    ORDER BY game_date`,
  ).bind(from, to).all();
  return jsonResponse(request, env, {
    from,
    to,
    protectedDates: (result.results || []).map((row) => ({
      date: row.game_date,
      reason: row.protection_reason || null,
    })),
  });
}

async function handleAttempt(request, env) {
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > 4096) {
    return errorResponse(request, env, "Request body is too large.", 413);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return errorResponse(request, env, "The request body must be valid JSON.", 400);
  }

  const todayDateKey = new Date().toISOString().slice(0, 10);
  const validationError = validateAttempt(payload, todayDateKey);
  if (validationError) return errorResponse(request, env, validationError, 400);

  const playerHash = await hashPlayerId(payload.playerId);
  const puzzleType = payload.puzzleType || 'easter';
  if (puzzleType === 'blood') {
    if (!puzzleOptions(env).bloodTies) return errorResponse(request, env, 'Blood Ties is unavailable in this environment.', 400);
    const puzzle = buildDailyBloodTiesPuzzle(todayDateKey, puzzleOptions(env));
    let result;
    try { result = replayBloodTiesAttempts(puzzle, payload.attempts, payload.rulesVersion ?? 1); }
    catch { return errorResponse(request, env, 'Invalid Blood Ties attempts.', 400); }
    if (payload.puzzleId !== puzzle.key || !Array.isArray(payload.attempts) || !result.complete || result.success !== payload.isCorrect) return errorResponse(request, env, 'Invalid Blood Ties result.', 400);
    payload.mapId = 'blood-ties'; payload.mapName = 'Four hidden connections';
  }
  const insertResult = await env.DB
    .prepare(
      `INSERT OR IGNORE INTO puzzle_attempts (
        puzzle_date,
        puzzle_type,
        puzzle_id,
        player_hash,
        answer_id,
        answer_name,
        is_correct
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      payload.puzzleDate,
      puzzleType,
      payload.puzzleId,
      playerHash,
      payload.mapId.trim(),
      payload.mapName.trim(),
      payload.isCorrect ? 1 : 0,
    )
    .run();

  const stats = await readStats(env.DB, payload.puzzleDate);
  return jsonResponse(request, env, {
    ...stats,
    recorded: Number(insertResult.meta?.changes || 0) > 0,
  });
}

async function handleAccountRequest(request, env, url, context) {
  let verifiedIdentity;
  try {
    verifiedIdentity = await verifyAccountRequest(request, env);
  } catch (error) {
    return errorResponse(request, env, error.message || "The account session is invalid.", 401);
  }

  const deleting = url.pathname === "/api/account" && request.method === "DELETE";
  const revoked = await isAccountRevoked(env.DB, verifiedIdentity);
  if (revoked && !deleting) {
    return errorResponse(request, env, "This account has been deleted. Please sign out.", 401);
  }
  const identity = revoked
    ? { ...verifiedIdentity, userId: null, accountId: null }
    : await resolveAccountIdentity(env.DB, verifiedIdentity);
  if (!identity) {
    return errorResponse(request, env, "The account identity is invalid.", 401);
  }

  let result;
  if (deleting) {
    result = await deleteAccount(request, env, identity);
  } else if (url.pathname === "/api/account" && request.method === "GET") {
    result = identity.userId
      ? await getAccount(env.DB, identity.userId, url.searchParams.get("date"))
      : { status: 200, body: { needsOnboarding: true, accountId: null } };
    if (identity.accountId) {
      result.body.accountId = identity.accountId;
      result.body.legacyUserId = identity.userId;
    }
  } else if (url.pathname === "/api/account/register" && request.method === "POST") {
    if (identity.userId) {
      result = { status: 409, body: { error: "This account is already set up." } };
    } else {
      const accountId = createAccountId();
      result = await registerAccount(env.DB, request, accountId, {
        ...puzzleOptions(env),
        accountId,
        identity: verifiedIdentity,
      });
    }
  } else if (!identity.userId) {
    result = { status: 409, body: { error: "Finish setting up your account first." } };
  } else if (url.pathname === "/api/account/username" && request.method === "PUT") {
    result = await updateAccountUsername(env.DB, request, identity.userId);
  } else if (url.pathname === "/api/account/profile" && request.method === "PUT") {
    result = await updateSocialProfile(env.DB, request, identity.userId);
  } else if (url.pathname === "/api/account/save" && request.method === "PUT") {
    result = await saveAccount(env.DB, request, identity.userId, puzzleOptions(env));
  } else if (url.pathname === "/api/account/results/map" && request.method === "POST") {
    result = await recordVerifiedMapResult(env.DB, request, identity.userId, puzzleOptions(env));
  } else if (url.pathname === "/api/account/results/bonus" && request.method === "POST") {
    result = await recordVerifiedBonusResult(env.DB, request, identity.userId);
  } else if (url.pathname === "/api/account/results/word" && request.method === "POST") {
    result = await recordVerifiedWordResult(env.DB, request, identity.userId, puzzleOptions(env));
  } else if (url.pathname === '/api/account/results/blood' && request.method === 'POST') {
    result = await recordVerifiedBloodResult(env.DB, request, identity.userId, puzzleOptions(env));
  } else {
    return errorResponse(request, env, "Not found.", 404);
  }

  if (!deleting && verifiedIdentity.provider === "supabase" && result.status < 300
    && (url.pathname === "/api/account" || url.pathname === "/api/account/register" || url.pathname === "/api/account/username")) {
    const sync = syncAuthProfile(env, verifiedIdentity.subject);
    if (context?.waitUntil) context.waitUntil(sync);
    else await sync;
  }
  return jsonResponse(request, env, result.body, result.status);
}

export default {
  async fetch(request, env, context) {
    if (!isAllowedOrigin(request, env)) {
      return errorResponse(request, env, "Origin is not allowed.", 403);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    const url = new URL(request.url);

    try {
      await ensureStagingFixtures(env);
      if (url.pathname.startsWith("/api/profiles/") && request.method === "GET") {
        const username = decodeURIComponent(url.pathname.slice("/api/profiles/".length));
        const result = await getPublicProfile(env.DB, username);
        return jsonResponse(request, env, result.body, result.status);
      }
      if (url.pathname.startsWith("/api/account")) {
        return await handleAccountRequest(request, env, url, context);
      }
      if (url.pathname === "/api/stats" && request.method === "GET") {
        return await handleStats(request, env, url);
      }
      if (url.pathname === "/api/leaderboards" && request.method === "GET") {
        return await handleLeaderboards(request, env, url);
      }
      if (url.pathname === "/api/game-dates" && request.method === "GET") {
        return await handleGameDates(request, env, url);
      }
      if (url.pathname === "/api/attempts" && request.method === "POST") {
        return await handleAttempt(request, env);
      }
      if (url.pathname === "/health" && request.method === "GET") {
        return jsonResponse(request, env, {
          ok: true,
          environment: env.DEPLOYMENT_ENVIRONMENT || "production",
          commit: env.RELEASE_COMMIT || null,
          apiDigest: env.RELEASE_API_DIGEST || null,
          configurationDigest: env.RELEASE_CONFIG_DIGEST || null,
          fixturesEnabled: fixturesEnabled(env),
          bloodTiesDemo: puzzleOptions(env).bloodTies && env.DEPLOYMENT_ENVIRONMENT !== 'production',
          bloodTiesEnabled: puzzleOptions(env).bloodTies,
          puzzleSchedule: puzzleOptions(env).production ? 'production-v1' : 'v1',
          accountsConfigured: Boolean(env.CLERK_ISSUER || env.SUPABASE_ISSUER),
          accountProviders: {
            clerk: Boolean(env.CLERK_ISSUER),
            supabase: Boolean(env.SUPABASE_ISSUER),
          },
        });
      }
      return errorResponse(request, env, "Not found.", 404);
    } catch (error) {
      if (error?.status === 400 || error?.status === 413) {
        return errorResponse(request, env, error.message, error.status);
      }
      console.error("Community statistics request failed", error);
      return errorResponse(request, env, "Statistics are temporarily unavailable.", 503);
    }
  },
  async scheduled(_controller, env, context) {
    if (env.DB && env.DEPLOYMENT_ENVIRONMENT !== "local") context.waitUntil(retryAuthDeletions(env));
    if (env.DB) context.waitUntil(retryAuthProfileSync(env));
    if (fixturesEnabled(env)) context.waitUntil(ensureStagingFixtures(env));
    if (!env.SUPABASE_HEARTBEAT_URL || !env.SUPABASE_HEARTBEAT_SECRET_KEY) return;
    context.waitUntil((async () => {
      const response = await fetch(env.SUPABASE_HEARTBEAT_URL, {
        method: "POST",
        headers: { apikey: env.SUPABASE_HEARTBEAT_SECRET_KEY },
      });
      if (!response.ok) throw new Error(`Supabase heartbeat failed with HTTP ${response.status}.`);
    })());
  },
};
