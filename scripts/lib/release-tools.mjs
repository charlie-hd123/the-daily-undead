import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim();
}
export function commitFor(root, ref = "HEAD") {
  return git(root, "rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`);
}
export function trackedFiles(root, ref = null) {
  return (ref ? git(root, "ls-tree", "-rz", "--name-only", commitFor(root, ref)) : git(root, "ls-files", "-z")).split("\0").filter(Boolean).sort();
}
export const digest = (value) => createHash("sha256").update(value).digest("hex");
export function hashFiles(files) {
  const hash = createHash("sha256");
  for (const [name, content] of [...files].sort(([a], [b]) => a.localeCompare(b))) hash.update(`${name}\0${digest(content)}\n`);
  return hash.digest("hex");
}
export function isWebsiteFile(name) {
  return /^(assets|data|js)\//.test(name) && name !== "js/staging-demo.js"
    || ["index.html", "marketing.html", "maintenance.html", "staging-demo.html", "styles.css", "marketing.css", "staging-demo.css", "release.json", "CNAME", ".nojekyll"].includes(name);
}
export function isApiFile(name) {
  return name.startsWith("worker/src/") || /^js\/(game-core|word-puzzle-core|blood-ties-[a-z0-9-]+|daily-challenge-core|progression)\.js$/.test(name);
}
export async function sourceFiles(root, { ref = null } = {}) {
  const files = new Map();
  const sha = ref ? commitFor(root, ref) : null;
  for (const name of trackedFiles(root, sha)) files.set(name, sha ? execFileSync("git", ["show", `${sha}:${name}`], { cwd: root, maxBuffer: 32 * 1024 * 1024 }) : await readFile(path.join(root, name)));
  return files;
}
export function sourceManifest(files, commit) {
  const website = new Map([...files].filter(([name]) => isWebsiteFile(name)));
  return {
    format: 1, commit,
    applicationDigest: hashFiles(website),
    apiDigest: hashFiles(new Map([...files].filter(([name]) => isApiFile(name)))),
    build: JSON.parse(files.get("release.json").toString()).build,
    migrations: [...files.keys()].filter((name) => /^worker\/migrations\/.*\.sql$/.test(name)).map((name) => ({ name: path.basename(name), sha256: digest(files.get(name)) })),
    assets: Object.fromEntries([...website].map(([name, data]) => [name, digest(data)])),
  };
}
export async function saveJson(filename, data) {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, `${JSON.stringify(data, null, 2)}\n`);
}
export function assertClean(root) {
  if (git(root, "status", "--porcelain", "--untracked-files=no")) throw new Error("Commit tracked changes before deploying. Unrelated untracked files are excluded from releases.");
}
export function isAncestor(root, before, after) {
  return spawnSync("git", ["merge-base", "--is-ancestor", before, after], { cwd: root }).status === 0;
}
export function assertPromotion({ candidate, staged, api, mainIsAncestor }) {
  if (!mainIsAncestor) throw new Error("Live has changes missing from staging. Incorporate main into staging, redeploy and review first.");
  for (const key of ["commit", "applicationDigest", "apiDigest"]) if (candidate[key] !== staged[key]) throw new Error(`Staging ${key} differs from the approved candidate. Refusing promotion.`);
  if (api.apiDigest !== candidate.apiDigest || api.environment !== "staging") throw new Error("The staging API does not match the approved application.");
}
export function classifyChanges(names) {
  if (!names.length) return "none";
  if (names.every((name) => /^(marketing\.(html|css)|js\/marketing[^/]*\.js|tests\/marketing\.test\.js)$/.test(name))) return "marketing";
  if (names.every((name) => /\.(md|txt)$/.test(name))) return "documentation";
  return "application";
}
