import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import worker from "../worker/src/index.js";
import { ensureStagingFixtures, fixturesEnabled } from "../worker/src/staging-fixtures.js";
import { assertPromotion, classifyChanges, sourceFiles, sourceManifest } from "../scripts/lib/release-tools.mjs";
import { buildSite, configureHtml } from "../scripts/build-site.mjs";
import { assertSmoke } from "../scripts/release.mjs";
import gateway from "../scripts/lib/staging-gateway.mjs";
import { resetJwksCacheForTests } from "../worker/src/auth.js";
import { buildDailyPuzzle } from "../js/game-core.js";
import { buildDailyWordPuzzle } from "../js/word-puzzle-core.js";
import { getOfficialPuzzleType } from "../js/daily-challenge-core.js";
import { workerMaps } from "../worker/src/generated-map-catalog.js";
import { workerWords } from "../worker/src/generated-word-catalog.js";

// Real SQLite schema, triggers and SQL, behind the same small D1 interface.
async function database() {
  const sqlite = new DatabaseSync(":memory:");
  for (const name of (await readdir(new URL("../worker/migrations/", import.meta.url))).sort()) {
    if (name.endsWith(".sql")) sqlite.exec(await readFile(new URL(`../worker/migrations/${name}`, import.meta.url), "utf8"));
  }
  const db = {
    sqlite,
    prepare(sql) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async first(column) { const row = sqlite.prepare(sql).get(...values) || null; return column ? row?.[column] : row; },
        async all() {
          const statement = sqlite.prepare(sql);
          if (statement.columns().length) return { results: statement.all(...values) };
          const result = statement.run(...values);
          return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
        },
        async run() { const result = sqlite.prepare(sql).run(...values); return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }; },
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const result = [];
        for (const statement of statements) result.push(await statement.all());
        sqlite.exec("COMMIT");
        return result;
      } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
  return db;
}
const stagingEnv = (DB) => ({ DB, DEPLOYMENT_ENVIRONMENT: "staging", STAGING_FIXTURES: "1", SUPABASE_ISSUER: "https://zsnnvzhimtlhpvwhwxpy.supabase.co/auth/v1", ALLOWED_ORIGINS: "https://daily-undead-staging.pages.dev", RELEASE_API_DIGEST: "api-tested", RELEASE_CONFIG_DIGEST: "config-tested" });

test("fictional staging activity uses real SQL, remains idempotent and rolls over at UTC midnight", async () => {
  const db = await database();
  const env = stagingEnv(db);
  // An actual test account and its save must survive fixture refreshes untouched.
  db.sqlite.exec("INSERT INTO player_profiles (user_id,username,account_id) VALUES ('real-test-account','CharlieTest','acct_real_test'); INSERT INTO player_saves (user_id,score,current_round,best_round,revision) VALUES ('real-test-account',1234,9,12,7)");
  await ensureStagingFixtures(env, "2026-10-17");
  const initial = db.sqlite.prepare("SELECT total_games FROM community_totals").get().total_games;
  await ensureStagingFixtures(env, "2026-10-17");
  // A new isolate loses its memory cache; database uniqueness must still protect totals.
  await ensureStagingFixtures({ ...env, DB: { ...db } }, "2026-10-17");
  assert.equal(db.sqlite.prepare("SELECT total_games FROM community_totals").get().total_games, initial);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM puzzle_attempts WHERE puzzle_date = '2026-10-17'").get().count, 32);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM player_daily_results WHERE puzzle_date = '2026-10-17' AND puzzle_type = 'word'").get().count, 8);
  await ensureStagingFixtures(env, "2026-10-18");
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM player_daily_results WHERE puzzle_date = '2026-10-18' AND puzzle_type = 'easter'").get().count, 8);
  assert.equal(db.sqlite.prepare("SELECT total_games FROM community_totals").get().total_games, initial + 32);
  assert.deepEqual({ ...db.sqlite.prepare("SELECT score,current_round,best_round,revision FROM player_saves WHERE user_id='real-test-account'").get() }, { score: 1234, current_round: 9, best_round: 12, revision: 7 });
  db.sqlite.close();
});

test("staging is a complete database-backed service through production routes", async () => {
  const db = await database();
  const env = stagingEnv(db);
  const today = new Date().toISOString().slice(0, 10);
  const get = async (route) => {
    const response = await worker.fetch(new Request(`https://staging.test${route}`, { headers: { Origin: env.ALLOWED_ORIGINS } }), env);
    assert.equal(response.status, 200, route);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), env.ALLOWED_ORIGINS);
    return response.json();
  };
  const health = await get("/health");
  const stats = await get(`/api/stats?date=${today}`);
  const leaderboards = await get(`/api/leaderboards?date=${today}`);
  assertSmoke({ health, stats, leaderboards, manifest: { apiDigest: "api-tested", apiConfigurationDigest: "config-tested" } });
  assert.equal(stats.playersToday, 16);
  assert.equal(stats.yesterday.word.solvePercentage, 75);
  assert.equal(stats.yesterday.easter.solvePercentage, 75);
  const profile = await get("/api/profiles/DemoRichtofen");
  assert.equal(profile.profile.username, "DemoRichtofen");
  const account = await worker.fetch(new Request("https://staging.test/api/account"), env);
  assert.equal(account.status, 401);
  const badOrigin = await worker.fetch(new Request("https://staging.test/api/stats", { headers: { Origin: "https://thedailyundead.com" } }), env);
  assert.equal(badOrigin.status, 403);
  db.sqlite.close();
});

test("production and accidental production-auth configuration cannot enable staging fixtures", async () => {
  let touched = false;
  const DB = { prepare() { touched = true; throw new Error("must not write"); } };
  for (const env of [
    { ...stagingEnv(DB), DEPLOYMENT_ENVIRONMENT: "production" },
    { ...stagingEnv(DB), STAGING_FIXTURES: undefined },
    { ...stagingEnv(DB), SUPABASE_ISSUER: "https://bhqhfxwdcpujfxxvcoeo.supabase.co/auth/v1" },
  ]) { assert.equal(fixturesEnabled(env), false); await ensureStagingFixtures(env); }
  assert.equal(touched, false);
  const production = JSON.parse(await readFile(new URL("../worker/wrangler.jsonc", import.meta.url)));
  assert.equal(production.vars.STAGING_FIXTURES, undefined);
});

test("real account routes save profiles, verify puzzle rewards, reject stale saves and preserve cloud progress", async (t) => {
  const db = await database();
  const issuer = "https://workflow-tests.supabase.co/auth/v1";
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = { ...await crypto.subtle.exportKey("jwk", keys.publicKey), kid: "workflow-test", alg: "ES256" };
  const encoded = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const input = `${encoded({ alg: "ES256", kid: jwk.kid })}.${encoded({ iss: issuer, sub: "c6ca42ae-f94f-4f44-80d3-bd08d52fd724", aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 300 })}`;
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, new TextEncoder().encode(input));
  const token = `${input}.${Buffer.from(signature).toString("base64url")}`;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { assert.equal(url, `${issuer}/.well-known/jwks.json`); return Response.json({ keys: [jwk] }); };
  resetJwksCacheForTests();
  t.after(() => { globalThis.fetch = originalFetch; resetJwksCacheForTests(); db.sqlite.close(); });
  const today = new Date().toISOString().slice(0, 10);
  const request = async (route, method = "GET", body, status = 200) => {
    const result = await worker.fetch(new Request(`https://api.test${route}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }), { DB: db, SUPABASE_ISSUER: issuer });
    const data = await result.json();
    assert.equal(result.status, status, `${route}: ${JSON.stringify(data)}`);
    return data;
  };
  assert.equal((await request(`/api/account?date=${today}`)).needsOnboarding, true);
  await request("/api/account/register", "POST", { username: "WorkflowTester", puzzleDate: today, importLocalProgress: false }, 201);
  await request("/api/account/profile", "PUT", { avatarId: "richtofen", themeId: "default", favouriteGame: "Black Ops", favouriteMap: "Moon", bio: "Profile saved through the real API." });
  const profile = await worker.fetch(new Request("https://api.test/api/profiles/WorkflowTester"), { DB: db });
  assert.equal((await profile.json()).profile.bio, "Profile saved through the real API.");
  const type = getOfficialPuzzleType(today);
  const puzzle = type === "word" ? buildDailyWordPuzzle(today, workerWords) : buildDailyPuzzle(today, workerMaps);
  const route = type === "word" ? "/api/account/results/word" : "/api/account/results/map";
  const payload = type === "word"
    ? { puzzleDate: today, puzzleId: puzzle.key, guesses: [...new Set(puzzle.entry.answer.toUpperCase().match(/[A-Z]/g))] }
    : { puzzleDate: today, puzzleId: puzzle.key, selectedMapId: puzzle.map.id, cluesUsed: 1 };
  await request(route, "POST", payload);
  if (type === "easter") await request("/api/account/results/bonus", "POST", { puzzleDate: today, bonusOrder: puzzle.chronologicalSteps.map((step) => step.id) });
  const awarded = await request(route, "POST", payload);
  assert.equal(awarded.progress.score, 100);
  assert.equal(awarded.progress.solves, 1);
  const account = await request(`/api/account?date=${today}`);
  const saved = await request("/api/account/save", "PUT", { puzzleDate: today, baseRevision: account.progress.revision, progress: { ...account.progress, score: 99999, solves: 99999 } });
  assert.equal(saved.progress.score, 100);
  assert.equal(saved.progress.solves, 1);
  await request("/api/account/save", "PUT", { puzzleDate: today, baseRevision: account.progress.revision, progress: account.progress }, 409);
  assert.equal((await request(`/api/account?date=${today}`)).progress.score, 100);
});

test("staging gateway protects the app and exposes only release identity", async () => {
  const env = { STAGING_PASSWORD: "test-secret", ASSETS: { async fetch(request) { return new Response(new URL(request.url).pathname); } } };
  assert.equal((await gateway.fetch(new Request("https://staging.test/"), env)).status, 401);
  assert.equal((await gateway.fetch(new Request("https://staging.test/js/app.js"), env)).status, 401);
  assert.equal(await (await gateway.fetch(new Request("https://staging.test/.well-known/release.json"), env)).text(), "/release-manifest.json");
  assert.equal((await gateway.fetch(new Request("https://staging.test/", { headers: { Authorization: `Basic ${btoa("charlie:wrong")}` } }), env)).status, 401);
  assert.equal((await gateway.fetch(new Request("https://staging.test/", { headers: { Authorization: `Basic ${btoa("charlie:test-secret")}` } }), env)).status, 200);
});

test("promotion rejects partial candidates, API mismatches and missing live hotfixes", () => {
  const candidate = { commit: "approved", applicationDigest: "frontend", apiDigest: "backend" };
  const state = { candidate, staged: { ...candidate }, api: { apiDigest: "backend", environment: "staging" }, mainIsAncestor: true };
  assert.doesNotThrow(() => assertPromotion(state));
  assert.throws(() => assertPromotion({ ...state, staged: { ...candidate, commit: "different" } }), /commit differs/);
  assert.throws(() => assertPromotion({ ...state, staged: { ...candidate, applicationDigest: "partial" } }), /applicationDigest differs/);
  assert.throws(() => assertPromotion({ ...state, api: { apiDigest: "old" } }), /API does not match/);
  assert.throws(() => assertPromotion({ ...state, mainIsAncestor: false }), /changes missing/);
  assert.equal(classifyChanges(["marketing.html", "js/marketing-core.js"]), "marketing");
  assert.equal(classifyChanges(["marketing.html", "js/app.js"]), "application");
  assert.throws(() => assertSmoke({ health: { ok: true, accountProviders: { supabase: true }, apiDigest: "a", environment: "staging", fixturesEnabled: true }, stats: { playersToday: 0 }, leaderboards: {}, manifest: { apiDigest: "a" } }), /incomplete/);
});

test("reproducible releases exclude uncommitted files and use identical application assets", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "undead-release-"));
  const git = (...args) => execFileSync("git", args, { cwd: folder, encoding: "utf8" }).trim();
  try {
    git("init", "-q");
    await mkdir(path.join(folder, "config"));
    await mkdir(path.join(folder, "js"));
    await mkdir(path.join(folder, "worker"));
    await mkdir(path.join(folder, "scripts/lib"), { recursive: true });
    for (const name of ["worker/wrangler.jsonc", "worker/wrangler.staging.jsonc", "scripts/lib/staging-gateway.mjs"]) await writeFile(path.join(folder, name), await readFile(new URL(`../${name}`, import.meta.url)));
    await writeFile(path.join(folder, "config/environments.json"), await readFile(new URL("../config/environments.json", import.meta.url)));
    const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
    await writeFile(path.join(folder, "index.html"), html);
    await writeFile(path.join(folder, "release.json"), '{"build":"20261017-1"}');
    await writeFile(path.join(folder, "js/app.js"), "// approved app");
    git("add", ".");
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "Candidate");
    await writeFile(path.join(folder, "js/app.js"), "// uncommitted edit");
    await writeFile(path.join(folder, "js/private-draft.js"), "// untracked draft");
    const staging = await buildSite({ root: folder, environment: "staging" });
    const production = await buildSite({ root: folder, environment: "production" });
    assert.equal(staging.manifest.applicationDigest, production.manifest.applicationDigest);
    assert.equal(await readFile(path.join(staging.output, "js/app.js"), "utf8"), "// approved app");
    assert.deepEqual(await readdir(path.join(staging.output, "js")), ["app.js"]);
    assert.equal(await readFile(path.join(production.output, "index.html"), "utf8"), html);
    const stagedHtml = await readFile(path.join(staging.output, "index.html"), "utf8");
    assert.match(stagedHtml, /zsnnvzhimtlhpvwhwxpy\.supabase\.co/);
    assert.doesNotMatch(stagedHtml, /bhqhfxwdcpujfxxvcoeo\.supabase\.co/);
    assert.match(stagedHtml, /src="\.\/js\/app\.js/);
    assert.doesNotMatch(stagedHtml, /staging-demo\.js/);
    assert.equal(sourceManifest(await sourceFiles(folder, { ref: "HEAD" }), git("rev-parse", "HEAD")).applicationDigest, staging.manifest.applicationDigest);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
