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
  sanitizeDailyState,
  sanitizeProgress,
} from "../worker/src/accounts.js";
import { verifyClerkRequest } from "../worker/src/auth.js";
import {
  answerEquivalents as workerAnswerEquivalents,
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

test("account usernames and uploaded local saves are tightly validated", () => {
  assert.equal(normalizeUsername(" Richtofen_93 "), "Richtofen_93");
  assert.equal(normalizeUsername("no spaces allowed"), null);
  assert.equal(normalizeUsername("ab"), null);

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
      pointsBalance: 250,
      totalRounds: 40,
      reviveCount: 2,
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
});
