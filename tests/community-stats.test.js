import test from "node:test";
import assert from "node:assert/strict";

import {
  formatCommunityCount,
  formatSolvePercentage,
  getCommunityStatsApiUrl,
  getOrCreateAnonymousPlayerId,
  resolveCommunityStatsApiUrl,
  submitCommunityAttempt,
} from "../js/community-stats.js";

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

test("the anonymous player id is stable in the same browser storage", () => {
  const storage = createStorage();
  const cryptoApi = { randomUUID: () => "07ce720f-48dd-470e-90d9-85650ff1edeb" };

  assert.equal(
    getOrCreateAnonymousPlayerId(storage, cryptoApi),
    "07ce720f-48dd-470e-90d9-85650ff1edeb",
  );
  assert.equal(
    getOrCreateAnonymousPlayerId(storage, { randomUUID: () => "different" }),
    "07ce720f-48dd-470e-90d9-85650ff1edeb",
  );
});

test("stats API configuration accepts HTTPS and local HTTP only", () => {
  const documentWith = (content) => ({
    querySelector: () => ({ content }),
  });

  assert.equal(getCommunityStatsApiUrl(documentWith("https://stats.example.com/")), "https://stats.example.com");
  assert.equal(getCommunityStatsApiUrl(documentWith("http://localhost:8787")), "http://localhost:8787");
  assert.equal(getCommunityStatsApiUrl(documentWith("http://stats.example.com")), null);
  assert.equal(getCommunityStatsApiUrl(documentWith("")), null);
});

test("local development uses local D1 instead of production statistics", () => {
  const productionDocument = {
    querySelector: () => ({ content: "https://api.thedailyundead.com" }),
  };

  assert.equal(
    resolveCommunityStatsApiUrl({
      isLocalDevelopment: true,
      documentObject: productionDocument,
    }),
    "http://localhost:8787",
  );
  assert.equal(
    resolveCommunityStatsApiUrl({
      isLocalDevelopment: false,
      documentObject: productionDocument,
    }),
    "https://api.thedailyundead.com",
  );
});

test("a successful attempt is sent once per browser and puzzle", async () => {
  const storage = createStorage();
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({ playersToday: 1, totalGames: 1, yesterday: {} }),
    };
  };
  const attempt = {
    apiUrl: "https://stats.example.com",
    puzzleDate: "2026-08-12",
    puzzleId: "2026-08-12:map:steps",
    mapId: "map",
    mapName: "Example Map",
    isCorrect: true,
    storage,
    cryptoApi: { randomUUID: () => "07ce720f-48dd-470e-90d9-85650ff1edeb" },
    fetchImpl,
  };

  await submitCommunityAttempt(attempt);
  await submitCommunityAttempt(attempt);

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://stats.example.com/api/attempts");
  assert.equal(requests[0].body.isCorrect, true);
});

test("community values use subtle placeholders for unavailable data", () => {
  assert.equal(formatCommunityCount(12527), new Intl.NumberFormat().format(12527));
  assert.equal(formatCommunityCount(null), "—");
  assert.equal(formatSolvePercentage(63), "63%");
  assert.equal(formatSolvePercentage(null), "—");
});
