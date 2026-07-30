import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateReviveCost,
  canUseRequestedPreviewDate,
  incrementReviveCount,
  isLocalDevelopmentHostname,
  prepareMissedDayProgress,
  purchaseMissedDayRevive,
  resetReviveCount,
  shouldResetReviveCycle,
} from "../js/progression.js";

test("developer controls are enabled only on local hostnames", () => {
  assert.equal(isLocalDevelopmentHostname("localhost"), true);
  assert.equal(isLocalDevelopmentHostname("127.0.0.1"), true);
  assert.equal(isLocalDevelopmentHostname("::1"), true);
  assert.equal(isLocalDevelopmentHostname("[::1]"), true);
  assert.equal(isLocalDevelopmentHostname("thedailyundead.com"), false);
  assert.equal(isLocalDevelopmentHostname("charlie-hd123.github.io"), false);
});

test("revive costs rise through ten tiers and then stay at the ceiling", () => {
  const expectedCosts = [100, 250, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000];

  assert.deepEqual(
    expectedCosts.map((_, revivesUsed) => calculateReviveCost(revivesUsed)),
    expectedCosts,
  );
  assert.equal(calculateReviveCost(10), 5000);
  assert.equal(calculateReviveCost(100), 5000);
  assert.equal(calculateReviveCost(-1), 100);
  assert.equal(calculateReviveCost(Number.NaN), 100);
});

test("revive pricing resets only when a new run starts after an unrevived loss", () => {
  assert.equal(
    shouldResetReviveCycle({
      missedDayState: null,
      phase: "clues",
      currentRound: 0,
      points: 0,
    }),
    true,
  );
  assert.equal(
    shouldResetReviveCycle({
      missedDayState: null,
      phase: "result",
      currentRound: 0,
      points: 0,
    }),
    false,
  );
  assert.equal(
    shouldResetReviveCycle({
      missedDayState: { resolved: false },
      phase: "clues",
      currentRound: 0,
      points: 0,
    }),
    false,
  );
  assert.equal(
    shouldResetReviveCycle({
      missedDayState: null,
      phase: "clues",
      currentRound: 3,
      points: 200,
    }),
    false,
  );
});

test("an unaffordable revive resets the next run to 100 points", () => {
  let revivesUsed = 0;

  assert.equal(calculateReviveCost(revivesUsed), 100);
  revivesUsed = incrementReviveCount(revivesUsed);
  assert.equal(calculateReviveCost(revivesUsed), 250);

  const playerPointsAtGameOver = 100;
  assert.equal(playerPointsAtGameOver >= calculateReviveCost(revivesUsed), false);
  assert.equal(
    shouldResetReviveCycle({
      missedDayState: null,
      phase: "clues",
      currentRound: 0,
      points: 0,
    }),
    true,
  );

  revivesUsed = resetReviveCount();
  assert.equal(calculateReviveCost(revivesUsed), 100);
});

test("successful revives advance every tier and remain at the ceiling", () => {
  const expectedCosts = [100, 250, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000];
  let revivesUsed = 0;

  for (const expectedCost of expectedCosts) {
    assert.equal(calculateReviveCost(revivesUsed), expectedCost);
    revivesUsed = incrementReviveCount(revivesUsed);
  }

  assert.equal(calculateReviveCost(revivesUsed), 5000);
  revivesUsed = incrementReviveCount(revivesUsed);
  assert.equal(calculateReviveCost(revivesUsed), 5000);
});

test("playing on the following UTC day does not end the run", () => {
  const result = prepareMissedDayProgress({
    savedState: null,
    lastPlayedDate: "2026-07-29",
    dateKey: "2026-07-30",
    currentRound: 4,
    points: 90,
  });

  assert.equal(result.missedDayState, null);
  assert.equal(result.currentRound, 4);
  assert.equal(result.points, 90);
  assert.equal(result.progressReset, false);
});

test("missing a UTC day creates a loss and resets current progress", () => {
  const result = prepareMissedDayProgress({
    savedState: null,
    lastPlayedDate: "2026-07-27",
    dateKey: "2026-07-30",
    currentRound: 4,
    points: 90,
  });

  assert.deepEqual(result.missedDayState, {
    dateKey: "2026-07-30",
    missedDays: 2,
    roundsBeforeLoss: 4,
    pointsBeforeLoss: 90,
    revived: false,
    resolved: false,
  });
  assert.equal(result.currentRound, 0);
  assert.equal(result.points, 0);
  assert.equal(result.progressReset, true);
});

test("a missed-day revive charges once and resolves the loss immediately", () => {
  const missedDayState = {
    dateKey: "2026-07-30",
    missedDays: 1,
    roundsBeforeLoss: 5,
    pointsBeforeLoss: 300,
    revived: false,
    resolved: false,
  };
  const revival = purchaseMissedDayRevive(missedDayState, 100);

  assert.equal(revival.currentRound, 5);
  assert.equal(revival.points, 200);
  assert.equal(revival.missedDayState.revived, true);
  assert.equal(revival.missedDayState.resolved, true);
  assert.equal(revival.missedDayState.reviveCostPaid, 100);
  assert.equal(purchaseMissedDayRevive(revival.missedDayState, 100), null);
});

test("a later missed day creates a new loss after an earlier revive", () => {
  const resolvedRevive = {
    dateKey: "2026-07-28",
    missedDays: 1,
    roundsBeforeLoss: 5,
    pointsBeforeLoss: 300,
    revived: true,
    resolved: true,
  };
  const result = prepareMissedDayProgress({
    savedState: resolvedRevive,
    lastPlayedDate: "2026-07-27",
    dateKey: "2026-07-30",
    currentRound: 5,
    points: 200,
  });

  assert.equal(result.missedDayState.dateKey, "2026-07-30");
  assert.equal(result.missedDayState.revived, false);
  assert.equal(result.missedDayState.resolved, false);
  assert.equal(result.missedDayState.pointsBeforeLoss, 200);
  assert.equal(result.currentRound, 0);
  assert.equal(result.points, 0);
});

test("an unpaid unresolved loss carries forward without resetting twice", () => {
  const unresolvedLoss = {
    dateKey: "2026-07-28",
    missedDays: 1,
    roundsBeforeLoss: 3,
    pointsBeforeLoss: 80,
    revived: false,
    resolved: false,
  };
  const result = prepareMissedDayProgress({
    savedState: unresolvedLoss,
    lastPlayedDate: "2026-07-26",
    dateKey: "2026-07-30",
    currentRound: 0,
    points: 0,
  });

  assert.equal(result.missedDayState.dateKey, "2026-07-30");
  assert.equal(result.missedDayState.missedDays, 3);
  assert.equal(result.missedDayState.pointsBeforeLoss, 80);
  assert.equal(result.progressReset, false);
});

test("a revive is rejected when points are insufficient", () => {
  const missedDayState = {
    roundsBeforeLoss: 2,
    pointsBeforeLoss: 40,
    revived: false,
    resolved: false,
  };

  assert.equal(purchaseMissedDayRevive(missedDayState, 100), null);
  assert.equal(purchaseMissedDayRevive({ ...missedDayState, pointsBeforeLoss: 100 }, 0), null);
});

test("future URL previews require dev-button authorization", () => {
  assert.equal(canUseRequestedPreviewDate("2026-07-31", "2026-07-30", false), false);
  assert.equal(canUseRequestedPreviewDate("2026-07-31", "2026-07-30", true), true);
  assert.equal(canUseRequestedPreviewDate("2026-07-29", "2026-07-30", false), true);
});
