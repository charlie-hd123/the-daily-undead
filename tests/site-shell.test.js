import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const projectRoot = new URL("../", import.meta.url);

async function readProjectFile(path) {
  return fs.readFile(new URL(path, projectRoot), "utf8");
}

test("the published page uses local fonts and privacy-safe external links", async () => {
  const [html, css] = await Promise.all([
    readProjectFile("index.html"),
    readProjectFile("styles.css"),
  ]);

  assert.doesNotMatch(html, /fonts\.(?:googleapis|gstatic)\.com/);
  assert.doesNotMatch(css, /fonts\.(?:googleapis|gstatic)\.com/);
  assert.match(
    html,
    /href="https:\/\/tally\.so\/r\/q4XeD7"[^>]*rel="noopener noreferrer"[^>]*referrerpolicy="no-referrer"/,
  );
  assert.match(html, /id="advance-dev-day"[^>]*hidden/);
});

test("the page's local release assets exist", async () => {
  const requiredFiles = [
    "assets/favicon.png",
    "assets/apple-touch-icon.png",
    "assets/zombie-logo.png",
    "assets/fonts/OFL.txt",
    "assets/fonts/barlow-400.ttf",
    "assets/fonts/barlow-500.ttf",
    "assets/fonts/barlow-600.ttf",
    "assets/fonts/barlow-700.ttf",
    "assets/fonts/barlow-800.ttf",
    "assets/fonts/barlow-condensed-600.ttf",
    "assets/fonts/barlow-condensed-700.ttf",
    "assets/fonts/barlow-condensed-800.ttf",
    "assets/fonts/barlow-condensed-900.ttf",
    "styles.css",
    "js/app.js",
    "js/game-core.js",
    "js/progression.js",
  ];

  await Promise.all(
    requiredFiles.map(async (path) => {
      const stats = await fs.stat(new URL(path, projectRoot));
      assert.equal(stats.isFile(), true, `${path} should exist`);
      assert.equal(stats.size > 0, true, `${path} should not be empty`);
    }),
  );
});

test("browser-loaded code and styles share the current cache version", async () => {
  const [html, app] = await Promise.all([
    readProjectFile("index.html"),
    readProjectFile("js/app.js"),
  ]);
  const versionTokens = [...`${html}\n${app}`.matchAll(/\?v=(\d{8}-\d+)/g)].map(
    (match) => match[1],
  );

  assert.equal(versionTokens.length >= 5, true);
  assert.deepEqual(new Set(versionTokens), new Set(["20260730-6"]));
});
