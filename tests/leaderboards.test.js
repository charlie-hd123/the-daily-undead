import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import {
  fetchLeaderboards,
  resolveLeaderboardsApiUrl,
  sortAllTimeEntries,
} from "../js/leaderboards.js";
import localWorker from "../worker/src/leaderboards-local.js";
import { readLeaderboards } from "../worker/src/leaderboards.js";

const projectRoot = new URL("../", import.meta.url);

function createLeaderboardDb(dailyRows, todayStatsRows, allTimeRows) {
  const statements = [];
  return {
    statements,
    prepare(sql) {
      const statement = { sql, bindings: [] };
      statements.push(statement);
      return {
        bind(...bindings) {
          statement.bindings = bindings;
          return { sql };
        },
      };
    },
    async batch() {
      return [
        { results: dailyRows },
        { results: todayStatsRows },
        { results: allTimeRows },
      ];
    },
  };
}

test("today lists only verified map and bonus completions with the community play count", async () => {
  const db = createLeaderboardDb(
    [
      {
        username: "Dempsey",
        points: 100,
      },
    ],
    [{ attempts: 42 }],
    [
      {
        username: "Richtofen",
        current_round: 7,
        points_balance: 540,
        best_round: 12,
        total_rounds: 40,
      },
    ],
  );

  const result = await readLeaderboards(db, "2026-09-20");

  assert.deepEqual(result.today, {
    playersToday: 42,
    elite: [{ rank: 1, username: "Dempsey", points: 100 }],
  });
  assert.deepEqual(result.allTime, [
    {
      username: "Richtofen",
      currentRound: 7,
      points: 540,
      highestRound: 12,
      totalRounds: 40,
    },
  ]);
  assert.equal(db.statements.length, 3);
  assert.match(db.statements[0].sql, /player_daily_results/);
  assert.match(db.statements[0].sql, /leaderboard_visible = 1/);
  assert.match(db.statements[0].sql, /map_correct = 1/);
  assert.match(db.statements[0].sql, /bonus_status = 'correct'/);
  assert.doesNotMatch(db.statements[0].sql, /player_saves/);
  assert.deepEqual(db.statements[0].bindings, ["2026-09-20"]);
  assert.match(db.statements[1].sql, /SELECT attempts FROM daily_stats/);
  assert.deepEqual(db.statements[1].bindings, ["2026-09-20"]);
  assert.match(db.statements[2].sql, /LEFT JOIN player_saves/);
  assert.match(db.statements[2].sql, /best_round DESC/);
  assert.doesNotMatch(db.statements[2].sql, /LIMIT/);
  assert.deepEqual(db.statements[2].bindings, []);
});

test("all-time ranking toggles between highest round and total rounds", () => {
  const entries = [
    { username: "Alpha", currentRound: 5, points: 80, highestRound: 12, totalRounds: 30 },
    { username: "Bravo", currentRound: 4, points: 60, highestRound: 10, totalRounds: 42 },
  ];

  assert.deepEqual(
    sortAllTimeEntries(entries, "highestRound").map(({ username }) => username),
    ["Alpha", "Bravo"],
  );
  assert.deepEqual(
    sortAllTimeEntries(entries, "totalRounds").map(({ username }) => username),
    ["Bravo", "Alpha"],
  );
});

test("username tie-breaking preserves case-sensitive display and ordering", () => {
  const tiedEntries = [
    { username: "alpha", currentRound: 1, points: 10, highestRound: 2, totalRounds: 3 },
    { username: "Alpha", currentRound: 1, points: 10, highestRound: 2, totalRounds: 3 },
  ];

  assert.deepEqual(
    sortAllTimeEntries(tiedEntries).map(({ username }) => username),
    ["Alpha", "alpha"],
  );
});

test("the browser uses a separate local leaderboard service", () => {
  assert.equal(resolveLeaderboardsApiUrl({ isLocalDevelopment: true }), "http://localhost:8788");
  assert.equal(
    resolveLeaderboardsApiUrl({
      isLocalDevelopment: false,
      documentObject: {
        querySelector: () => ({ content: "https://api.example.test/" }),
      },
    }),
    "https://api.example.test",
  );
});

test("the leaderboard browser request passes the selected puzzle date", async () => {
  let requestedUrl;
  const result = await fetchLeaderboards({
    apiUrl: "https://api.example.test",
    puzzleDate: "2026-09-20",
    fetchImpl: async (url) => {
      requestedUrl = String(url);
      return new Response(JSON.stringify({ today: { playersToday: 0, elite: [] }, allTime: [] }), {
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  assert.equal(requestedUrl, "https://api.example.test/api/leaderboards?date=2026-09-20");
  assert.deepEqual(result, { today: { playersToday: 0, elite: [] }, allTime: [] });
});

test("the production-data preview has no write routes", async () => {
  const response = await localWorker.fetch(
    new Request("http://localhost:8788/api/leaderboards", {
      method: "POST",
      headers: { Origin: "http://localhost:8080" },
    }),
    {},
  );

  assert.equal(response.status, 405);
  assert.deepEqual(await response.json(), { error: "This local preview is read-only." });
});

test("the local Wrangler config opts only its D1 binding into remote data", async () => {
  const config = await fs.readFile(
    new URL("../worker/wrangler.leaderboards-local.jsonc", import.meta.url),
    "utf8",
  );

  assert.match(config, /"main": "src\/leaderboards-local\.js"/);
  assert.match(config, /"remote": true/);
  assert.doesNotMatch(config, /src\/index\.js/);
});

test("the leaderboard uses player-facing introductory copy", async () => {
  const browserScript = await fs.readFile(new URL("js/leaderboards.js", projectRoot), "utf8");

  assert.match(browserScript, /See where you rank today and among the all-time leaders\./);
  assert.doesNotMatch(browserScript, /verified results|imported and synced progress/i);
});
