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
import { deleteAccount, isAccountRevoked, retryAuthDeletions } from "../worker/src/account-deletion.js";
import { retryAuthProfileSync, syncAuthProfile } from "../worker/src/auth-profile-sync.js";
import { getAccount, saveAccount, recordVerifiedMapResult, recordVerifiedWordResult, recordVerifiedBloodResult } from '../worker/src/accounts.js';
import { buildDailyBloodTiesPuzzle } from '../js/blood-ties-core.js';
import { prepareMissedDayProgress } from '../js/progression.js';

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

test("admin views identify legacy and new players, track renames, and cannot edit progress", async (t) => {
  const db = await database();
  t.after(() => db.sqlite.close());
  await ensureStagingFixtures(stagingEnv(db), "2026-10-17");
  const fixture = db.sqlite.prepare("SELECT * FROM admin_player_overview LIMIT 1").get();
  // Fictional/unlinked profiles are still visible; joins must not drop them.
  assert.equal(fixture.supabase_user_id, null);
  db.sqlite.prepare("INSERT INTO account_identities (provider,provider_subject,account_id) VALUES ('supabase','supabase-view-test',?),('clerk','user_legacy_view',?)").run(fixture.account_id, fixture.account_id);
  const linked = db.sqlite.prepare("SELECT * FROM admin_player_overview WHERE account_id=?").get(fixture.account_id);
  assert.equal(linked.supabase_user_id, "supabase-view-test");
  assert.equal(linked.clerk_user_id, "user_legacy_view");
  db.sqlite.prepare("INSERT OR IGNORE INTO player_daily_saves (user_id,puzzle_date,state_json) VALUES (?,'2026-10-17','{}')").run(fixture.user_id);
  for (const view of ["admin_player_results", "admin_player_daily_saves"]) {
    const row = db.sqlite.prepare(`SELECT * FROM ${view} WHERE account_id=? LIMIT 1`).get(fixture.account_id);
    assert.equal(row.username, fixture.username);
    assert.equal(row.supabase_user_id, "supabase-view-test");
  }
  db.sqlite.prepare("UPDATE player_profiles SET username='ViewRenamed' WHERE account_id=?").run(fixture.account_id);
  for (const view of ["admin_player_overview", "admin_player_results", "admin_player_daily_saves"]) {
    assert.equal(db.sqlite.prepare(`SELECT username FROM ${view} WHERE account_id=? LIMIT 1`).get(fixture.account_id).username, "ViewRenamed");
    assert.throws(() => db.sqlite.exec(`DELETE FROM ${view}`), /view/);
  }
  assert.equal(db.sqlite.prepare("SELECT score FROM player_saves WHERE user_id=?").get(fixture.user_id).score, linked.score);
});

test("Supabase username sync retries outages, catches concurrent renames and cascades on deletion", async (t) => {
  const db = await database();
  t.after(() => db.sqlite.close());
  db.sqlite.exec("INSERT INTO player_profiles (user_id,username,account_id) VALUES ('user_legacy_sync','BeforeSync','acct_sync'); INSERT INTO player_saves (user_id,score) VALUES ('user_legacy_sync',321); INSERT INTO account_identities (provider,provider_subject,account_id) VALUES ('supabase','supabase-sync-test','acct_sync')");
  const env = { ...stagingEnv(db), SUPABASE_HEARTBEAT_SECRET_KEY: "test-secret" };
  const calls = [];
  const fetchImpl = async (url, options) => {
    assert.equal(url, `${env.SUPABASE_ISSUER}/admin/users/supabase-sync-test`);
    assert.equal(options.method, "PUT");
    assert.equal(options.headers.apikey, "test-secret");
    calls.push(JSON.parse(options.body));
    if (calls.length === 1) return new Response(null, { status: 503 });
    if (calls.length === 2) db.sqlite.exec("UPDATE player_profiles SET username='AfterSync' WHERE account_id='acct_sync'");
    return Response.json({});
  };
  assert.equal(await syncAuthProfile(env, "supabase-sync-test", fetchImpl), false);
  assert.equal(db.sqlite.prepare("SELECT synced_username FROM auth_profile_sync").get().synced_username, null);
  await retryAuthProfileSync(env, fetchImpl);
  assert.equal(db.sqlite.prepare("SELECT synced_username FROM auth_profile_sync").get().synced_username, "BeforeSync");
  await retryAuthProfileSync(env, fetchImpl);
  assert.deepEqual(calls.at(-1), {
    app_metadata: { daily_undead_username: "AfterSync", daily_undead_account_id: "acct_sync" },
    user_metadata: { name: "AfterSync" },
  });
  await syncAuthProfile(env, "supabase-sync-test", fetchImpl);
  assert.equal(calls.length, 3, "unchanged account does not make another admin request");
  // Upgrade accounts that were already synced before the display-name change.
  db.sqlite.exec(await readFile(new URL("../worker/migrations/0014_refresh_auth_display_names.sql", import.meta.url), "utf8"));
  await retryAuthProfileSync(env, fetchImpl);
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.at(-1).user_metadata, { name: "AfterSync" });
  // Periodic refresh also repairs manual metadata edits or overlapping writes.
  db.sqlite.exec("UPDATE auth_profile_sync SET last_synced_at=datetime('now','-2 days')");
  await retryAuthProfileSync(env, fetchImpl);
  assert.equal(calls.length, 5);
  assert.equal(db.sqlite.prepare("SELECT score FROM player_saves").get().score, 321);
  db.sqlite.exec("DELETE FROM player_profiles WHERE account_id='acct_sync'");
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM auth_profile_sync").get().n, 0);
  await retryAuthProfileSync(env, fetchImpl);
  assert.equal(calls.length, 5, "deleted accounts are not sent back to Supabase");
});

test("metadata backfills are bounded and failed accounts do not starve remaining players", async (t) => {
  const db = await database();
  t.after(() => db.sqlite.close());
  for (let index = 0; index < 21; index++) {
    const id = String(index).padStart(2, "0");
    db.sqlite.prepare("INSERT INTO player_profiles (user_id,username,account_id) VALUES (?,?,?)").run(`user_${id}`, `Player${id}`, `acct_${id}`);
    db.sqlite.prepare("INSERT INTO account_identities (provider,provider_subject,account_id) VALUES ('supabase',?,?)").run(`subject-${id}`, `acct_${id}`);
  }
  const env = { ...stagingEnv(db), SUPABASE_SECRET_KEY: "test-secret" };
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return new Response(null, { status: url.endsWith('subject-00') ? 503 : 200 }); };
  await retryAuthProfileSync(env, fetchImpl);
  assert.equal(calls.length, 20);
  await retryAuthProfileSync(env, fetchImpl);
  assert.equal(calls.length, 22);
  assert.ok(calls[20].endsWith("subject-20"));
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM auth_profile_sync WHERE synced_username IS NOT NULL").get().n, 20);
});

test("local and unconfigured environments cannot mutate shared authentication metadata", async () => {
  const DB = { prepare() { throw new Error("must not touch database"); } };
  const fetchImpl = () => { throw new Error("must not contact Supabase"); };
  for (const env of [
    { ...stagingEnv(DB), DEPLOYMENT_ENVIRONMENT: "local", SUPABASE_SECRET_KEY: "secret" },
    { ...stagingEnv(DB), DEPLOYMENT_ENVIRONMENT: undefined, SUPABASE_SECRET_KEY: "secret" },
    stagingEnv(DB),
    { ...stagingEnv(DB), SUPABASE_ISSUER: undefined, SUPABASE_SECRET_KEY: "secret" },
  ]) {
    assert.equal(await syncAuthProfile(env, "subject", fetchImpl), false);
    await retryAuthProfileSync(env, fetchImpl);
  }
});

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
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM puzzle_attempts WHERE puzzle_date = '2026-10-17'").get().count, 48);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM player_daily_results WHERE puzzle_date = '2026-10-17' AND puzzle_type = 'word'").get().count, 8);
  await ensureStagingFixtures(env, "2026-10-18");
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM player_daily_results WHERE puzzle_date = '2026-10-18' AND puzzle_type = 'easter'").get().count, 8);
  assert.equal(db.sqlite.prepare("SELECT total_games FROM community_totals").get().total_games, initial + 48);
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

test("fixtures follow the balanced schedule across rollover without changing real account saves", async (t) => {
  const db = await database(); t.after(() => db.sqlite.close());
  const env = { ...stagingEnv(db), BLOOD_TIES_DEMO: '1' };
  db.sqlite.exec("INSERT INTO player_profiles (user_id,username,account_id) VALUES ('real-schedule-account','KeepSchedule','acct_keep_schedule'); INSERT INTO player_saves (user_id,score,current_round,best_round,revision) VALUES ('real-schedule-account',1234,9,12,7); INSERT INTO player_daily_saves (user_id,puzzle_date,state_json) VALUES ('real-schedule-account','2026-10-25','{\"officialType\":\"blood\",\"marker\":\"keep\"}')");
  const seen = new Set();
  for (let day = 0; day < 7; day += 1) {
    const date = new Date(Date.parse('2026-10-26T00:00:00Z') + day * 86400000).toISOString().slice(0, 10);
    await ensureStagingFixtures(env, date);
    const official = getOfficialPuzzleType(date, { bloodTies: true }); seen.add(official);
    const rows = db.sqlite.prepare("SELECT puzzle_type FROM player_daily_results WHERE user_id LIKE 'stage_demo_%' AND puzzle_date=?").all(date);
    assert.equal(rows.length, 8);
    assert.ok(rows.every((row) => row.puzzle_type === official), date);
    const before = db.sqlite.prepare('SELECT COUNT(*) n FROM player_daily_results').get().n;
    await ensureStagingFixtures({ ...env, DB: { ...db } }, date);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM player_daily_results').get().n, before);
  }
  assert.equal(seen.size, 3);
  assert.deepEqual({ ...db.sqlite.prepare("SELECT score,current_round,best_round,revision FROM player_saves WHERE user_id='real-schedule-account'").get() }, { score: 1234, current_round: 9, best_round: 12, revision: 7 });
  assert.equal(db.sqlite.prepare("SELECT state_json FROM player_daily_saves WHERE user_id='real-schedule-account'").get().state_json, '{"officialType":"blood","marker":"keep"}');
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
  const metadataUpdates = [];
  globalThis.fetch = async (url, options) => {
    if (options?.method === "PUT") {
      assert.equal(url, `${issuer}/admin/users/c6ca42ae-f94f-4f44-80d3-bd08d52fd724`);
      const metadata = JSON.parse(options.body);
      assert.equal(metadata.user_metadata.name, metadata.app_metadata.daily_undead_username);
      metadataUpdates.push(metadata.app_metadata);
      return Response.json({});
    }
    assert.equal(url, `${issuer}/.well-known/jwks.json`);
    return Response.json({ keys: [jwk] });
  };
  resetJwksCacheForTests();
  t.after(() => { globalThis.fetch = originalFetch; resetJwksCacheForTests(); db.sqlite.close(); });
  const today = new Date().toISOString().slice(0, 10);
  const request = async (route, method = "GET", body, status = 200) => {
    const pendingTasks = [];
    const result = await worker.fetch(new Request(`https://api.test${route}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }), { DB: db, SUPABASE_ISSUER: issuer, DEPLOYMENT_ENVIRONMENT: "staging", SUPABASE_SECRET_KEY: "test-secret" }, { waitUntil: (task) => pendingTasks.push(task) });
    await Promise.all(pendingTasks);
    const data = await result.json();
    assert.equal(result.status, status, `${route}: ${JSON.stringify(data)}`);
    return data;
  };
  assert.equal((await request(`/api/account?date=${today}`)).needsOnboarding, true);
  await request("/api/account/register", "POST", { username: "WorkflowTester", puzzleDate: today, importLocalProgress: false }, 201);
  assert.equal(metadataUpdates.at(-1).daily_undead_username, "WorkflowTester");
  assert.equal(metadataUpdates.at(-1).daily_undead_account_id, db.sqlite.prepare("SELECT account_id FROM player_profiles WHERE username='WorkflowTester'").get().account_id);
  await request("/api/account/username", "PUT", { username: "WorkflowRenamed" });
  assert.equal(metadataUpdates.at(-1).daily_undead_username, "WorkflowRenamed");
  await request("/api/account/username", "PUT", { username: "WorkflowTester" });
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
  const dailyState = { dayStateVersion: 1, dateKey: today, officialType: type, sessions: {} };
  const current = await request(`/api/account?date=${today}`);
  await request('/api/account/save', 'PUT', { puzzleDate: today, baseRevision: current.progress.revision, progress: current.progress, dailyState });
  const beforeConflict = await request(`/api/account?date=${today}`);
  await request('/api/account/save', 'PUT', { puzzleDate: today, baseRevision: current.progress.revision, progress: current.progress, dailyState: { ...dailyState, officialType: type === 'word' ? 'easter' : 'word' } }, 409);
  assert.deepEqual((await request(`/api/account?date=${today}`)).dailyState, beforeConflict.dailyState, 'rejected stale saves must not overwrite the current puzzle state');
  // Deletion must authenticate, validate confirmation, cascade all player data,
  // preserve other players, and reject even the original unexpired token.
  const deletionEnv = { DB: db, SUPABASE_ISSUER: issuer, SUPABASE_SECRET_KEY: "test-secret", DEPLOYMENT_ENVIRONMENT: "staging" };
  db.sqlite.exec("INSERT INTO player_profiles (user_id, username, account_id) VALUES ('other', 'KeepMe', 'acct_other'); INSERT INTO player_saves (user_id, score) VALUES ('other', 77)");
  const deleteRequest = (body, authorization = `Bearer ${token}`) => worker.fetch(new Request("https://api.test/api/account", { method: "DELETE", headers: { Authorization: authorization, "Content-Type": "application/json" }, body: JSON.stringify(body) }), deletionEnv);
  assert.equal((await deleteRequest({ confirmation: "DELETE" }, "")).status, 401);
  assert.equal((await deleteRequest({ confirmation: "wrong" })).status, 400);
  const profileId = db.sqlite.prepare("SELECT user_id FROM player_profiles WHERE username='WorkflowTester'").get().user_id;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, `${issuer}/admin/users/c6ca42ae-f94f-4f44-80d3-bd08d52fd724`);
    assert.equal(options.method, "DELETE");
    assert.equal(options.headers.apikey, "test-secret");
    return new Response(null, { status: 200 });
  };
  const deletion = await deleteRequest({ confirmation: "DELETE", userId: "other" });
  assert.equal(deletion.status, 200);
  assert.equal((await deletion.json()).deleted, true);
  for (const table of ["player_profiles", "player_saves", "player_daily_saves", "player_daily_results"]) {
    assert.equal(db.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id=?`).get(profileId).n, 0, table);
  }
  assert.equal(db.sqlite.prepare("SELECT score FROM player_saves WHERE user_id='other'").get().score, 77);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM account_deletion_jobs").get().n, 0);
  await request(`/api/account?date=${today}`, "GET", undefined, 401);
  await request("/api/account/register", "POST", { username: "ComeBack", puzzleDate: today }, 401);
  await request("/api/account/save", "PUT", { puzzleDate: today }, 401);
  assert.equal((await deleteRequest({ confirmation: "DELETE" })).status, 200);
});

test("deletion is atomic, revokes linked legacy identities, and durably retries auth outages", async (t) => {
  const db = await database();
  t.after(() => db.sqlite.close());
  db.sqlite.exec("INSERT INTO player_profiles (user_id,username,account_id) VALUES ('user_legacy','DeleteMe','acct_delete'); INSERT INTO player_saves (user_id, score) VALUES ('user_legacy',999); INSERT INTO account_identities (provider,provider_subject,account_id) VALUES ('clerk','user_legacy','acct_delete'),('supabase','test-subject','acct_delete')");
  const identity = { provider: "supabase", subject: "test-subject", userId: "user_legacy", accountId: "acct_delete" };
  const env = { DB: db, DEPLOYMENT_ENVIRONMENT: "staging", SUPABASE_ISSUER: "https://test.supabase.co/auth/v1", SUPABASE_HEARTBEAT_SECRET_KEY: "secret" };
  const req = () => new Request("https://test/api/account", { method: "DELETE", body: JSON.stringify({ confirmation: "DELETE" }) });
  assert.equal((await deleteAccount(req(), { ...env, DEPLOYMENT_ENVIRONMENT: "local" }, identity)).status, 409);
  assert.equal((await deleteAccount(req(), { ...env, SUPABASE_HEARTBEAT_SECRET_KEY: undefined }, identity)).status, 503);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM player_profiles").get().n, 1);
  // A transaction error must roll back revocation and the queued deletion too.
  db.sqlite.exec("CREATE TRIGGER fail_deletion BEFORE DELETE ON player_profiles BEGIN SELECT RAISE(ABORT,'test failure'); END");
  await assert.rejects(deleteAccount(req(), env, identity), /test failure/);
  assert.equal(await isAccountRevoked(db, identity), false);
  db.sqlite.exec("DROP TRIGGER fail_deletion");
  const result = await deleteAccount(req(), env, identity, async () => new Response(null, { status: 503 }));
  assert.equal(result.status, 202);
  assert.equal(await isAccountRevoked(db, identity), true);
  assert.equal(await isAccountRevoked(db, { provider: "clerk", subject: "user_legacy" }), true);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM player_profiles").get().n, 0);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM account_identities").get().n, 0);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM account_deletion_jobs").get().n, 1);
  db.sqlite.exec("INSERT INTO player_profiles (user_id,username,account_id) VALUES ('new','New','acct_new')");
  assert.throws(() => db.sqlite.prepare("INSERT INTO account_identities (provider,provider_subject,account_id) VALUES ('clerk','user_legacy','acct_new')").run(), /deleted/);
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(null, { status: 404 });
  await retryAuthDeletions(env);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM account_deletion_jobs").get().n, 0);
  assert.equal(await isAccountRevoked(db, identity), true);
});

test("staging gateway protects the app and exposes only release identity", async () => {
  const env = { STAGING_PASSWORD: "test-secret", ASSETS: { async fetch(request) { return new Response(new URL(request.url).pathname); } } };
  assert.equal((await gateway.fetch(new Request("https://staging.test/"), env)).status, 401);
  assert.equal((await gateway.fetch(new Request("https://staging.test/js/app.js"), env)).status, 401);
  assert.equal(await (await gateway.fetch(new Request("https://staging.test/.well-known/release.json"), env)).text(), "/release-manifest.json");
  assert.equal((await gateway.fetch(new Request("https://staging.test/", { headers: { Authorization: `Basic ${btoa("charlie:wrong")}` } }), env)).status, 401);
  assert.equal((await gateway.fetch(new Request("https://staging.test/", { headers: { Authorization: `Basic ${btoa("charlie:test-secret")}` } }), env)).status, 200);
});

test('staging caches only authenticated successful content-hashed audio privately', async () => {
  const audio = '/assets/audio/map-select-012345abcd.m4a';
  const authorization = `Basic ${btoa('charlie:test-secret')}`;
  let upstream = 0, status = 200, type = 'audio/mp4';
  const env = { STAGING_PASSWORD: 'test-secret', ASSETS: { async fetch(request) {
    upstream++;
    assert.equal(request.headers.has('Authorization'), false);
    return new Response(null, { status, headers: { 'Content-Type': type, ETag: 'audio-hash', Vary: 'Accept-Encoding' } });
  } } };
  const get = (path, method = 'GET') => gateway.fetch(new Request('https://staging.test' + path, { method, headers: { Authorization: authorization } }), env);
  for (const method of ['GET', 'HEAD']) {
    const response = await get(audio, method);
    assert.equal(response.headers.get('Cache-Control'), 'private, max-age=31536000, immutable');
    assert.equal(response.headers.get('Vary'), 'Accept-Encoding, Authorization');
    assert.equal(response.headers.get('ETag'), 'audio-hash');
  }
  assert.equal((await get(audio.replace('.m4a', '.wav'))).headers.get('Cache-Control'), 'private, max-age=31536000, immutable');
  for (const path of ['/','/release.json','/assets/audio/manifest.json','/assets/audio/library/index.html','/assets/audio/mutable.m4a','/api/account']) {
    assert.equal((await get(path)).headers.get('Cache-Control'), null);
  }
  status = 404; assert.equal((await get(audio)).headers.get('Cache-Control'), null);
  status = 200; type = 'text/html'; assert.equal((await get(audio)).headers.get('Cache-Control'), null, 'SPA error fallback must not become an immutable audio response');
  const before = upstream;
  const denied = await gateway.fetch(new Request('https://staging.test' + audio), env);
  assert.equal(denied.status, 401); assert.equal(denied.headers.get('Cache-Control'), 'no-store');
  assert.equal(upstream, before, 'cache policy never bypasses the staging password');
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
    assert.match(stagedHtml, /id="advance-dev-day"/);
    assert.match(stagedHtml, /id="return-dev-today"/);
    assert.doesNotMatch(await readFile(path.join(production.output, "index.html"), "utf8"), /advance-dev-day|return-dev-today|daily-undead-environment/);
    assert.equal(sourceManifest(await sourceFiles(folder, { ref: "HEAD" }), git("rev-parse", "HEAD")).applicationDigest, staging.manifest.applicationDigest);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('verified results atomically retain participation when the browser save never arrives', async (t) => {
  const db = await database(); t.after(() => db.sqlite.close());
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-27T12:00:00Z') });
  db.sqlite.exec("INSERT INTO player_profiles(user_id,username) VALUES ('sync-player','SyncPlayer'); INSERT INTO player_saves(user_id,current_round,best_round,last_played_date,round_anchor_date,round_anchor_value) VALUES ('sync-player',10,10,'2026-10-26','2026-10-26',10)");
  const request = (body) => new Request('https://test.invalid/result', { method: 'POST', body: JSON.stringify(body) });
  const options = { production: true, bloodTies: true };
  const map = buildDailyPuzzle('2026-10-27',workerMaps);
  const mapped = await recordVerifiedMapResult(db,request({puzzleDate:map.dateKey,puzzleId:map.key,selectedMapId:map.map.id,cluesUsed:1}),'sync-player',options);
  assert.equal(mapped.status,200); assert.equal(mapped.body.progress.lastPlayedDate,'2026-10-27');
  t.mock.timers.setTime(new Date('2026-10-29T12:00:00Z').getTime());
  const word = buildDailyWordPuzzle('2026-10-29',workerWords);
  const worded = await recordVerifiedWordResult(db,request({puzzleDate:'2026-10-29',puzzleId:word.key,guesses:[...new Set(word.entry.answer.toUpperCase().match(/[A-Z]/g))]}),'sync-player',options);
  assert.equal(worded.status,200); assert.equal(worded.body.progress.lastPlayedDate,'2026-10-29');
  t.mock.timers.setTime(new Date('2026-10-30T12:00:00Z').getTime());
  const blood = buildDailyBloodTiesPuzzle('2026-10-30',options);
  const attempts = blood.groups.map(g=>g.answers);
  const blooded = await recordVerifiedBloodResult(db,request({puzzleDate:'2026-10-30',puzzleId:blood.key,attempts,rulesVersion:3}),'sync-player',options);
  assert.equal(blooded.status,200); assert.equal(blooded.body.progress.lastPlayedDate,'2026-10-30');
  const staleSave = await saveAccount(db,request({progress:{currentRound:1,lastPlayedDate:'2026-10-29'},baseRevision:blooded.body.progress.revision}),'sync-player',options);
  assert.equal(staleSave.body.progress.lastPlayedDate,'2026-10-30','a subsequent stale browser date must not undo verified participation');
  const score = staleSave.body.progress.score;
  await recordVerifiedBloodResult(db,request({puzzleDate:'2026-10-30',puzzleId:blood.key,attempts,rulesVersion:3}),'sync-player',options);
  assert.equal(db.sqlite.prepare("SELECT score FROM player_saves WHERE user_id='sync-player'").get().score,score,'result retries cannot double-credit');
});

test('account read repairs a false missed day from verified history before the browser decides to end the run', async (t) => {
  const db=await database(); t.after(()=>db.sqlite.close());
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-31T12:00:00Z')});
  db.sqlite.exec(`INSERT INTO player_profiles(user_id,username) VALUES ('stale-date','StaleDate');
    INSERT INTO player_saves(user_id,current_round,best_round,score,total_rounds,last_played_date,round_anchor_date,round_anchor_value,missed_day_json)
    VALUES ('stale-date',1,77,7840,82,'2026-10-29','2026-10-26',73,'{"dateKey":"2026-10-31","missedDays":1,"roundsBeforeLoss":77,"resolved":false}');`);
  const insert=db.sqlite.prepare(`INSERT INTO player_daily_results(user_id,puzzle_date,puzzle_id,selected_map_id,clues_used,map_correct,map_points,points_earned,score_awarded,progression_applied)
    VALUES ('stale-date',?,'history','map',1,1,50,50,50,1)`);
  for(const date of ['2026-10-27','2026-10-28','2026-10-29','2026-10-30'])insert.run(date);
  const account=(await getAccount(db,'stale-date','2026-10-31')).body;
  assert.equal(account.progress.currentRound,77); assert.equal(account.progress.lastPlayedDate,'2026-10-30');
  assert.equal(account.progress.score,7840); assert.equal(account.progress.solves,82);
  const missed=prepareMissedDayProgress({savedState:account.progress.missedDayState,lastPlayedDate:account.progress.lastPlayedDate,dateKey:'2026-10-31',currentRound:account.progress.currentRound,score:account.progress.score});
  assert.equal(missed.missedDayState,null); assert.equal(missed.currentRound,77);
});

test('yesterday’s on-time cloud evidence recovers after midnight without allowing historical client submissions', async (t) => {
  const db=await database(); t.after(()=>db.sqlite.close());
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-30T12:00:00Z')});
  const date='2026-10-29', puzzle=buildDailyWordPuzzle(date,workerWords), guesses=[...new Set(puzzle.entry.answer.toUpperCase().match(/[A-Z]/g))];
  db.sqlite.exec("INSERT INTO player_profiles(user_id,username) VALUES ('recover','Recover'),('late','Late'); INSERT INTO player_saves(user_id,score,last_played_date,round_anchor_date,round_anchor_value) VALUES ('recover',500,'2026-10-28','2026-10-28',9),('late',500,'2026-10-28','2026-10-28',9)");
  const state={dayStateVersion:1,dateKey:date,officialType:'word',officialCompleted:true,sessions:{word:{key:puzzle.key,guesses,complete:true,success:true,points:999999}}};
  const insert=db.sqlite.prepare('INSERT INTO player_daily_saves(user_id,puzzle_date,state_json,updated_at) VALUES (?,?,?,?)');
  insert.run('recover',date,JSON.stringify(state),'2026-10-29 23:59:59');
  insert.run('late',date,JSON.stringify(state),'2026-10-30 00:00:01');
  const options={production:true,bloodTies:true};
  const recovered=(await getAccount(db,'recover','2026-10-30',date,options)).body;
  assert.equal(recovered.progress.score,600); assert.equal(recovered.progress.solves,1); assert.equal(recovered.progress.currentRound,10); assert.equal(recovered.progress.lastPlayedDate,date);
  assert.equal(recovered.pendingDailyState.dateKey,date);
  assert.equal((await getAccount(db,'recover','2026-10-30',date,options)).body.progress.score,600);
  assert.equal((await getAccount(db,'late','2026-10-30',date,options)).body.progress.score,500,'backdated evidence arriving after the day cannot earn historical credit');
  const response=await recordVerifiedWordResult(db,new Request('https://test.invalid/result',{method:'POST',body:JSON.stringify({puzzleDate:date,puzzleId:puzzle.key,guesses})}),'late',options);
  assert.equal(response.status,400);
});

test('recovery verifies map bonuses, Blood Ties attempts and failures, and leaves imported opening totals alone', async (t) => {
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-28T12:00:00Z')});
  const options={production:true,bloodTies:true};
  for(const type of ['easter','blood','word']) {
    const db=await database();
    try {
      const date={easter:'2026-10-27',blood:'2026-10-30',word:'2026-10-29'}[type];
      const next=new Date(Date.parse(date+'T12:00:00Z')+86400000);
      t.mock.timers.setTime(next.getTime());
      db.sqlite.exec("INSERT INTO player_profiles(user_id,username) VALUES ('recovery-case','RecoveryCase'); INSERT INTO player_saves(user_id,score,round_anchor_date,round_anchor_value) VALUES ('recovery-case',500,'2026-10-26',9)");
      let session;
      if(type==='easter'){
        const puzzle=buildDailyPuzzle(date,workerMaps);
        session={puzzleKey:puzzle.key,phase:'result',selectedMapId:puzzle.map.id,lockedClues:1,isCorrect:true,bonusComplete:true,bonusOrder:puzzle.chronologicalSteps.map(s=>s.id)};
      }else if(type==='blood'){
        const puzzle=buildDailyBloodTiesPuzzle(date,options);
        session={key:puzzle.key,complete:true,attempts:puzzle.groups.map(g=>g.answers),rulesVersion:3,points:9999};
      }else{
        const puzzle=buildDailyWordPuzzle(date,workerWords);
        session={key:puzzle.key,complete:true,guesses:[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].filter(l=>!puzzle.entry.answer.toUpperCase().includes(l)).slice(0,5),points:9999,success:true};
      }
      const state={dayStateVersion:1,dateKey:date,officialType:type,officialCompleted:true,sessions:{[type]:session}};
      db.sqlite.prepare('INSERT INTO player_daily_saves(user_id,puzzle_date,state_json,updated_at) VALUES (?,?,?,?)').run('recovery-case',date,JSON.stringify(state),date+' 22:00:00');
      const expected=type==='word'?500:600;
      assert.equal((await getAccount(db,'recovery-case',next.toISOString().slice(0,10),date,options)).body.progress.score,expected,type);
      assert.equal((await getAccount(db,'recovery-case',next.toISOString().slice(0,10),date,options)).body.progress.score,expected,'retry '+type);
      assert.equal(db.sqlite.prepare("SELECT map_correct FROM player_daily_results WHERE user_id='recovery-case'").get().map_correct,type==='word'?0:1);
      db.sqlite.exec("DELETE FROM player_daily_results; UPDATE player_saves SET score=500,total_rounds=1,score_migration_method='guest-local-import',round_anchor_date='"+date+"'");
      assert.equal((await getAccount(db,'recovery-case',next.toISOString().slice(0,10),date,options)).body.progress.score,500,'imported result already contributes to the opening total');
    } finally { db.sqlite.close(); }
  }
});
