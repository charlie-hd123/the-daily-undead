import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildSite, projectRoot } from "./build-site.mjs";

const cli = process.env.WRANGLER_CLI || path.join(projectRoot, "node_modules/wrangler/bin/wrangler.js");
const config = path.join(projectRoot, "worker/wrangler.local.jsonc");
console.log("Preparing local-only database…");
const migrate = spawn(process.execPath, [cli, "d1", "migrations", "apply", "daily-undead-development", "--local", "--config", config]);
let migrationLog = "";
migrate.stdout.on("data", (data) => { migrationLog += data; });
migrate.stderr.on("data", (data) => { migrationLog += data; });
const migrationExit = await new Promise((resolve) => migrate.on("exit", resolve));
await mkdir(path.join(projectRoot, ".releases/logs"), { recursive: true });
await writeFile(path.join(projectRoot, ".releases/logs/local-migrations.log"), migrationLog);
if (migrationExit !== 0) { console.error(migrationLog.slice(-2500)); process.exit(1); }
const worker = spawn(process.execPath, [cli, "dev", "--local", "--config", config, "--port", "8787", "--log-level", "warn"], { stdio: "inherit" });
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".png": "image/png", ".ttf": "font/ttf", ".svg": "image/svg+xml" };
let building;
async function build() {
  if (!building) building = buildSite({ environment: "local", working: true }).finally(() => { building = null; });
  return building;
}
const server = createServer(async (request, response) => {
  try {
    // Rebuild only on page navigation; subsequent assets are from the same snapshot.
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (pathname === "/" || pathname.endsWith(".html")) await build();
    const filename = path.resolve(projectRoot, ".local-dist", `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!filename.startsWith(path.join(projectRoot, ".local-dist") + path.sep)) throw new Error("Invalid path");
    const target = (await stat(filename)).isDirectory() ? path.join(filename, "index.html") : filename;
    response.writeHead(200, { "Content-Type": types[path.extname(target)] || "application/octet-stream", "Cache-Control": "no-store" });
    response.end(await readFile(target));
  } catch { response.writeHead(404); response.end("Not found"); }
});
await build();
server.listen(8080, "127.0.0.1", () => console.log("Full local app: http://localhost:8080 · API/D1: localhost:8787 · staging authentication · no production writes"));
function close() { worker.kill(); server.close(); }
process.on("SIGINT", close);
process.on("SIGTERM", close);
worker.on("exit", () => server.close());
