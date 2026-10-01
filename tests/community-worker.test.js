import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import {
  getPreviousDateKey,
  isAllowedOrigin,
  isValidDateKey,
  validateAttempt,
} from "../worker/src/index.js";
import {
  normalizeUsername,
  reconstructRound,
  getPublicProfile,
  readJsonBody,
  registerAccount,
  saveAccount,
  sanitizeDailyState,
  sanitizeProgress,
  sanitizeSocialProfile,
  updateAccountUsername,
  updateSocialProfile,
} from "../worker/src/accounts.js";
import { verifyClerkRequest } from "../worker/src/auth.js";
import {
  answerEquivalents as workerAnswerEquivalents,
  profileGames,
  profileMaps,
  workerMaps,
} from "../worker/src/generated-map-catalog.js";

const today = "2026-08-12";
const projectRoot = new URL("../", import.meta.url);

async function readProjectFile(path) {
  return fs.readFile(new URL(path, projectRoot), "utf8");
}

const validAttempt = {
  playerId: "07ce720f-48dd-470e-90d9-85650ff1edeb",
  puzzleDate: today,
  puzzleId: `${today}:bo7-ashes-of-the-damned:step-a,step-b,step-c`,
  mapId: "bo7-ashes-of-the-damned",
  mapName: "Ashes of the Damned",
  isCorrect: true,
};

test("Worker date utilities use UTC calendar dates", () => {
  assert.equal(isValidDateKey("2024-02-29"), true);
  assert.equal(isValidDateKey("2023-02-29"), false);
  assert.equal(getPreviousDateKey("2026-01-01"), "2025-12-31");
});

test("Worker accepts a complete live attempt and rejects historical writes", () => {
  assert.equal(validateAttempt(validAttempt, today), null);
  assert.match(
    validateAttempt({ ...validAttempt, puzzleDate: "2026-08-11" }, today),
    /today’s live puzzle/,
  );
  assert.match(validateAttempt({ ...validAttempt, isCorrect: "yes" }, today), /true or false/);
});

test("Worker accepts long puzzle identifiers generated from descriptive step ids", () => {
  const longPuzzleId = `${today}:cold-war-mauer-der-toten:${"step-".repeat(50)}`;

  assert.ok(longPuzzleId.length > 256);
  assert.equal(validateAttempt({ ...validAttempt, puzzleId: longPuzzleId }, today), null);
});

test("Worker CORS only allows configured browser origins", () => {
  const env = { ALLOWED_ORIGINS: "https://thedailyundead.com,http://localhost:8080" };
  const request = (origin) => new Request("https://worker.example/api/stats", {
    headers: origin ? { Origin: origin } : {},
  });

  assert.equal(isAllowedOrigin(request("https://thedailyundead.com"), env), true);
  assert.equal(isAllowedOrigin(request("https://attacker.example"), env), false);
  assert.equal(isAllowedOrigin(request(null), env), true);
});

test("production Worker origins stay isolated from localhost preview origins", async () => {
  const productionConfig = JSON.parse(await readProjectFile("worker/wrangler.jsonc"));
  assert.match(productionConfig.vars.ALLOWED_ORIGINS, /https:\/\/thedailyundead\.com/);
  assert.doesNotMatch(productionConfig.vars.ALLOWED_ORIGINS, /localhost|127\.0\.0\.1/);
  assert.doesNotMatch(productionConfig.vars.CLERK_AUTHORIZED_PARTIES, /localhost|127\.0\.0\.1/);
});

test("account usernames and uploaded local saves are tightly validated", () => {
  assert.equal(normalizeUsername(" Richtofen_93 "), "Richtofen_93");
  assert.equal(normalizeUsername("no spaces allowed"), null);
  assert.equal(normalizeUsername("ab"), null);
  assert.equal(normalizeUsername("1234567890abcdef"), "1234567890abcdef");
  assert.equal(normalizeUsername("1234567890abcdefg"), null);

  assert.deepEqual(
    sanitizeProgress({
      currentRound: 12,
      bestRound: 8,
      pointsBalance: 250,
      totalRounds: 40,
      reviveCount: 2,
      lastPlayedDate: "2026-08-12",
    }),
    {
      currentRound: 12,
      bestRound: 12,
      score: 250,
      solves: 40,
      lastPlayedDate: "2026-08-12",
      missedDayState: null,
    },
  );

  assert.equal(
    sanitizeDailyState(
      { stateVersion: 10, puzzleKey: `${today}:map:steps`, phase: "clues", cluesRevealed: 1 },
      today,
    ).phase,
    "clues",
  );
  assert.equal(sanitizeDailyState({ phase: "cheat", puzzleKey: `${today}:x` }, today), null);
});

test("account request bodies report malformed and oversized JSON as client errors", async () => {
  await assert.rejects(
    readJsonBody(new Request("https://api.example.test", { method: "POST", body: "{" })),
    (error) => error.status === 400 && /valid JSON/.test(error.message),
  );
  await assert.rejects(
    readJsonBody(new Request("https://api.example.test", {
      method: "POST",
      headers: { "Content-Length": "5000" },
      body: "{}",
    }), 100),
    (error) => error.status === 413,
  );
});

test("public profile fields are restricted to approved cosmetics and safe lengths", () => {
  assert.deepEqual(
    sanitizeSocialProfile({
      avatarId: "carver",
      themeId: "void",
      favouriteGame: "  Black   Ops 2  ",
      favouriteMap: "  Mob   of the Dead  ",
      bio: "  No one   survives alone.  ",
    }),
    {
      avatarId: "carver",
      themeId: "default",
      favouriteGame: "Black Ops 2",
      favouriteMap: "Mob of the Dead",
      bio: "No one survives alone.",
    },
  );
  assert.equal(sanitizeSocialProfile({ avatarId: "../../evil" }).avatarId, "unselected");
  assert.equal(sanitizeSocialProfile({ themeId: "outbreak" }).themeId, "outbreak");
  assert.equal(sanitizeSocialProfile({ themeId: "hellfire" }).themeId, "hellfire");
  assert.equal(sanitizeSocialProfile({ themeId: "blood-moon" }).themeId, "blood-moon");
  assert.equal(sanitizeSocialProfile({ themeId: "dark-aether" }).themeId, "dark-aether");
  assert.equal(sanitizeSocialProfile({ favouriteGame: "Not a real game" }).favouriteGame, "");
  assert.equal(sanitizeSocialProfile({ favouriteMap: "Not a real map" }).favouriteMap, "");
});

test("public profile lookups exclude profiles hidden from leaderboards", async () => {
  let query = "";
  const db = {
    prepare(sql) {
      query = sql;
      return { bind: () => ({ first: async () => null }) };
    },
  };

  const response = await getPublicProfile(db, "Takeo");
  assert.equal(response.status, 404);
  assert.match(query, /leaderboard_visible = 1/);
});

test("ordinary account saves cannot overwrite server-owned Score or Solves", async () => {
  const statements = [];
  const db = {
    prepare(sql) {
      return {
        bind(...bindings) {
          if (sql.startsWith("SELECT user_id")) {
            return { first: async () => ({ user_id: "user_1" }) };
          }
          if (sql.startsWith("SELECT * FROM player_saves")) {
            return { first: async () => ({ score: 5000, total_rounds: 42 }) };
          }
          const statement = { sql, bindings };
          statements.push(statement);
          return statement;
        },
      };
    },
    async batch() {},
  };

  const response = await saveAccount(
    db,
    new Request("https://api.example.test/api/account/save", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ progress: { score: 999999, solves: 10 } }),
    }),
    "user_1",
  );

  assert.equal(response.status, 200);
  assert.doesNotMatch(statements[0].sql, /score\s*=/);
  assert.doesNotMatch(statements[0].sql, /total_rounds\s*=/);
});

test("signed-in Round reconstruction repairs a retrospectively protected date", async () => {
  let updated = null;
  const db = {
    prepare(sql) {
      return {
        bind(...bindings) {
          if (sql.startsWith("UPDATE player_saves")) {
            return { run: async () => { updated = bindings; } };
          }
          if (sql.startsWith("SELECT * FROM player_saves")) {
            return { first: async () => ({
              current_round: updated[0],
              best_round: updated[1],
              round_anchor_date: "2026-09-27",
              round_anchor_value: 38,
            }) };
          }
          return { sql, bindings };
        },
      };
    },
    async batch(statements) {
      assert.match(statements[0].sql, /player_daily_results/);
      assert.match(statements[1].sql, /counts_for_round = 0/);
      return [
        { results: [{ puzzle_date: "2026-09-29", map_correct: 1 }] },
        { results: [{ game_date: "2026-09-28" }] },
      ];
    },
  };

  const result = await reconstructRound(db, "user_1", {
    current_round: 0,
    best_round: 40,
    round_anchor_date: "2026-09-27",
    round_anchor_value: 38,
  }, "2026-09-30");

  assert.deepEqual(updated, [39, 40, "user_1"]);
  assert.equal(result.current_round, 39);
  assert.equal(result.best_round, 40);
});

test("account saves reject a stale browser revision before replacing cloud progress", async () => {
  const db = {
    prepare(sql) {
      return {
        bind(...bindings) {
          if (sql.startsWith("SELECT user_id")) {
            return { first: async () => ({ user_id: "user_1" }) };
          }
          if (sql.startsWith("SELECT * FROM player_saves")) {
            return {
              first: async () => ({
                current_round: 20,
                best_round: 20,
                score: 900,
                total_rounds: 40,
                revision: 9,
              }),
            };
          }
          return { sql, bindings };
        },
      };
    },
    async batch(statements) {
      assert.match(statements[0].sql, /AND revision = \?/);
      assert.equal(statements[0].bindings.at(-1), 8);
      return [{ meta: { changes: 0 } }];
    },
  };

  const response = await saveAccount(
    db,
    new Request("https://api.example.test/api/account/save", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseRevision: 8,
        progress: { currentRound: 21, score: 950, solves: 41 },
      }),
    }),
    "user_1",
  );

  assert.equal(response.status, 409);
  assert.equal(response.body.progress.revision, 9);
  assert.match(response.body.error, /another device/);
});

test("avatar unlocks use imported highest-round and maps-solved progress", async () => {
  const request = (avatarId) => new Request("https://worker.example/api/account/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ avatarId, themeId: "default" }),
  });
  const progressOnlyDb = (progress) => ({
    prepare(sql) {
      assert.match(sql, /best_round, saves\.total_rounds/);
      return { bind: () => ({ first: async () => progress }) };
    },
  });

  const roundLocked = await updateSocialProfile(
    progressOnlyDb({ best_round: 49, total_rounds: 500 }),
    request("shadowman"),
    "user_1",
  );
  assert.equal(roundLocked.status, 403);
  assert.match(roundLocked.body.error, /Round 50/);

  const mapsLocked = await updateSocialProfile(
    progressOnlyDb({ best_round: 100, total_rounds: 19 }),
    request("tedd"),
    "user_1",
  );
  assert.equal(mapsLocked.status, 403);
  assert.match(mapsLocked.body.error, /20 maps/);
});

test("the placeholder avatar cannot be selected again after choosing a character", async () => {
  const db = {
    prepare() {
      return {
        bind: () => ({ first: async () => ({ avatar_id: "richtofen", best_round: 100, total_rounds: 1000 }) }),
      };
    },
  };
  const response = await updateSocialProfile(
    db,
    new Request("https://worker.example/api/account/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatarId: "unselected", themeId: "default" }),
    }),
    "user_1",
  );
  assert.equal(response.status, 400);
  assert.match(response.body.error, /character avatars/);
});

test("account registration imports the browser's highest round into D1", async () => {
  const statements = [];
  const db = {
    prepare(sql) {
      if (sql.startsWith("SELECT username")) {
        return { bind: () => ({ first: async () => null }) };
      }

      return {
        bind(...bindings) {
          const statement = { sql, bindings };
          statements.push(statement);
          return statement;
        },
      };
    },
    async batch() {},
  };
  const response = await registerAccount(
    db,
    new Request("https://api.example.test/api/account/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Takeo",
        importLocalProgress: true,
        puzzleDate: today,
        progress: {
          currentRound: 3,
          bestRound: 17,
          score: 250,
          solves: 41,
          lastPlayedDate: today,
        },
      }),
    }),
    "user_import_test",
  );

  const progressInsert = statements.find(({ sql }) => /INSERT INTO player_saves/.test(sql));
  assert.equal(response.status, 201);
  assert.ok(progressInsert);
  assert.equal(progressInsert.bindings[1], 3, "current round should remain independent");
  assert.equal(progressInsert.bindings[2], 17, "highest round should be imported");
  assert.equal(progressInsert.bindings[7], 250, "guest Score should become account Score");
});

test("a signed-in player can change only their own unique D1 username", async () => {
  let updateBindings = null;
  const db = {
    prepare(sql) {
      return {
        bind(...bindings) {
          if (sql.startsWith("SELECT username")) {
            return { first: async () => ({ username: "OldName" }) };
          }
          return {
            run: async () => {
              updateBindings = bindings;
            },
          };
        },
      };
    },
  };
  const response = await updateAccountUsername(
    db,
    new Request("https://api.example.test/api/account/username", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: " Richtofen_93 " }),
    }),
    "user_123",
  );

  assert.deepEqual(response, { status: 200, body: { username: "Richtofen_93" } });
  assert.deepEqual(updateBindings, ["Richtofen_93", "user_123"]);
});

test("username changes preserve D1 uniqueness errors", async () => {
  const db = {
    prepare(sql) {
      return {
        bind() {
          if (sql.startsWith("SELECT username")) {
            return { first: async () => ({ username: "OldName" }) };
          }
          return {
            run: async () => {
              throw new Error("UNIQUE constraint failed: player_profiles.username");
            },
          };
        },
      };
    },
  };
  const response = await updateAccountUsername(
    db,
    new Request("https://api.example.test/api/account/username", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "TakenName" }),
    }),
    "user_123",
  );

  assert.deepEqual(response, {
    status: 409,
    body: { error: "That username is already taken." },
  });
});

test("account routes reject requests without a Clerk bearer token before any network call", async () => {
  let fetched = false;
  await assert.rejects(
    verifyClerkRequest(
      new Request("https://api.example.test/api/account"),
      {
        CLERK_ISSUER: "https://example.clerk.accounts.dev",
        CLERK_AUTHORIZED_PARTIES: "https://thedailyundead.com",
      },
      async () => {
        fetched = true;
        throw new Error("unexpected");
      },
    ),
    /signed-in account/,
  );
  assert.equal(fetched, false);
});

test("D1 enforces one attempt per browser/date and updates aggregates on inserts only", async () => {
  const schema = await fs.readFile(
    new URL("../worker/migrations/0001_create_attempts.sql", import.meta.url),
    "utf8",
  );

  assert.match(schema, /UNIQUE \(puzzle_date, player_hash\)/);
  assert.match(schema, /AFTER INSERT ON attempts/);
  assert.match(schema, /SET total_games = total_games \+ 1/);
});

test("the account migration separates private profiles, cross-device saves and verified results", async () => {
  const schema = await fs.readFile(
    new URL("../worker/migrations/0003_create_player_accounts.sql", import.meta.url),
    "utf8",
  );

  assert.match(schema, /CREATE TABLE IF NOT EXISTS player_profiles/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS player_saves/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS player_daily_saves/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS player_daily_results/);
  assert.match(schema, /UNIQUE INDEX IF NOT EXISTS player_profiles_username_idx/);
  assert.doesNotMatch(schema, /password|email_address/i);
});

test("the social migration stores curated public profile fields", async () => {
  const schema = await Promise.all([
    fs.readFile(new URL("../worker/migrations/0004_create_social_profiles.sql", import.meta.url), "utf8"),
    fs.readFile(new URL("../worker/migrations/0005_add_favourite_game.sql", import.meta.url), "utf8"),
  ]).then((parts) => parts.join("\n"));
  assert.match(schema, /ADD COLUMN avatar_id/);
  assert.match(schema, /avatar_id TEXT NOT NULL DEFAULT 'unselected'/);
  assert.match(schema, /ADD COLUMN theme_id/);
  assert.match(schema, /ADD COLUMN favourite_map/);
  assert.match(schema, /ADD COLUMN favourite_game/);
  assert.match(schema, /ADD COLUMN bio/);
  assert.doesNotMatch(schema, /friend/i);
});

test("the redesign migration preserves old balances and makes results repairable", async () => {
  const schema = await Promise.all([
    fs.readFile(new URL("../worker/migrations/0006_scoring_progression_redesign.sql", import.meta.url), "utf8"),
    fs.readFile(new URL("../worker/migrations/0007_add_round_reconstruction_anchor.sql", import.meta.url), "utf8"),
    fs.readFile(new URL("../worker/migrations/0008_make_result_awards_atomic.sql", import.meta.url), "utf8"),
  ]).then((parts) => parts.join("\n"));
  assert.match(schema, /ADD COLUMN score INTEGER NOT NULL DEFAULT 0/);
  assert.match(schema, /SET score = MAX\(score, points_balance\)/);
  assert.match(schema, /ADD COLUMN score_awarded/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS game_dates/);
  assert.match(schema, /counts_for_round/);
  assert.match(schema, /round_anchor_value = current_round/);
  assert.match(schema, /ADD COLUMN progression_applied/);
  assert.match(schema, /SET score_awarded = points_earned/);
  assert.doesNotMatch(schema, /DROP TABLE|DELETE FROM player_saves/i);
});

test("the Worker's verification catalogue matches the browser puzzle catalogue", async () => {
  const index = JSON.parse(await readProjectFile("data/maps/index.json"));
  const expectedMaps = await Promise.all(
    index.maps.map(async (filename) => {
      const map = JSON.parse(await readProjectFile(`data/maps/${filename}`));
      return {
        id: map.id,
        title: map.title,
        availableFrom: map.availableFrom,
        steps: map.steps.map(({ id, order }) => ({ id, order })),
      };
    }),
  );

  assert.deepEqual(workerMaps, expectedMaps);
  assert.deepEqual(workerAnswerEquivalents, index.answerEquivalents || []);
  assert.deepEqual(profileGames, index.games.map(({ title }) => title));
  assert.deepEqual(profileMaps, [
    ...expectedMaps.map(({ title }) => title),
    ...(index.selectionOnlyMaps || []).map(({ title }) => title),
  ]);
});
