import { fetchWithTimeout } from "./network.js?v=20261022-2";

const buildVersionPattern = /^\d{8}-\d+$/;

export const RELEASE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

export function normalizeBuildVersion(value) {
  const build = typeof value === "string" ? value.trim() : "";
  return buildVersionPattern.test(build) ? build : null;
}

export function readCurrentBuild(documentObject = globalThis.document) {
  return normalizeBuildVersion(
    documentObject
      ?.querySelector('meta[name="daily-undead-build"]')
      ?.content,
  );
}

export function buildUpdateUrl(currentUrl, build) {
  const url = new URL(currentUrl);
  url.searchParams.set("releaseBuild", build);
  return url;
}

export function createReleaseMonitor({
  currentBuild,
  currentUrl,
  fetchImpl = globalThis.fetch,
  locationObject = globalThis.location,
  sessionStorageObject = globalThis.sessionStorage,
  beforeReload = () => {},
  now = () => Date.now(),
  intervalMs = RELEASE_CHECK_INTERVAL_MS,
  timeoutMs = 5_000,
} = {}) {
  let lastCheckedAt = 0;
  let pendingCheck = null;

  async function runCheck({ force = false } = {}) {
    const checkedAt = now();
    if (!force && lastCheckedAt && checkedAt - lastCheckedAt < intervalMs) return false;
    if (pendingCheck) return pendingCheck;
    lastCheckedAt = checkedAt;

    pendingCheck = (async () => {
      try {
        const manifestUrl = new URL("./release.json", currentUrl);
        manifestUrl.searchParams.set("check", String(checkedAt));
        const response = await fetchWithTimeout(
          manifestUrl.href,
          {
            cache: "no-store",
            headers: { Accept: "application/json" },
          },
          { fetchImpl, timeoutMs },
        );
        if (!response.ok) return false;

        const nextBuild = normalizeBuildVersion((await response.json())?.build);
        if (!nextBuild || !currentBuild || nextBuild === currentBuild) return false;

        const updateUrl = buildUpdateUrl(currentUrl, nextBuild);
        // The query parameter is a storage-independent loop guard. If an edge
        // cache still serves the old app once, the page will not reload forever.
        if (new URL(currentUrl).searchParams.get("releaseBuild") === nextBuild) return false;

        const attemptKey = `the-daily-undead:release-attempt:${nextBuild}`;
        try {
          if (sessionStorageObject?.getItem(attemptKey) === "1") return false;
          sessionStorageObject?.setItem(attemptKey, "1");
        } catch {
          // The URL guard above still prevents a loop when session storage is unavailable.
        }

        await beforeReload();
        locationObject.replace(updateUrl.href);
        return true;
      } catch {
        // Updates are best-effort; a network failure must never interrupt play.
        return false;
      }
    })();

    try {
      return await pendingCheck;
    } finally {
      pendingCheck = null;
    }
  }

  return { check: runCheck };
}
