// Access control only; the application uses the production renderer.
function unauthorized() {
  return new Response("Staging access required.", { status: 401, headers: {
    "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8",
    "WWW-Authenticate": 'Basic realm="The Daily Undead Staging", charset="UTF-8"', "X-Robots-Tag": "noindex, nofollow",
  } });
}
function equal(left, right) {
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return difference === 0;
}
export default {
  async fetch(request, env) {
    // Public identity only: commit and hashes, never credentials or player data.
    if (new URL(request.url).pathname === "/.well-known/release.json" && request.method === "GET") return env.ASSETS.fetch(new Request(new URL("/release-manifest.json", request.url)));
    const authorization = request.headers.get("Authorization") || "";
    if (!authorization.startsWith("Basic ") || !env.STAGING_PASSWORD) return unauthorized();
    let credentials;
    try { credentials = atob(authorization.slice(6)); } catch { return unauthorized(); }
    const separator = credentials.indexOf(":");
    if (separator < 0 || !equal(credentials.slice(0, separator), "charlie") || !equal(credentials.slice(separator + 1), env.STAGING_PASSWORD)) return unauthorized();
    const assetRequest = new Request(request);
    assetRequest.headers.delete("Authorization");
    return env.ASSETS.fetch(assetRequest);
  },
};
