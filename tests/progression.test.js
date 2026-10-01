import test from "node:test";
import assert from "node:assert/strict";

import {
  canUseRequestedPreviewDate,
  getRequiredMissedDates,
  isLocalDevelopmentHostname,
  prepareMissedDayProgress,
} from "../js/progression.js";

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
  assert.equal(result.currentRound, 0);
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
    currentRound: 0,
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
    currentRound: 0,
    score: 800,
  });
  assert.equal(result.missedDayState, null);
  assert.equal(result.currentRound, 0);
  assert.equal(result.score, 800);
  assert.equal(result.progressReset, false);
});

test("future URL previews require dev-button authorization", () => {
  assert.equal(canUseRequestedPreviewDate("2026-07-31", "2026-07-30", false), false);
  assert.equal(canUseRequestedPreviewDate("2026-07-31", "2026-07-30", true), true);
  assert.equal(canUseRequestedPreviewDate("2026-07-29", "2026-07-30", false), true);
});
