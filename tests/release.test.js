import test from "node:test";
import assert from "node:assert/strict";

import {
  buildUpdateUrl,
  createReleaseMonitor,
  normalizeBuildVersion,
} from "../js/release.js";

test("release build versions use the cache-version format", () => {
  assert.equal(normalizeBuildVersion("20261013-5"), "20261013-5");
  assert.equal(normalizeBuildVersion(" 20261013-5 "), "20261013-5");
  assert.equal(normalizeBuildVersion("latest"), null);
  assert.equal(normalizeBuildVersion(null), null);
});

test("update URLs preserve the page state parameters and add a build cache buster", () => {
  const url = buildUpdateUrl(
    "https://thedailyundead.com/?date=2026-10-13#puzzle",
    "20261013-5",
  );

  assert.equal(url.searchParams.get("date"), "2026-10-13");
  assert.equal(url.searchParams.get("releaseBuild"), "20261013-5");
  assert.equal(url.hash, "#puzzle");
});

test("the release monitor preserves state before replacing an outdated page", async () => {
  const calls = [];
  const savedSessionValues = new Map();
  let preserved = false;
  let replacement = null;
  const monitor = createReleaseMonitor({
    currentBuild: "20261013-4",
    currentUrl: "https://thedailyundead.com/",
    now: () => 12345,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, async json() { return { build: "20261013-5" }; } };
    },
    sessionStorageObject: {
      getItem(key) { return savedSessionValues.get(key) || null; },
      setItem(key, value) { savedSessionValues.set(key, value); },
    },
    beforeReload() { preserved = true; },
    locationObject: {
      replace(url) {
        assert.equal(preserved, true);
        replacement = url;
      },
    },
  });

  assert.equal(await monitor.check({ force: true }), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.cache, "no-store");
  assert.match(calls[0].url, /release\.json\?check=12345$/);
  assert.equal(new URL(replacement).searchParams.get("releaseBuild"), "20261013-5");
});

test("the release monitor does not reload a matching build or repeat an attempted build", async () => {
  let replacements = 0;
  const matchingMonitor = createReleaseMonitor({
    currentBuild: "20261013-5",
    currentUrl: "https://thedailyundead.com/",
    fetchImpl: async () => ({
      ok: true,
      async json() { return { build: "20261013-5" }; },
    }),
    locationObject: { replace() { replacements += 1; } },
  });
  assert.equal(await matchingMonitor.check({ force: true }), false);

  const guardedMonitor = createReleaseMonitor({
    currentBuild: "20261013-4",
    currentUrl: "https://thedailyundead.com/?releaseBuild=20261013-5",
    fetchImpl: async () => ({
      ok: true,
      async json() { return { build: "20261013-5" }; },
    }),
    locationObject: { replace() { replacements += 1; } },
  });
  assert.equal(await guardedMonitor.check({ force: true }), false);
  assert.equal(replacements, 0);
});
