import test from "node:test";
import assert from "node:assert/strict";

import {
  accountMemoryStorageKey,
  clearPendingProgress,
  forgetRememberedAccount,
  pendingProgressBelongsTo,
  readPendingProgress,
  readRememberedAccount,
  rememberAccount,
  writePendingProgress,
} from "../js/account-session.js";
import {
  confirmAccountResultSubmission,
  replaySavedAccountResult,
} from "../js/account.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("remembered accounts retain only an app-owned account id and cloud revision", () => {
  const storage = memoryStorage();
  const accountId = "acct_1234567890abcdef1234567890abcdef";
  assert.equal(rememberAccount(storage, { userId: accountId, revision: 12 }), true);
  assert.deepEqual(readRememberedAccount(storage), { userId: accountId, revision: 12 });
  assert.doesNotMatch(storage.getItem(accountMemoryStorageKey), /email|token/i);

  forgetRememberedAccount(storage);
  assert.equal(readRememberedAccount(storage), null);
});

test("pending progress remains isolated by app-owned account id", () => {
  const storage = memoryStorage();
  const snapshot = { progress: { currentRound: 15 }, dailyState: { phase: "result" } };
  const accountId = "acct_1234567890abcdef1234567890abcdef";
  const otherAccountId = "acct_abcdef1234567890abcdef1234567890";

  assert.equal(writePendingProgress(storage, {
    userId: accountId,
    revision: 7,
    puzzleDate: "2026-09-27",
    snapshot,
  }), true);

  const pending = readPendingProgress(storage, accountId);
  assert.deepEqual(pending.snapshot, snapshot);
  assert.equal(pending.revision, 7);
  assert.equal(readPendingProgress(storage, otherAccountId), null);
  assert.equal(pendingProgressBelongsTo(pending, accountId), true);
  assert.equal(pendingProgressBelongsTo(pending, otherAccountId), false);

  clearPendingProgress(storage, accountId);
  assert.equal(readPendingProgress(storage, accountId), null);
});

test("cleared or malformed storage is treated as a clean browser", () => {
  const storage = memoryStorage();
  storage.setItem(accountMemoryStorageKey, "not-json");
  assert.equal(readRememberedAccount(storage), null);
  assert.equal(readPendingProgress(storage, "user_alpha"), null);
});

test("expired accounts must sign in before submitting a scored result", () => {
  let prompted = 0;
  const controller = {
    resultSubmissionRequiresSignIn: true,
    requestResultSignIn: () => { prompted += 1; },
  };

  assert.equal(confirmAccountResultSubmission(controller), false);
  assert.equal(prompted, 1);
  assert.equal(confirmAccountResultSubmission({ resultSubmissionRequiresSignIn: false }), true);
  assert.equal(confirmAccountResultSubmission(null), true);
});

test("saved map and bonus results replay sequentially and return current server totals", async () => {
  const calls = [];
  const progress = await replaySavedAccountResult({
    puzzleDate: "2026-10-03",
    dailyState: {
      phase: "result",
      puzzleKey: "2026-10-03:map:steps",
      selectedMapId: "map",
      lockedClues: 2,
      bonusComplete: true,
      bonusFailed: false,
      bonusOrder: ["step-a", "step-b", "step-c"],
    },
    sendMapResult: async (payload) => {
      calls.push(["map", payload]);
      return { progress: { score: 120, solves: 4 } };
    },
    sendBonusResult: async (payload) => {
      assert.equal(calls[0][0], "map");
      calls.push(["bonus", payload]);
      return { progress: { score: 140, solves: 4 } };
    },
  });

  assert.deepEqual(calls.map(([type]) => type), ["map", "bonus"]);
  assert.deepEqual(progress, { score: 140, solves: 4 });
});
