import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSite, projectRoot as root } from "./build-site.mjs";
import { assertClean, assertPromotion, classifyChanges, commitFor, digest, git, isAncestor, isWebsiteFile, saveJson, sourceFiles, trackedFiles } from "./lib/release-tools.mjs";

function run(command, args, cwd = root) {
  return execFileSync(command, args, { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}
function wrangler(args) {
  const cli = process.env.WRANGLER_CLI || path.join(root, "node_modules/wrangler/bin/wrangler.js");
  return run(process.execPath, [cli, ...args]);
}
function jsonUrl(url) {
  return JSON.parse(run("curl", ["--fail-with-body", "--silent", "--show-error", "--max-time", "20", "-H", "Cache-Control: no-cache", url]));
}
const readJson = async (name) => JSON.parse(await readFile(name, "utf8"));
function optionalCommit(ref) {
  try { return commitFor(root, ref); } catch { return null; }
}
function syncReferences() { git(root, "fetch", "origin"); }
function ensureCurrentStaging() {
  assertClean(root);
  if (git(root, "branch", "--show-current") !== "staging") throw new Error("Use the persistent staging branch before releasing.");
  syncReferences();
  const head = commitFor(root);
  if (!isAncestor(root, "origin/main", head)) throw new Error("Incorporate the latest origin/main into staging before deploying; preserve all pending staging changes.");
  const remoteStaging = optionalCommit("origin/staging");
  if (remoteStaging && !isAncestor(root, remoteStaging, head)) throw new Error("Local staging is behind or differs from GitHub staging. Sync it without discarding work first.");
  return head;
}

async function snapshot(sha) {
  const folder = path.join(root, ".release-work", sha);
  await mkdir(folder, { recursive: true });
  const archive = execFileSync("git", ["archive", sha], { cwd: root, maxBuffer: 128 * 1024 * 1024 });
  const result = spawnSync("tar", ["-x", "-C", folder], { input: archive, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || "Could not extract the committed release.");
  return folder;
}

async function testedBuild(sha) {
  const folder = await snapshot(sha);
  const receiptFile = path.join(root, ".releases", "tests", `${sha}.json`);
  let receipt;
  try { receipt = await readJson(receiptFile); } catch { /* first check of this commit */ }
  if (!receipt || receipt.node !== process.version) {
    console.log(`Testing committed candidate ${sha.slice(0, 12)}…`);
    const tests = (await readdir(path.join(folder, "tests"))).filter((name) => name.endsWith(".test.js")).map((name) => `tests/${name}`);
    let output;
    try { output = run(process.execPath, ["--test", "--test-reporter=dot", ...tests], folder); }
    catch (error) {
      const log = `${error.stdout || ""}\n${error.stderr || ""}`;
      const filename = path.join(root, ".releases/logs", `${sha}-tests.log`);
      await mkdir(path.dirname(filename), { recursive: true });
      await writeFile(filename, log);
      throw new Error(`Candidate tests failed. Full log: ${filename}\n${log.slice(-2500)}`);
    }
    receipt = { commit: sha, node: process.version, passedAt: new Date().toISOString(), output: output.trim() };
    await saveJson(receiptFile, receipt);
  } else console.log(`Reusing passing automated checks for unchanged commit ${sha.slice(0, 12)}.`);
  const staging = await buildSite({ ref: sha, environment: "staging" });
  const production = await buildSite({ ref: sha, environment: "production" });
  if (staging.manifest.applicationDigest !== production.manifest.applicationDigest || staging.manifest.apiDigest !== production.manifest.apiDigest) throw new Error("Staging/production source parity failed.");
  const changed = git(root, "diff", "--name-only", "origin/main", sha).split("\n").filter(Boolean);
  console.log(`Parity passed. Review scope: ${classifyChanges(changed)}. ${changed.length} files differ from live.`);
  return { folder, staging, production, receipt, changed };
}

async function workerConfig(environment, build) {
  const config = await readJson(path.join(build.folder, build.staging.config.workerConfig.replace("wrangler.staging", environment === "production" ? "wrangler" : "wrangler.staging")));
  config.main = path.join(build.folder, "worker/src/index.js");
  for (const database of config.d1_databases) database.migrations_dir = path.join(build.folder, "worker/migrations");
  config.vars = { ...config.vars, DEPLOYMENT_ENVIRONMENT: environment, RELEASE_COMMIT: build.staging.manifest.commit, RELEASE_API_DIGEST: build.staging.manifest.apiDigest, RELEASE_CONFIG_DIGEST: environment === "staging" ? build.staging.manifest.apiConfigurationDigest : build.production.manifest.apiConfigurationDigest };
  if (environment === "production") delete config.vars.STAGING_FIXTURES;
  const target = path.join(root, ".release-work", build.staging.manifest.commit, `deploy-${environment}.json`);
  await saveJson(target, config);
  return target;
}

export function assertSmoke({ health, stats, leaderboards, manifest }) {
  if (!health.ok || !health.accountProviders?.supabase || health.apiDigest !== manifest.apiDigest || health.configurationDigest !== manifest.apiConfigurationDigest) throw new Error("API health, authentication configuration or API version check failed.");
  if (health.environment !== "staging" || !health.fixturesEnabled) throw new Error("Staging isolation or test-data configuration check failed.");
  if (!(stats.playersToday > 0) || !stats.yesterday?.word?.attempts || !stats.yesterday?.easter?.attempts || !leaderboards.today?.elite?.length || !leaderboards.allTime?.length) throw new Error("Staging is incomplete: current statistics or leaderboards are empty.");
}

async function smoke(staging) {
  const today = new Date().toISOString().slice(0, 10);
  const base = staging.config.apiUrl;
  const health = jsonUrl(`${base}/health`);
  const stats = jsonUrl(`${base}/api/stats?date=${today}`);
  const leaderboards = jsonUrl(`${base}/api/leaderboards?date=${today}`);
  assertSmoke({ health, stats, leaderboards, manifest: staging.manifest });
  const profile = jsonUrl(`${base}/api/profiles/${encodeURIComponent(leaderboards.allTime[0].username)}`);
  if (!profile.username && !profile.profile?.username) throw new Error("Staging public profile check failed.");
  const response = run("curl", ["--silent", "--output", "/dev/null", "--write-out", "%{http_code}", "--max-time", "15", `${base}/api/account?date=${today}`]);
  if (response !== "401") throw new Error("Unauthenticated account requests must remain protected.");
  const staged = jsonUrl(`${staging.config.siteUrl}/.well-known/release.json`);
  assertPromotion({ candidate: staging.manifest, staged, api: health, mainIsAncestor: true });
  console.log("Staging smoke passed: matching website/API, current stats, both puzzle statistics, leaderboards, profiles and account protection.");
  return { health, checkedAt: new Date().toISOString() };
}

async function stage() {
  const sha = ensureCurrentStaging();
  const build = await testedBuild(sha);
  const config = await workerConfig("staging", build);
  console.log("Applying pending staging schema migrations…");
  wrangler(["d1", "migrations", "apply", "daily-undead-staging", "--remote", "--config", config]);
  console.log("Deploying the matching staging API…");
  let currentHealth;
  try { currentHealth = jsonUrl(`${build.staging.config.apiUrl}/health`); } catch { /* first deployment */ }
  if (currentHealth?.apiDigest !== build.staging.manifest.apiDigest || currentHealth?.configurationDigest !== build.staging.manifest.apiConfigurationDigest) wrangler(["deploy", "--config", config]);
  else console.log("API code/configuration is unchanged; keeping the already verified deployment.");
  git(root, "push", "--set-upstream", "origin", `${sha}:refs/heads/staging`);
  console.log("Publishing the complete staging website…");
  const result = wrangler(["pages", "deploy", build.staging.output, "--project-name", build.staging.config.pagesProject, "--branch", "staging", "--commit-hash", sha, "--commit-dirty=false"]);
  const checks = await smoke(build.staging);
  await saveJson(path.join(root, ".releases/staging.json"), { ...build.staging.manifest, baseProductionCommit: commitFor(root, "origin/main"), checks, deploymentOutput: result.trim() });
  console.log(`Ready to review: ${build.staging.config.siteUrl}\nCandidate: ${sha}\nProduction main is unchanged.`);
}

async function status() {
  syncReferences();
  const main = commitFor(root, "origin/main");
  const staging = optionalCommit("origin/staging");
  console.log(`Live source: ${main}\nStaging source: ${staging || "not created"}\nLocal branch: ${git(root, "branch", "--show-current")} ${commitFor(root)}\nTracked local edits: ${git(root, "status", "--porcelain", "--untracked-files=no") ? "yes" : "none"}`);
  if (staging) {
    console.log(`\nPending releases:\n${git(root, "log", "--reverse", "--oneline", `${main}..${staging}`) || "none"}`);
    if (!isAncestor(root, main, staging)) console.log("ACTION: staging must incorporate live hotfixes before promotion.");
  }
  const environments = await readJson(path.join(root, "config/environments.json"));
  try {
    const deployed = jsonUrl(`${environments.staging.siteUrl}/.well-known/release.json`);
    console.log(`\nActually deployed on staging: ${deployed.commit}`);
    if (staging !== deployed.commit) console.log("GitHub staging and the hosted website differ: finish the staging deployment before approval.");
  } catch { console.log("Hosted release identity unavailable; do not assume GitHub staging has finished deploying."); }
}

async function sync() {
  assertClean(root);
  syncReferences();
  const current = git(root, "branch", "--show-current");
  if (current !== "staging") throw new Error("Switch to staging first. This command never switches or discards unrelated work.");
  const remote = optionalCommit("origin/staging");
  if (remote) git(root, "merge", "--ff-only", remote);
  if (isAncestor(root, "HEAD", "origin/main")) git(root, "merge", "--ff-only", "origin/main");
  else if (!isAncestor(root, "origin/main", "HEAD")) throw new Error("Live has diverged. Merge origin/main into staging, resolve and review any conflicts; no work has been discarded.");
  console.log(`Local staging is current: ${commitFor(root)}. Pending staging changes preserved.`);
}

async function prepare() {
  if (git(root, "branch", "--show-current") !== "staging") throw new Error("Prepare changes on staging.");
  const changed = git(root, "diff", "HEAD", "--name-only").split("\n").filter(Boolean);
  const gameChanged = changed.some((name) => /^(index\.html|styles\.css|staging-demo\.css|js\/(?!marketing|vendor\/))/.test(name));
  const marketingChanged = changed.some((name) => /^(marketing\.|js\/marketing)/.test(name));
  if (!gameChanged && !marketingChanged) { console.log("No browser cache update required."); return; }
  const current = await readJson(path.join(root, "release.json"));
  const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const existing = [current.build, ...(await readFile(path.join(root, "marketing.html"), "utf8")).matchAll(/\?v=(\d{8}-\d+)/g)].map((value) => typeof value === "string" ? value : value[1]);
  const next = `${today}-${Math.max(0, ...existing.filter((version) => version.startsWith(`${today}-`)).map((version) => Number(version.split("-")[1]))) + 1}`;
  for (const name of trackedFiles(root)) {
    if (!/\.(html|js|css)$/.test(name) || name.startsWith("js/vendor/")) continue;
    if (gameChanged ? !(/^(js\/|index\.html|marketing\.html|styles\.css|staging-demo\.css)/.test(name)) : !["marketing.html", "js/marketing.js"].includes(name)) continue;
    const filename = path.join(root, name);
    let content = await readFile(filename, "utf8");
    content = content.replace(/\?v=\d{8}-\d+/g, `?v=${next}`);
    if (name === "index.html") content = content.replace(/(name="daily-undead-build" content=")[^"]+/, `$1${next}`);
    await writeFile(filename, content);
  }
  if (gameChanged) await saveJson(path.join(root, "release.json"), { ...current, build: next });
  console.log(`Updated ${gameChanged ? "application" : "marketing"} asset versions to ${next}. Review and commit before staging.`);
}

async function promote(approved) {
  if (!/^[a-f0-9]{40}$/.test(approved || "")) throw new Error("Provide the exact approved commit: release:promote -- <40-character commit>. This command publishes production.");
  const sha = ensureCurrentStaging();
  if (sha !== approved || commitFor(root, "origin/staging") !== approved) throw new Error("Local, GitHub staging and the approved commit must match.");
  const build = await testedBuild(sha);
  const checks = await smoke(build.staging);
  const staged = jsonUrl(`${build.staging.config.siteUrl}/.well-known/release.json`);
  assertPromotion({ candidate: build.staging.manifest, staged, api: checks.health, mainIsAncestor: isAncestor(root, "origin/main", sha) });
  const previous = commitFor(root, "origin/main");
  const config = await workerConfig("production", build);
  const applied = JSON.parse(wrangler(["d1", "execute", "daily-undead-stats", "--remote", "--config", config, "--command", "SELECT name FROM d1_migrations ORDER BY name", "--json"]));
  const names = new Set(applied.flatMap((result) => result.results || []).map((row) => row.name));
  if (build.staging.manifest.migrations.some(({ name }) => !names.has(name))) throw new Error("Production has unapplied migrations. Review and explicitly apply those migrations before promotion; this command never changes production player data.");
  const migrationChanges = git(root, "diff", "--name-status", previous, sha, "--", "worker/migrations");
  if (migrationChanges.split("\n").some((line) => /^[MD]\s/.test(line))) throw new Error("Existing production migrations were modified. Restore them and use additive reviewed migrations.");
  const productionConfig = await readJson(path.join(root, "config/environments.json"));
  const priorHealth = jsonUrl(`${productionConfig.production.apiUrl}/health`);
  const tag = `rollback-production-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  git(root, "tag", tag, previous);
  git(root, "push", "origin", `refs/tags/${tag}`);
  await saveJson(path.join(root, ".releases/production-pending.json"), { commit: sha, previous, rollbackTag: tag, previousApi: priorHealth, manifest: build.production.manifest });
  if (priorHealth.apiDigest !== build.staging.manifest.apiDigest || priorHealth.configurationDigest !== build.production.manifest.apiConfigurationDigest) {
    const upload = wrangler(["versions", "upload", "--config", config, "--message", `Approved staging ${sha}`]);
    const version = upload.match(/Worker Version ID:\s*([a-f0-9-]{36})/i)?.[1];
    if (!version) throw new Error("Could not identify the uploaded production API version. Frontend has not been promoted.");
    wrangler(["versions", "deploy", `${version}@100%`, "--config", config, "--yes"]);
  }
  // A normal fast-forward push promotes every approved commit; never force or cherry-pick.
  git(root, "push", "origin", `${sha}:refs/heads/main`);
  await saveJson(path.join(root, ".releases/production-pending.json"), { commit: sha, previous, rollbackTag: tag, previousApi: priorHealth, manifest: build.production.manifest });
  console.log(`Promoted ${sha}. Rollback source: ${tag}.\nGitHub Pages is deploying. Run release:verify-live after it finishes; a push alone is not verified completion.`);
}

async function verifyLive() {
  const receipt = await readJson(path.join(root, ".releases/production-pending.json"));
  syncReferences();
  if (commitFor(root, "origin/main") !== receipt.commit) throw new Error("GitHub main no longer matches the promoted candidate.");
  const environments = await readJson(path.join(root, "config/environments.json"));
  const source = await sourceFiles(root, { ref: receipt.commit });
  // Check normal public URLs, including the entry point, module entry, CSS and release marker.
  const changed = git(root, "diff", "--name-only", "--diff-filter=ACMRT", receipt.previous, receipt.commit).split("\n").filter((name) => isWebsiteFile(name));
  for (const name of new Set(["index.html", "js/app.js", "styles.css", "staging-demo.css", "release.json", "marketing.html", "js/marketing.js", "js/marketing-core.js", ...changed])) {
    const url = `${environments.production.siteUrl}/${name === "index.html" ? "" : name}`;
    const bytes = execFileSync("curl", ["--fail", "--silent", "--show-error", "--max-time", "20", url]);
    if (digest(bytes) !== digest(source.get(name))) throw new Error(`Public ${name} does not yet match the approved commit. Retry after deployment; do not report completion.`);
  }
  const health = jsonUrl(`${environments.production.apiUrl}/health`);
  if (health.apiDigest !== receipt.manifest.apiDigest || health.configurationDigest !== receipt.manifest.apiConfigurationDigest || health.environment !== "production" || health.fixturesEnabled) throw new Error("Production API version or isolation verification failed.");
  await saveJson(path.join(root, ".releases/production.json"), { ...receipt, verifiedAt: new Date().toISOString() });
  console.log(`Verified normal public URLs and matching production API for ${receipt.commit}. Rollback: ${receipt.rollbackTag}.`);
}

async function main() {
  const [command, value] = process.argv.slice(2);
  if (command === "status") return status();
  if (command === "sync") return sync();
  if (command === "prepare") return prepare();
  if (command === "check") { assertClean(root); syncReferences(); return testedBuild(commitFor(root)); }
  if (command === "stage") return stage();
  if (command === "smoke") return smoke(await buildSite());
  if (command === "promote") return promote(value);
  if (command === "verify-live") return verifyLive();
  throw new Error("Use status, sync, prepare, check, stage, smoke, promote <approved commit>, or verify-live.");
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => {
  console.error(error.stderr?.toString().trim() || error.message);
  process.exitCode = 1;
});
