import test from "node:test";
import assert from "node:assert/strict";

import {
  accountMemoryStorageKey,
  archivePendingProgress,
  clearPendingProgress,
  createAccountMutationQueue,
  describeAccountSave,
  forgetRememberedAccount,
  pendingProgressBelongsTo,
  pendingMatchesCloud,
  pendingCoveredByCloud,
  recommendedAccountSave,
  readPendingProgress,
  readRememberedAccount,
  rememberAccount,
  writePendingProgress,
} from "../js/account-session.js";
import {
  confirmAccountResultSubmission,
  requestJson,
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

test('result and save mutations acknowledge revisions in order, including failures', async () => {
  const queue = createAccountMutationQueue();
  let release;
  let revision = 7;
  const first = queue(async () => {
    await new Promise((resolve) => { release = resolve; });
    revision = 8;
  });
  const second = queue(async () => {
    assert.equal(revision, 8, 'save body must use the result acknowledgement');
    throw new Error('offline');
  });
  const third = queue(async () => { assert.equal(revision, 8); revision = 9; });
  await Promise.resolve();
  assert.equal(revision, 7);
  release();
  await first;
  await assert.rejects(second, /offline/);
  await third;
  assert.equal(revision, 9);
});

test('an acknowledged save does not become a conflict because UI-only fields were normalised', () => {
  const dailyState = { dayStateVersion: 1, dateKey: '2026-10-30', officialType: 'blood',
    sessions: { blood: { key: '2026-10-30:blood:example', rulesVersion: 3,
      attempts: [['A', 'B', 'C']], selected: [], shuffleCount: 2, message: 'Found!' } } };
  const pending = { snapshot: { dailyState } };
  const cloud = structuredClone(dailyState);
  cloud.sessions.blood.shuffleCount = 0;
  cloud.sessions.blood.message = '';
  assert.equal(pendingMatchesCloud(pending, { dailyState: cloud }), true);
  cloud.sessions.blood.attempts.push(['D', 'E', 'F']);
  assert.equal(pendingMatchesCloud(pending, { dailyState: cloud }), false);
  cloud.dateKey = '2026-10-31';
  assert.equal(pendingMatchesCloud(pending, { dailyState: cloud }), false);
});

test('choosing cloud can retain the rejected device snapshot as an account-isolated recovery copy', () => {
  const storage = memoryStorage();
  const pending = { userId: 'user_alpha', puzzleDate: '2026-10-30', snapshot: { dailyState: { phase: 'result' } } };
  assert.equal(archivePendingProgress(storage, pending), true);
  assert.deepEqual(JSON.parse(storage.getItem('the-daily-undead:account-pending:user_alpha:recovery:2026-10-30')), pending);
  assert.equal(storage.getItem('the-daily-undead:account-pending:user_beta:recovery:2026-10-30'), null);
});

test('save summaries distinguish different puzzle actions even when the account totals match', () => {
  const make = (guesses) => ({progress:{score:160,solves:2,currentRound:1},dailyState:{dayStateVersion:1,officialType:'word',sessions:{word:{guesses}}}});
  const device=describeAccountSave('2026-10-31',make(['G']));
  const cloud=describeAccountSave('2026-10-31',make(['E']));
  assert.match(device,/Letters tried: G/); assert.match(cloud,/Letters tried: E/);
  assert.notEqual(device,cloud); assert.doesNotMatch(cloud,/Round|Score|solves/);
});

const wordDay = (guesses) => ({dayStateVersion:1,dateKey:'2026-10-31',officialType:'word',
  sessions:{word:{key:'2026-10-31:word:example',guesses}}});
const queuedDay = (dailyState) => ({puzzleDate:'2026-10-31',snapshot:{progress:{currentRound:4},dailyState}});

test('cloud progress automatically covers an older prefix, regardless of stale local account totals', () => {
  assert.equal(pendingCoveredByCloud(queuedDay(wordDay([])),{progress:{currentRound:50},dailyState:wordDay(['E'])}),true);
  assert.equal(pendingCoveredByCloud(queuedDay(wordDay(['E'])),{dailyState:wordDay(['E','G'])}),true);
  assert.equal(pendingCoveredByCloud(queuedDay(wordDay(['G'])),{dailyState:wordDay(['E'])}),false);
  assert.equal(pendingCoveredByCloud(queuedDay(wordDay(['E','G'])),{dailyState:wordDay(['E'])}),false);
  const wrongDay=wordDay(['E']); wrongDay.dateKey='2026-10-30';
  assert.equal(pendingCoveredByCloud(queuedDay(wordDay([])),{dailyState:wrongDay}),false);
  const wrongPuzzle=wordDay(['E']);wrongPuzzle.sessions.word.key='another-word';
  assert.equal(pendingCoveredByCloud(queuedDay(wordDay(['E'])),{dailyState:wrongPuzzle}),false);
});

test('save recommendations require strictly inclusive puzzle progress, never a larger round or score', () => {
  const pending=queuedDay(wordDay(['E','G']));
  const cloud={progress:{currentRound:50,score:9000},dailyState:wordDay(['E'])};
  assert.equal(recommendedAccountSave(pending,cloud),'device');
  pending.snapshot.dailyState=wordDay(['E']);cloud.dailyState=wordDay(['E','G']);
  assert.equal(recommendedAccountSave(pending,cloud),'cloud');
  pending.snapshot.dailyState=wordDay(['E','S']);
  assert.equal(recommendedAccountSave(pending,cloud),null,'different histories cannot be ranked safely');
  pending.snapshot.dailyState=wordDay(['E','G']);
  assert.equal(recommendedAccountSave(pending,cloud),null,'identical actions need no recommendation');
  assert.equal(recommendedAccountSave(pending,{dailyState:null}),null,'missing evidence cannot justify a highlighted choice');
});

test('new just-for-fun actions and independent Blood Ties transcripts still require a choice', () => {
  const local=wordDay(['E']),cloud=wordDay(['E','G']);
  local.sessions.blood={key:'blood-key',rulesVersion:3,attempts:[['A','B','C']],selected:[]};
  cloud.sessions.blood={key:'blood-key',rulesVersion:3,attempts:[],selected:[]};
  assert.equal(pendingCoveredByCloud(queuedDay(local),{dailyState:cloud}),false);
  cloud.sessions.blood.attempts=[['A','B','C'],['D','E','F']];
  assert.equal(pendingCoveredByCloud(queuedDay(local),{dailyState:cloud}),true);
  local.sessions.blood.selected=['G'];
  assert.equal(pendingCoveredByCloud(queuedDay(local),{dailyState:cloud}),false);
  local.sessions.blood.selected=[];cloud.sessions.blood.attempts=[['G','H','I']];
  assert.equal(pendingCoveredByCloud(queuedDay(local),{dailyState:cloud}),false);
});

test('cloud coverage preserves map choices, clue reveals and unfinished bonus arrangements', () => {
  const local={puzzleKey:'2026-10-31:map:example',phase:'clues',cluesRevealed:1};
  const cloud={...local,phase:'result',cluesRevealed:3,selectedMapId:'map',selectedGameId:'game',lockedClues:1,isCorrect:true,bonusOrder:['a','b','c'],bonusComplete:true};
  assert.equal(pendingCoveredByCloud(queuedDay(local),{dailyState:cloud}),true);
  assert.equal(pendingCoveredByCloud(queuedDay({...local,phase:'map',selectedMapId:'other-map'}),{dailyState:cloud}),false);
  assert.equal(pendingCoveredByCloud(queuedDay({...cloud,bonusComplete:false,bonusOrder:['b','a','c']}),{dailyState:cloud}),false);
  assert.equal(pendingCoveredByCloud(queuedDay(local),{dailyState:null}),true);
  assert.equal(pendingCoveredByCloud(queuedDay({...local,cluesRevealed:2}),{dailyState:null}),false);
});

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

test("account API requests time out instead of blocking game startup forever", async () => {
  const clerk = {
    session: { getToken: async () => "signed-token" },
  };

  await assert.rejects(
    requestJson(
      clerk,
      "https://api.example.test",
      "/api/account",
      {},
      {
        timeoutMs: 5,
        fetchImpl: async (_url, { signal }) => new Promise((resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          }, { once: true });
        }),
      },
    ),
    /Account sync took too long\. Your cloud save is safe\./,
  );
});

test("account API requests retain authentication and parse successful responses", async () => {
  let request;
  const result = await requestJson(
    { session: { getToken: async () => "signed-token" } },
    "https://api.example.test",
    "/api/account?date=2026-10-15",
    {},
    {
      timeoutMs: 50,
      fetchImpl: async (url, options) => {
        request = { url, options };
        return {
          ok: true,
          async json() { return { profile: { username: "Takeo" } }; },
        };
      },
    },
  );

  assert.equal(request.url.href, "https://api.example.test/api/account?date=2026-10-15");
  assert.equal(request.options.headers.Authorization, "Bearer signed-token");
  assert.equal(request.options.signal.aborted, false);
  assert.deepEqual(result, { profile: { username: "Takeo" } });
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

test("a completed official Last Words result replays with its guesses and server totals", async () => {
  const calls = [];
  const progress = await replaySavedAccountResult({
    puzzleDate: "2026-10-13",
    dailyState: {
      dayStateVersion: 1,
      dateKey: "2026-10-13",
      officialType: "word",
      officialCompleted: true,
      sessions: {
        word: {
          key: "2026-10-13:word:lw-0001",
          guesses: ["C", "H", "O"],
          wrongGuesses: 1,
          complete: true,
          success: true,
        },
      },
    },
    sendWordResult: async (payload) => {
      calls.push(payload);
      return { progress: { score: 180, solves: 5 } };
    },
  });

  assert.deepEqual(calls, [{
    puzzleDate: "2026-10-13",
    puzzleId: "2026-10-13:word:lw-0001",
    guesses: ["C", "H", "O"],
    misses: 1,
    success: true,
  }]);
  assert.deepEqual(progress, { score: 180, solves: 5 });
});

test("a completed Quest Steps result replays after cloud sanitizing removed its complete flag", async () => {
  const calls = [];
  const progress = await replaySavedAccountResult({
    puzzleDate: "2026-10-14",
    dailyState: {
      dayStateVersion: 1,
      dateKey: "2026-10-14",
      officialType: "easter",
      officialCompleted: true,
      sessions: {
        easter: {
          phase: "result",
          puzzleKey: "2026-10-14:map:steps",
          selectedMapId: "wrong-map",
          lockedClues: 3,
          isCorrect: false,
        },
      },
    },
    sendMapResult: async (payload) => {
      calls.push(["map", payload]);
      return { progress: { score: 80, solves: 4 } };
    },
    sendBonusResult: async (payload) => {
      calls.push(["bonus", payload]);
      return { progress: { score: 80, solves: 4 } };
    },
    sendWordResult: async (payload) => {
      calls.push(["word", payload]);
      return { progress: { score: 80, solves: 4 } };
    },
  });

  assert.deepEqual(calls.map(([type]) => type), ["map"]);
  assert.deepEqual(progress, { score: 80, solves: 4 });
});
