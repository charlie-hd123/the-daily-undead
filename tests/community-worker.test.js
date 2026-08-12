import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import {
  getPreviousDateKey,
  isAllowedOrigin,
  isValidDateKey,
  validateAttempt,
} from "../worker/src/index.js";

const today = "2026-08-12";
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

test("Worker CORS only allows configured browser origins", () => {
  const env = { ALLOWED_ORIGINS: "https://thedailyundead.com,http://localhost:8080" };
  const request = (origin) => new Request("https://worker.example/api/stats", {
    headers: origin ? { Origin: origin } : {},
  });

  assert.equal(isAllowedOrigin(request("https://thedailyundead.com"), env), true);
  assert.equal(isAllowedOrigin(request("https://attacker.example"), env), false);
  assert.equal(isAllowedOrigin(request(null), env), true);
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
