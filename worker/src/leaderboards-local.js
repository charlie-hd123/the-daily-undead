import { readLeaderboards } from "./leaderboards.js";

function isAllowedLocalOrigin(origin) {
  try {
    const url = new URL(origin);
    return (
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

function responseHeaders(origin) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...(isAllowedLocalOrigin(origin)
      ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" }
      : {}),
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(origin),
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (origin && !isAllowedLocalOrigin(origin)) {
      return json({ error: "Origin is not allowed." }, 403, origin);
    }

    const url = new URL(request.url);
    if (request.method !== "GET" || url.pathname !== "/api/leaderboards") {
      return json({ error: "This local preview is read-only." }, 405, origin);
    }

    const dateKey = url.searchParams.get("date");
    try {
      return json(await readLeaderboards(env.DB, dateKey), 200, origin);
    } catch (error) {
      const invalidDate = error.message === "A valid date is required.";
      return json(
        { error: invalidDate ? error.message : "Leaderboards are temporarily unavailable." },
        invalidDate ? 400 : 503,
        origin,
      );
    }
  },
};
