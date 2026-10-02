import test from "node:test";
import assert from "node:assert/strict";

import {
  canUseRequestedPreviewDate,
  getProgressionUpdateVisibility,
  getRequiredMissedDates,
  isLocalDevelopmentHostname,
  migrateLegacyLocalScore,
  migrateStoredRoundNumbering,
  prepareMissedDayProgress,
} from "../js/progression.js";

function memoryStorage(entries = [], failOnKey = null) {
  const values = new Map(entries);
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      if (key === failOnKey) throw new Error("Storage unavailable");
      values.set(key, value);
    },
  };
}

test("browser-only Round history shifts from zero-based to Round 1 exactly once", () => {
  const values = new Map([
    ["streak", "0"],
    ["best", "1"],
  ]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const keys = { streakKey: "streak", bestRoundKey: "best", versionKey: "version" };

  assert.equal(migrateStoredRoundNumbering(storage, keys), true);
  assert.equal(values.get("streak"), "1");
  assert.equal(values.get("best"), "2");
  assert.equal(values.get("version"), "starts-at-one");
  assert.equal(migrateStoredRoundNumbering(storage, keys), false);
  assert.equal(values.get("streak"), "1");
  assert.equal(values.get("best"), "2");
});

test("legacy local Score uses the frozen launch estimate exactly once", () => {
  const storage = memoryStorage([["legacy-points", "0"]]);
  const options = {
    scoreKey: "score",
    legacyPointsKey: "legacy-points",
    markerKey: "score-migration",
    currentScore: 0,
    solves: 18,
    dailyState: null,
  };

  assert.deepEqual(migrateLegacyLocalScore(storage, options), {
    score: 1510,
    migrated: true,
  });
  assert.equal(storage.values.get("score"), "1510");
  assert.equal(storage.values.get("score-migration"), "lifetime-estimate-v1");

  storage.values.set("legacy-points", "9999");
  assert.deepEqual(migrateLegacyLocalScore(storage, { ...options, currentScore: 1510 }), {
    score: 1510,
    migrated: false,
  });
});

test("legacy local Score uses today's completed result as the known performance sample", () => {
  const storage = memoryStorage([["legacy-points", "0"]]);
  const result = migrateLegacyLocalScore(storage, {
    scoreKey: "score",
    legacyPointsKey: "legacy-points",
    markerKey: "score-migration",
    currentScore: 100,
    solves: 19,
    dailyState: {
      phase: "result",
      isCorrect: true,
      totalRoundsRecorded: true,
      pointsRecorded: true,
      mapPoints: 50,
      bonusPointsRecorded: true,
      bonusComplete: true,
      bonusPoints: 50,
    },
  });

  assert.deepEqual(result, { score: 1660, migrated: true });
});

test("legacy local Score does not personalise from an unfinished bonus", () => {
  const storage = memoryStorage([["legacy-points", "0"]]);
  const result = migrateLegacyLocalScore(storage, {
    scoreKey: "score",
    legacyPointsKey: "legacy-points",
    markerKey: "score-migration",
    currentScore: 50,
    solves: 19,
    dailyState: {
      phase: "result",
      isCorrect: true,
      totalRoundsRecorded: true,
      pointsRecorded: true,
      mapPoints: 50,
      bonusPointsRecorded: false,
      bonusComplete: false,
      bonusPoints: 0,
    },
  });

  assert.deepEqual(result, { score: 1560, migrated: true });
});

test("legacy local Score is never reduced below saved progress", () => {
  const storage = memoryStorage([["legacy-points", "100"]]);
  const result = migrateLegacyLocalScore(storage, {
    scoreKey: "score",
    legacyPointsKey: "legacy-points",
    markerKey: "score-migration",
    currentScore: 100,
    solves: 1,
    dailyState: null,
  });

  assert.deepEqual(result, { score: 100, migrated: false });
  assert.equal(storage.values.get("score"), "100");
  assert.equal(storage.values.get("score-migration"), "lifetime-estimate-v1");
});

test("new local players without legacy Points are not migrated", () => {
  const storage = memoryStorage([["score", "50"]]);
  const result = migrateLegacyLocalScore(storage, {
    scoreKey: "score",
    legacyPointsKey: "legacy-points",
    markerKey: "score-migration",
    currentScore: 50,
    solves: 1,
    dailyState: null,
  });

  assert.deepEqual(result, { score: 50, migrated: false });
  assert.equal(storage.values.has("score-migration"), false);
});

test("legacy local Score remains idempotent when the marker cannot be saved", () => {
  const storage = memoryStorage([["legacy-points", "0"]], "score-migration");
  const options = {
    scoreKey: "score",
    legacyPointsKey: "legacy-points",
    markerKey: "score-migration",
    currentScore: 0,
    solves: 18,
    dailyState: null,
  };

  assert.deepEqual(migrateLegacyLocalScore(storage, options), {
    score: 1510,
    migrated: true,
  });
  assert.equal(storage.values.get("score"), "1510");
  assert.deepEqual(migrateLegacyLocalScore(storage, { ...options, currentScore: 1510 }), {
    score: 1510,
    migrated: false,
  });
});

test("legacy local Score is not marked migrated when the Score cannot be saved", () => {
  const storage = memoryStorage([["legacy-points", "0"]], "score");
  const result = migrateLegacyLocalScore(storage, {
    scoreKey: "score",
    legacyPointsKey: "legacy-points",
    markerKey: "score-migration",
    currentScore: 0,
    solves: 18,
    dailyState: null,
  });

  assert.deepEqual(result, { score: 0, migrated: false });
  assert.equal(storage.values.has("score-migration"), false);
});

test("developer controls are enabled only on local hostnames", () => {
  assert.equal(isLocalDevelopmentHostname("localhost"), true);
  assert.equal(isLocalDevelopmentHostname("127.0.0.1"), true);
  assert.equal(isLocalDevelopmentHostname("::1"), true);
  assert.equal(isLocalDevelopmentHostname("[::1]"), true);
  assert.equal(isLocalDevelopmentHostname("thedailyundead.com"), false);
});

test("playing on the following UTC day keeps the Round", () => {
  const result = prepareMissedDayProgress({
    savedState: null,
    lastPlayedDate: "2026-07-29",
    dateKey: "2026-07-30",
    currentRound: 4,
    score: 900,
  });
  assert.equal(result.missedDayState, null);
  assert.equal(result.currentRound, 4);
  assert.equal(result.score, 900);
  assert.equal(result.progressReset, false);
});

test("missed required dates reset only the Round", () => {
  const result = prepareMissedDayProgress({
    savedState: null,
    lastPlayedDate: "2026-07-27",
    dateKey: "2026-07-30",
    currentRound: 4,
    score: 900,
  });
  assert.deepEqual(result.missedDayState, {
    dateKey: "2026-07-30",
    missedDays: 2,
    missedDates: ["2026-07-28", "2026-07-29"],
    roundsBeforeLoss: 4,
    resolved: false,
  });
  assert.equal(result.currentRound, 1);
  assert.equal(result.score, 900);
  assert.equal(result.progressReset, true);
});

test("protected game dates are skipped without granting a free Round", () => {
  assert.deepEqual(
    getRequiredMissedDates("2026-07-27", "2026-07-30", ["2026-07-28"]),
    ["2026-07-29"],
  );
  const result = prepareMissedDayProgress({
    savedState: null,
    lastPlayedDate: "2026-07-27",
    dateKey: "2026-07-29",
    currentRound: 38,
    score: 5000,
    protectedDates: ["2026-07-28"],
  });
  assert.equal(result.currentRound, 38);
  assert.equal(result.missedDayState, null);
  assert.equal(result.score, 5000);
});

test("an unresolved Round loss is repaired when its missed date is protected later", () => {
  const result = prepareMissedDayProgress({
    savedState: {
      dateKey: "2026-07-29",
      missedDays: 1,
      missedDates: ["2026-07-28"],
      roundsBeforeLoss: 38,
      resolved: false,
    },
    lastPlayedDate: "2026-07-27",
    dateKey: "2026-07-29",
    currentRound: 1,
    score: 5000,
    protectedDates: ["2026-07-28"],
  });
  assert.equal(result.currentRound, 38);
  assert.equal(result.missedDayState, null);
  assert.equal(result.score, 5000);
  assert.equal(result.progressReset, true);
});

test("a player already between runs is not repeatedly reset", () => {
  const result = prepareMissedDayProgress({
    savedState: { dateKey: "2026-07-28", missedDays: 1, roundsBeforeLoss: 3, resolved: true },
    lastPlayedDate: "2026-07-26",
    dateKey: "2026-07-30",
    currentRound: 1,
    score: 800,
  });
  assert.equal(result.missedDayState, null);
  assert.equal(result.currentRound, 1);
  assert.equal(result.score, 800);
  assert.equal(result.progressReset, false);
});

test("future URL previews require dev-button authorization", () => {
  assert.equal(canUseRequestedPreviewDate("2026-07-31", "2026-07-30", false), false);
  assert.equal(canUseRequestedPreviewDate("2026-07-31", "2026-07-30", true), true);
  assert.equal(canUseRequestedPreviewDate("2026-07-29", "2026-07-30", false), true);
});

test("progression update windows end exactly two and four days after launch", () => {
  const launchAt = Date.parse("2026-10-10T18:00:00Z");
  const day = 24 * 60 * 60 * 1000;

  assert.deepEqual(
    getProgressionUpdateVisibility({ launchAt, now: launchAt - 1 }),
    { showReminder: false, autoOpen: false },
  );
  assert.deepEqual(
    getProgressionUpdateVisibility({ launchAt, now: launchAt }),
    { showReminder: true, autoOpen: true },
  );
  assert.deepEqual(
    getProgressionUpdateVisibility({ launchAt, now: launchAt + 2 * day - 1 }),
    { showReminder: true, autoOpen: true },
  );
  assert.deepEqual(
    getProgressionUpdateVisibility({ launchAt, now: launchAt + 2 * day }),
    { showReminder: true, autoOpen: false },
  );
  assert.deepEqual(
    getProgressionUpdateVisibility({ launchAt, now: launchAt + 4 * day - 1 }),
    { showReminder: true, autoOpen: false },
  );
  assert.deepEqual(
    getProgressionUpdateVisibility({ launchAt, now: launchAt + 4 * day }),
    { showReminder: false, autoOpen: false },
  );
  assert.equal(
    getProgressionUpdateVisibility({ launchAt, now: launchAt + day, autoShown: true }).autoOpen,
    false,
  );
});
