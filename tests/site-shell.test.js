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
  assert.match(html, /id="advance-dev-day"[^>]*>ADVANCE A DAY<\/button>/);
  assert.match(
    html,
    /trademarks of their respective owners\.[\s\S]*id="advance-dev-day"[\s\S]*<\/p>/,
  );
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
    "js/community-stats.js",
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
  assert.deepEqual(new Set(versionTokens), new Set(["20260813-5"]));
});

test("mobile community statistics center each row and allow long labels to wrap", async () => {
  const css = await readProjectFile("styles.css");

  assert.match(
    css,
    /@media \(max-width: 35rem\)[\s\S]*?\.community-stat \{\s*justify-content: center;/,
  );
  assert.match(
    css,
    /\.community-stat > span \{\s*min-width: 0;\s*overflow-wrap: anywhere;/,
  );
  assert.match(
    css,
    /@media \(max-width: 35rem\)[\s\S]*?\.community-stat strong \{\s*min-width: 0;/,
  );
});

test("hover highlights are limited to precise pointers", async () => {
  const css = await readProjectFile("styles.css");

  assert.match(
    css,
    /@media \(hover: hover\) and \(pointer: fine\) \{\s*\.button:hover,\s*\.card-button:hover,\s*\.order-choice:hover/,
  );
});

test("the clue count stays editable until a map is confirmed", async () => {
  const app = await readProjectFile("js/app.js");

  assert.match(app, /id="back-to-clues"[^>]*>Back to clues<\/button>/);
  assert.match(app, /setState\(\{ phase: "clues", selectedGameId: null, selectedMapId: null \}\)/);
  assert.match(app, /setState\(\{ phase: "game", lockedClues: null \}\)/);
  assert.match(
    app.match(/function renderMapSelection\(\)[\s\S]*?\n}\n/)[0],
    /lockedClues: state\.cluesRevealed/,
  );
  assert.doesNotMatch(app, /phase: "clue-review"/);
});

test("community statistics are placed near the bottom and contain no frontend credentials", async () => {
  const [html, app, workerConfig] = await Promise.all([
    readProjectFile("index.html"),
    readProjectFile("js/app.js"),
    readProjectFile("worker/wrangler.jsonc"),
  ]);

  assert.match(
    html,
    /<\/main>[\s\S]*class="community-stats"[\s\S]*class="site-footer"/,
  );
  assert.match(html, /id="community-players-today"/);
  assert.match(html, /id="community-games-total"/);
  assert.match(html, /id="community-yesterday-solved"/);
  assert.match(app, /recordCommunityAttempt\(isCorrect\)/);
  assert.doesNotMatch(`${html}\n${app}`, /(?:api[_-]?token|account[_-]?token|database[_-]?id)/i);
  assert.match(workerConfig, /"binding": "DB"/);
});
