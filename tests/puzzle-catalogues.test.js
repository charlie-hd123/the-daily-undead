import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { browserCatalogues, generateBrowserCatalogues } from "../scripts/generate-browser-catalogues.mjs";
import { loadPuzzleCatalogues } from "../js/puzzle-catalogues.js";
import { puzzleCatalogueUrls } from "../js/puzzle-catalogue-assets.js";
import { buildDailyPuzzle } from "../js/game-core.js";
import { buildDailyWordPuzzle } from "../js/word-puzzle-core.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (name) => JSON.parse(await readFile(path.join(root, name), "utf8"));
const packaged = async (url) => readJson(url.replace(/^\.\//, ""));

test("committed browser packages match every source field and immutable filename", async () => {
  for (const [name, content] of await browserCatalogues()) {
    assert.equal(await readFile(path.join(root, name), "utf8"), content,
      `${name} is stale; run generate:browser-catalogues and add the generated files`);
  }
  for (const name of await readdir(path.join(root, "data/catalogues"))) {
    const content = await readFile(path.join(root, "data/catalogues", name));
    assert.match(name, new RegExp(`\\.${createHash("sha256").update(content).digest("hex")}\\.json$`));
  }
  const { catalog, maps } = await packaged(puzzleCatalogueUrls.maps);
  assert.deepEqual(catalog, await readJson("data/maps/index.json"));
  assert.deepEqual(maps, await Promise.all(catalog.maps.map((name) => readJson(`data/maps/${name}`))));
  assert.deepEqual(await packaged(puzzleCatalogueUrls.words), await readJson("data/word-puzzle-demo.json"));
});

test("packaging preserves daily puzzle keys, clue ordering, answers and saved puzzle identities", async () => {
  const { maps } = await packaged(puzzleCatalogueUrls.maps);
  const catalog = await readJson("data/maps/index.json");
  const originalMaps = await Promise.all(catalog.maps.map((name) => readJson(`data/maps/${name}`)));
  const originalWords = (await readJson("data/word-puzzle-demo.json")).words;
  const words = (await packaged(puzzleCatalogueUrls.words)).words;
  const dates = new Set(["2026-10-12", "2026-10-13", "2026-10-16", "2026-10-17", "2026-10-18", "2026-12-31", "2027-01-01", "2028-02-29"]);
  for (let year = 2026; year <= 2029; year++) {
    for (let month = 1; month <= 12; month++) dates.add(`${year}-${String(month).padStart(2, "0")}-01`);
  }
  for (const entry of [...maps, ...words]) {
    if (entry.availableFrom >= "2026-01-01") dates.add(entry.availableFrom);
    if (entry.retiredFrom) dates.add(entry.retiredFrom);
  }
  const outcome = (build) => {
    try { return { puzzle: build() }; }
    catch (error) { return { error: error.message }; }
  };
  for (const date of dates) {
    for (const rotation of [0, 1]) {
      assert.deepEqual(outcome(() => buildDailyPuzzle(date, maps, rotation)),
        outcome(() => buildDailyPuzzle(date, originalMaps, rotation)), date);
    }
    assert.deepEqual(outcome(() => buildDailyWordPuzzle(date, words)),
      outcome(() => buildDailyWordPuzzle(date, originalWords)), date);
  }
});

test("data edits change only the affected URL and keep the previous package available", async (t) => {
  const folder = await mkdtemp(path.join(tmpdir(), "undead-catalogues-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  await mkdir(path.join(folder, "data/maps"), { recursive: true });
  await writeFile(path.join(folder, "data/maps/index.json"), JSON.stringify({ maps: ["test.json"], games: [] }));
  await writeFile(path.join(folder, "data/maps/test.json"), JSON.stringify({ id: "unchanged", steps: [] }));
  await writeFile(path.join(folder, "data/word-puzzle-demo.json"), JSON.stringify({ words: [{ answer: "Before" }] }));
  const before = await generateBrowserCatalogues(folder);
  await writeFile(path.join(folder, "data/word-puzzle-demo.json"), JSON.stringify({ words: [{ answer: "After" }] }));
  const after = await generateBrowserCatalogues(folder);
  assert.equal([...before.keys()].find((name) => name.startsWith("data/catalogues/maps.")),
    [...after.keys()].find((name) => name.startsWith("data/catalogues/maps.")));
  assert.notEqual([...before.keys()].find((name) => name.startsWith("data/catalogues/words.")),
    [...after.keys()].find((name) => name.startsWith("data/catalogues/words.")));
  for (const [name, content] of before) {
    if (name.endsWith(".json")) assert.equal(await readFile(path.join(folder, name), "utf8"), content);
  }
});

test("startup requests exactly two cacheable packages concurrently, without per-map fetches", async () => {
  const calls = [];
  const resolve = [];
  const pending = loadPuzzleCatalogues({ fetchImpl: (url, options) => {
    calls.push({ url, options });
    return new Promise((done) => resolve.push(async () => done(Response.json(await packaged(url)))));
  } });
  assert.equal(calls.length, 2, "both requests start without waiting on the other");
  assert.deepEqual(calls.map((call) => call.url), [puzzleCatalogueUrls.maps, puzzleCatalogueUrls.words]);
  assert.ok(calls.every((call) => call.options.cache === "force-cache"));
  await Promise.all(resolve.map((done) => done()));
  const loaded = await pending;
  assert.equal(loaded.maps.length, loaded.catalog.maps.length);
  assert.ok(loaded.wordBank.words.length > 0);
  assert.equal(calls.length, 2);
});

test("failed or incomplete packages cannot initialize a partial puzzle catalogue", async () => {
  await assert.rejects(loadPuzzleCatalogues({ fetchImpl: async () => new Response(null, { status: 404 }) }), /Could not load/);
  await assert.rejects(loadPuzzleCatalogues({ fetchImpl: async (url) => Response.json(
    url === puzzleCatalogueUrls.maps ? { catalog: { maps: ["missing.json"] }, maps: [] } : { words: [] },
  ) }), /incomplete/);
});
