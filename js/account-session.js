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
  return typeof value === "string" && value.startsWith("user_") && value.length <= 200;
}

function normalizeRevision(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function pendingProgressStorageKey(userId) {
  return `${pendingProgressStoragePrefix}${userId}`;
}

export function readRememberedAccount(storage = globalThis.localStorage) {
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

export function forgetRememberedAccount(storage = globalThis.localStorage) {
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
