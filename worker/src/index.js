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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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
    db.prepare("SELECT attempts FROM daily_stats WHERE puzzle_date = ?").bind(dateKey),
    db.prepare("SELECT total_games FROM community_totals WHERE id = 1"),
    db
      .prepare(
        `SELECT
          attempts,
          correct,
          answer_map_name AS map_name
        FROM daily_stats
        WHERE puzzle_date = ?`,
      )
      .bind(yesterdayDateKey),
  ]);

  const playersToday = Number(todayResult.results?.[0]?.attempts || 0);
  const totalGames = Number(totalResult.results?.[0]?.total_games || 0);
  const yesterdayAttempts = Number(yesterdayResult.results?.[0]?.attempts || 0);
  const yesterdayCorrect = Number(yesterdayResult.results?.[0]?.correct || 0);

  return {
    date: dateKey,
    playersToday,
    totalGames,
    yesterday: {
      date: yesterdayDateKey,
      attempts: yesterdayAttempts,
      correct: yesterdayCorrect,
      solvePercentage:
        yesterdayAttempts > 0
          ? Math.round((yesterdayCorrect / yesterdayAttempts) * 100)
          : null,
      mapName: yesterdayResult.results?.[0]?.map_name || null,
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
  const insertResult = await env.DB
    .prepare(
      `INSERT OR IGNORE INTO attempts (
        puzzle_date,
        puzzle_id,
        player_hash,
        answer_map_id,
        answer_map_name,
        is_correct
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      payload.puzzleDate,
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

export default {
  async fetch(request, env) {
    if (!isAllowedOrigin(request, env)) {
      return errorResponse(request, env, "Origin is not allowed.", 403);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/stats" && request.method === "GET") {
        return await handleStats(request, env, url);
      }
      if (url.pathname === "/api/attempts" && request.method === "POST") {
        return await handleAttempt(request, env);
      }
      if (url.pathname === "/health" && request.method === "GET") {
        return jsonResponse(request, env, { ok: true });
      }
      return errorResponse(request, env, "Not found.", 404);
    } catch (error) {
      console.error("Community statistics request failed", error);
      return errorResponse(request, env, "Statistics are temporarily unavailable.", 503);
    }
  },
};
