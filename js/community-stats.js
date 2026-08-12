const playerIdStorageKey = "the-daily-undead:community-player-id";
const submittedPuzzleStoragePrefix = "the-daily-undead:community-submitted:";

function createAnonymousPlayerId(cryptoApi = globalThis.crypto) {
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();
  if (typeof cryptoApi?.getRandomValues !== "function") return null;

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function getOrCreateAnonymousPlayerId(storage = globalThis.localStorage, cryptoApi = globalThis.crypto) {
  try {
    const savedId = storage.getItem(playerIdStorageKey);
    if (savedId) return savedId;

    const playerId = createAnonymousPlayerId(cryptoApi);
    if (!playerId) return null;
    storage.setItem(playerIdStorageKey, playerId);
    return storage.getItem(playerIdStorageKey) === playerId ? playerId : null;
  } catch {
    // Without persistent storage, a stable anonymous ID cannot be guaranteed.
    return null;
  }
}

export function getCommunityStatsApiUrl(documentObject = globalThis.document) {
  const configuredUrl = documentObject
    ?.querySelector('meta[name="daily-undead-stats-api"]')
    ?.content
    ?.trim();
  if (!configuredUrl) return null;

  try {
    const url = new URL(configuredUrl);
    return url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1"
      ? url.href.replace(/\/$/, "")
      : null;
  } catch {
    return null;
  }
}

export function resolveCommunityStatsApiUrl({
  isLocalDevelopment,
  documentObject = globalThis.document,
} = {}) {
  return isLocalDevelopment
    ? "http://localhost:8787"
    : getCommunityStatsApiUrl(documentObject);
}

function submittedPuzzleKey(puzzleDate) {
  return `${submittedPuzzleStoragePrefix}${puzzleDate}`;
}

function hasSubmittedPuzzle(storage, puzzleDate, puzzleId) {
  try {
    return storage.getItem(submittedPuzzleKey(puzzleDate)) === puzzleId;
  } catch {
    return false;
  }
}

function rememberSubmittedPuzzle(storage, puzzleDate, puzzleId) {
  try {
    storage.setItem(submittedPuzzleKey(puzzleDate), puzzleId);
  } catch {
    // D1's unique constraint remains the final duplicate guard.
  }
}

async function requestJson(url, options = {}, fetchImpl = globalThis.fetch) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetchImpl(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...options.headers,
      },
    });
    if (!response.ok) throw new Error(`Community stats request failed (${response.status}).`);
    return await response.json();
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function fetchCommunityStats({ apiUrl, puzzleDate, fetchImpl }) {
  const url = new URL("/api/stats", apiUrl);
  url.searchParams.set("date", puzzleDate);
  return requestJson(url, {}, fetchImpl);
}

export async function submitCommunityAttempt({
  apiUrl,
  puzzleDate,
  puzzleId,
  mapId,
  mapName,
  isCorrect,
  storage = globalThis.localStorage,
  cryptoApi = globalThis.crypto,
  fetchImpl,
}) {
  if (hasSubmittedPuzzle(storage, puzzleDate, puzzleId)) return null;

  const playerId = getOrCreateAnonymousPlayerId(storage, cryptoApi);
  if (!playerId) return null;

  const stats = await requestJson(
    new URL("/api/attempts", apiUrl),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId,
        puzzleDate,
        puzzleId,
        mapId,
        mapName,
        isCorrect,
      }),
    },
    fetchImpl,
  );
  rememberSubmittedPuzzle(storage, puzzleDate, puzzleId);
  return stats;
}

export function formatCommunityCount(value) {
  return Number.isInteger(value) && value >= 0
    ? new Intl.NumberFormat().format(value)
    : "—";
}

export function formatSolvePercentage(value) {
  return Number.isInteger(value) && value >= 0 && value <= 100 ? `${value}%` : "—";
}
