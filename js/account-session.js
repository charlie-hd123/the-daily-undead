import { browserStorage } from "./browser-storage.js?v=20261031-5";
export const accountMemoryStorageKey = "the-daily-undead:account-memory";
const pendingProgressStoragePrefix = "the-daily-undead:account-pending:";

function parseStoredObject(storage, key) {
  try {
    const value = JSON.parse(storage.getItem(key));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function validUserId(value) {
  return typeof value === "string" && (
    /^user_[A-Za-z0-9]+$/.test(value) ||
    /^acct_[0-9a-f]{32}$/i.test(value)
  ) && value.length <= 200;
}

function normalizeRevision(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function pendingProgressStorageKey(userId) {
  return `${pendingProgressStoragePrefix}${userId}`;
}

export function readRememberedAccount(storage = browserStorage) {
  const value = parseStoredObject(storage, accountMemoryStorageKey);
  if (!validUserId(value?.userId)) return null;
  return {
    userId: value.userId,
    revision: normalizeRevision(value.revision),
  };
}

export function rememberAccount(storage, { userId, revision = null }) {
  if (!validUserId(userId)) return false;
  try {
    storage.setItem(accountMemoryStorageKey, JSON.stringify({
      userId,
      revision: normalizeRevision(revision),
    }));
    return true;
  } catch {
    return false;
  }
}

export function forgetRememberedAccount(storage = browserStorage) {
  try {
    storage.removeItem(accountMemoryStorageKey);
  } catch {
    // Signing out still proceeds if browser storage is unavailable.
  }
}

export function writePendingProgress(
  storage,
  { userId, revision = null, puzzleDate, snapshot },
) {
  if (
    !validUserId(userId) ||
    typeof puzzleDate !== "string" ||
    !snapshot ||
    typeof snapshot !== "object"
  ) {
    return false;
  }

  try {
    storage.setItem(pendingProgressStorageKey(userId), JSON.stringify({
      userId,
      revision: normalizeRevision(revision),
      puzzleDate,
      snapshot,
      savedAt: new Date().toISOString(),
    }));
    return true;
  } catch {
    return false;
  }
}

export function readPendingProgress(storage, userId) {
  if (!validUserId(userId)) return null;
  const value = parseStoredObject(storage, pendingProgressStorageKey(userId));
  if (
    value?.userId !== userId ||
    typeof value.puzzleDate !== "string" ||
    !value.snapshot ||
    typeof value.snapshot !== "object"
  ) {
    return null;
  }
  return {
    userId,
    revision: normalizeRevision(value.revision),
    puzzleDate: value.puzzleDate,
    snapshot: value.snapshot,
    savedAt: typeof value.savedAt === "string" ? value.savedAt : null,
  };
}

export function clearPendingProgress(storage, userId) {
  if (!validUserId(userId)) return;
  try {
    storage.removeItem(pendingProgressStorageKey(userId));
  } catch {
    // A later successful sync can retry cleanup.
  }
}

export function pendingProgressBelongsTo(pending, userId) {
  return Boolean(pending && validUserId(userId) && pending.userId === userId);
}

// Queue the whole mutation, including its revision acknowledgement. Serialising
// fetch alone still lets a save construct its body using an obsolete revision.
export function createAccountMutationQueue() {
  let tail = Promise.resolve();
  return (operation) => {
    const result = tail.then(operation);
    tail = result.catch(() => {});
    return result;
  };
}

function puzzleActions(state) {
  if (!state) return null;
  if (state.dayStateVersion === 1) return {
    date: state.dateKey, type: state.officialType,
    sessions: ['easter', 'word', 'blood'].map((type) => puzzleActions(state.sessions?.[type])),
  };
  if (state.puzzleKey) return {
    key: state.puzzleKey, phase: state.phase,
    clues: state.cluesRevealed, locked: state.lockedClues ?? null,
    game: state.selectedGameId ?? null, map: state.selectedMapId ?? null,
    order: state.bonusOrder || [], bonusComplete: Boolean(state.bonusComplete),
    bonusFailed: Boolean(state.bonusFailed),
  };
  if (Array.isArray(state.attempts)) return {
    key: state.key, rules: state.rulesVersion ?? 1,
    attempts: state.attempts, selected: state.selected || [],
  };
  return { key: state.key, guesses: state.guesses || [], complete: Boolean(state.complete) };
}

export function pendingMatchesCloud(pending, account) {
  if (!pending?.snapshot?.dailyState || !account?.dailyState) return false;
  return JSON.stringify(puzzleActions(pending.snapshot.dailyState))
    === JSON.stringify(puzzleActions(account.dailyState));
}

const sameActions = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const isPrefix = (older, newer) => Array.isArray(older) && Array.isArray(newer)
  && older.length <= newer.length && older.every((action, index) => sameActions(action, newer[index]));

function sessionCoveredByCloud(local, cloud) {
  if (!local) return true;
  if (!cloud) return local.puzzleKey
    ? local.phase === 'clues' && (local.cluesRevealed || 1) === 1
      && !local.selectedGameId && !local.selectedMapId && !local.bonusOrder?.length
    : !local.complete && !(local.guesses?.length || local.attempts?.length || local.selected?.length);
  if (local.puzzleKey) {
    if (local.puzzleKey !== cloud.puzzleKey) return false;
    const phases = ['clues', 'game', 'map', 'result'];
    if (phases.indexOf(local.phase) > phases.indexOf(cloud.phase)) return false;
    if ((local.cluesRevealed || 1) > (cloud.cluesRevealed || 1)) return false;
    for (const key of ['selectedGameId', 'selectedMapId', 'lockedClues']) {
      if (local[key] != null && local[key] !== cloud[key]) return false;
    }
    if (local.phase === 'result' && local.isCorrect !== cloud.isCorrect) return false;
    if (local.bonusComplete && !cloud.bonusComplete || local.bonusFailed && !cloud.bonusFailed) return false;
    return !local.bonusOrder?.length || sameActions(local.bonusOrder, cloud.bonusOrder);
  }
  if (local.key !== cloud.key || local.complete && !cloud.complete) return false;
  if (Array.isArray(local.attempts)) {
    if ((local.rulesVersion ?? 1) !== (cloud.rulesVersion ?? 1)) return false;
    // Different transcripts/active selections remain an explicit choice. Never
    // combine guesses or strikes from independent attempts.
    return isPrefix(local.attempts, cloud.attempts || [])
      && (!local.selected?.length || sameActions(local.selected, cloud.selected));
  }
  return isPrefix(local.guesses || [], cloud.guesses || []);
}

export function pendingCoveredByCloud(pending, account) {
  const local = pending?.snapshot?.dailyState;
  const cloud = account?.dailyState;
  if (!local) return false;
  if (local.dayStateVersion === 1) {
    if (local.dateKey !== pending.puzzleDate) return false;
    if (cloud && (cloud.dayStateVersion !== 1 || local.dateKey !== cloud.dateKey
      || local.officialType !== cloud.officialType)) return false;
    return ['easter', 'word', 'blood'].every((type) => sessionCoveredByCloud(local.sessions?.[type], cloud?.sessions?.[type]));
  }
  return sessionCoveredByCloud(local, cloud);
}

export function recommendedAccountSave(pending, account) {
  const local = pending?.snapshot?.dailyState;
  const cloud = account?.dailyState;
  if (!local || !cloud) return null;
  const cloudCoversLocal = pendingCoveredByCloud(pending, account);
  const localCoversCloud = pendingCoveredByCloud({
    puzzleDate: pending.puzzleDate,
    snapshot: { dailyState: cloud },
  }, { dailyState: local });
  if (cloudCoversLocal === localCoversCloud) return null;
  return cloudCoversLocal ? 'cloud' : 'device';
}

export function describeAccountSave(date, snapshot) {
  const day = snapshot?.dailyState;
  const type = day?.dayStateVersion === 1 ? day.officialType : 'easter';
  const session = day?.dayStateVersion === 1 ? day.sessions?.[type] : day;
  let detail = 'Puzzle not started.';
  if (type === 'word' && session) {
    detail = `Letters tried: ${session.guesses?.join(', ') || 'none'}.`;
  } else if (type === 'blood' && session) {
    detail = `${session.solved?.length || 0}/4 connections; ${session.attempts?.length || 0} attempts.`;
    if (session.selected?.length) detail += ` Selected: ${session.selected.join(', ')}.`;
    else if (session.attempts?.length) detail += ` Last trio: ${session.attempts.at(-1).join(', ')}.`;
  } else if (type === 'easter' && session) {
    detail = `${session.cluesRevealed || 1}/3 clues; ${session.phase === 'result'
      ? session.isCorrect ? 'correct map' : 'incorrect map' : 'map not submitted'}.`;
    if (session.bonusComplete || session.bonusFailed) detail += ` Bonus ${session.bonusComplete ? 'correct' : 'incorrect'}.`;
  }
  const complete = day?.officialCompleted || isLegacyComplete(day);
  return `${date} · ${complete ? 'Daily puzzle complete. ' : ''}${detail}`;
}

function isLegacyComplete(state) {
  return state?.phase === 'result' && (state.isCorrect === false || state.bonusComplete || state.bonusFailed);
}

export function archivePendingProgress(storage, pending) {
  // Keep one recovery copy per account/day even after an explicit cloud choice.
  // No authentication tokens or other accounts' progress are included.
  try {
    storage.setItem(`${pendingProgressStorageKey(pending.userId)}:recovery:${pending.puzzleDate}`,
      JSON.stringify(pending));
    return true;
  } catch { return false; }
}
