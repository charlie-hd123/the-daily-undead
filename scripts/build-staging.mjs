import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, ".staging-dist");
const stagingApi = "https://daily-undead-staging-api.charlieharrisondavies.workers.dev";
const stagingClerkKey = "pk_test_cmFwaWQtcGlnZW9uLTg0Ni5jbGVyay5hY2NvdW50cy5kZXYk";
const stagingSupabaseUrl = "https://zsnnvzhimtlhpvwhwxpy.supabase.co";
const stagingSupabasePublishableKey = "sb_publishable_YfgJYTqB09B7dKxzZ1NMYA_CN9XiAkO";

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const directory of ["assets", "data", "js"]) {
  await cp(path.join(root, directory), path.join(output, directory), { recursive: true });
}

for (const filename of ["styles.css", "marketing.css", "staging-demo.css"]) {
  await cp(path.join(root, filename), path.join(output, filename));
}

async function writeStagingHtml(filename, { banner = false, outputFilename = filename } = {}) {
  const source = await readFile(path.join(root, filename), "utf8");
  let html = source
    .replace("https://api.thedailyundead.com", stagingApi)
    .replace("pk_live_Y2xlcmsudGhlZGFpbHl1bmRlYWQuY29tJA", stagingClerkKey)
    .replace(
      /name="daily-undead-supabase-url" content="[^"]*"/,
      `name="daily-undead-supabase-url" content="${stagingSupabaseUrl}"`,
    )
    .replace(
      /name="daily-undead-supabase-publishable-key" content="[^"]*"/,
      `name="daily-undead-supabase-publishable-key" content="${stagingSupabasePublishableKey}"`,
    )
    .replace("__PROGRESSION_UPDATE_LAUNCH_AT__", new Date().toISOString());
  if (!html.includes('<meta name="robots"')) {
    html = html.replace(
      '<meta name="referrer" content="strict-origin-when-cross-origin">',
      '<meta name="robots" content="noindex, nofollow">\n    <meta name="referrer" content="strict-origin-when-cross-origin">',
    );
  }

  if (banner) {
    html = html
      .replace("<title>The Daily Undead</title>", "<title>Staging · The Daily Undead</title>")
      .replace(
        "<body>",
        '<body>\n    <div class="staging-environment-banner" role="status">Private staging · Test data only</div>',
      )
      .replace(
        "</head>",
        `  <style>
      .staging-environment-banner {
        position: relative;
        z-index: 10000;
        padding: 0.45rem 1rem;
        background: #f7c85c;
        color: #171006;
        font: 800 0.78rem/1.2 "Barlow", sans-serif;
        letter-spacing: 0.08em;
        text-align: center;
        text-transform: uppercase;
      }
    </style>
  </head>`,
      );
  }

  await writeFile(path.join(output, outputFilename), html);
}

await writeStagingHtml("staging-demo.html", { banner: true, outputFilename: "index.html" });
await writeStagingHtml("marketing.html");
await writeStagingHtml("maintenance.html");

await writeFile(
  path.join(output, "_headers"),
  `/*
  X-Robots-Tag: noindex, nofollow
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
`,
);

await writeFile(
  path.join(output, "_worker.js"),
  `function unauthorized() {
  return new Response("Staging access required.", {
    status: 401,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "WWW-Authenticate": 'Basic realm="The Daily Undead Staging", charset="UTF-8"',
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function equal(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export default {
  async fetch(request, env) {
    const authorization = request.headers.get("Authorization") || "";
    if (!authorization.startsWith("Basic ") || !env.STAGING_PASSWORD) {
      return unauthorized();
    }

    let credentials = "";
    try {
      credentials = atob(authorization.slice(6));
    } catch {
      return unauthorized();
    }

    const separator = credentials.indexOf(":");
    const username = separator >= 0 ? credentials.slice(0, separator) : "";
    const password = separator >= 0 ? credentials.slice(separator + 1) : "";
    if (!equal(username, "charlie") || !equal(password, env.STAGING_PASSWORD)) {
      return unauthorized();
    }

    const assetRequest = new Request(request);
    assetRequest.headers.delete("Authorization");
    return env.ASSETS.fetch(assetRequest);
  },
};
`,
);

console.log(`Built isolated staging assets in ${output}`);
