import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { commitFor, digest, isWebsiteFile, saveJson, sourceFiles, sourceManifest } from "./lib/release-tools.mjs";
export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function configureHtml(source, config, environment) {
  let html = source;
  for (const [name, value] of Object.entries({
    "daily-undead-stats-api": config.apiUrl,
    "daily-undead-clerk-publishable-key": config.clerkPublishableKey,
    "daily-undead-supabase-url": config.supabaseUrl,
    "daily-undead-supabase-publishable-key": config.supabasePublishableKey,
  })) html = html.replace(new RegExp(`(name="${name}" content=")[^"]*(")`), (_, before, after) => `${before}${value}${after}`);
  if (environment !== "production") {
    html = html.replace("</head>", '  <meta name="robots" content="noindex, nofollow">\n  </head>');
    if (html.includes('id="app"')) {
      html = html.replace("<body>", `<body>\n    <aside data-environment-badge style="position:fixed;bottom:8px;right:8px;z-index:10000;padding:5px 9px;border-radius:5px;background:#f7c85c;color:#171006;font:700 11px/1.2 sans-serif;pointer-events:none">${environment === "staging" ? "STAGING" : "LOCAL"} · TEST DATA</aside>`);
      html = html.replace("<title>The Daily Undead</title>", `<title>${environment === "staging" ? "Staging" : "Local"} · The Daily Undead</title>`);
    }
  }
  return html;
}

export async function buildSite({ root = projectRoot, environment = "staging", ref = "HEAD", working = false, output } = {}) {
  if (!["staging", "production", "local"].includes(environment)) throw new Error("Unknown build environment.");
  const files = await sourceFiles(root, { ref: working ? null : ref });
  const environments = JSON.parse(files.get("config/environments.json").toString());
  const config = environments[environment];
  if (environment !== "production" && (config.apiUrl === environments.production.apiUrl || config.supabaseUrl === environments.production.supabaseUrl)) throw new Error("Non-production builds must use isolated services.");
  const worker = JSON.parse(files.get(config.workerConfig).toString());
  if (worker.vars.SUPABASE_ISSUER !== `${config.supabaseUrl}/auth/v1` || !worker.vars.ALLOWED_ORIGINS.split(",").includes(config.siteUrl) || worker.d1_databases[0].database_name !== config.database) throw new Error("Website, authentication, CORS and database configuration must describe the same environment.");
  if (environment === "production" && worker.vars.STAGING_FIXTURES) throw new Error("Production must never enable fictional staging activity.");
  const manifest = { ...sourceManifest(files, working ? null : commitFor(root, ref)), environment, apiConfigurationDigest: digest(files.get(config.workerConfig)) };
  output ||= path.join(root, environment === "staging" ? ".staging-dist" : `.${environment}-dist`);
  if (path.resolve(output) !== path.resolve(root, `.${environment}-dist`)) throw new Error("Build output must be the environment's dedicated dist directory.");
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const [name, bytes] of files) {
    if (!isWebsiteFile(name) || (environment !== "production" && name === "CNAME")) continue;
    const target = path.join(output, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, name.endsWith(".html") ? configureHtml(bytes.toString(), config, environment) : bytes);
  }
  await saveJson(path.join(output, "release-manifest.json"), manifest);
  if (environment === "staging") {
    await writeFile(path.join(output, "_worker.js"), files.get("scripts/lib/staging-gateway.mjs"));
    await writeFile(path.join(output, "_headers"), "/*\n  X-Robots-Tag: noindex, nofollow\n  X-Content-Type-Options: nosniff\n/release-manifest.json\n  Cache-Control: no-store\n/.well-known/release.json\n  Cache-Control: no-store\n");
  }
  return { output, manifest, config };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildSite({ environment: process.argv[2] || "staging", working: process.argv.includes("--working") });
  console.log(`${result.manifest.environment}: ${result.manifest.commit?.slice(0, 12) || "working files"} → ${result.output}`);
}
