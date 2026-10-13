# Browser cache recovery

The production site is normally served by GitHub Pages. If a browser keeps an
obsolete application shell, the site can temporarily use Cloudflare as a proxy
to attach a one-time cache-only recovery header.

## Non-negotiable data-safety rule

The only permitted recovery directive is:

```http
Clear-Site-Data: "cache"
```

Never add `"storage"`, `"cookies"`, `"executionContexts"`, or `"*"`. Guest
Score, Solves, Round, puzzle progress, and anonymous participation identifiers
live in browser storage. Account progress and verified results also remain in
production D1 and must not be migrated or edited for cache recovery.

## Temporary Cloudflare rule

Proxy only the production website DNS records through Cloudflare; the API DNS
and production Worker remain unchanged. Add a response-header transform rule
with all of these request conditions:

- Host equals `thedailyundead.com`.
- Method equals `HEAD`.
- Path equals `/index.html`.
- The request cookie does not contain `tdu_cache_rescue=20261013`.

For matching responses, add exactly these headers:

```http
Clear-Site-Data: "cache"
Set-Cookie: tdu_cache_rescue=20261013; Max-Age=604800; Path=/; Secure; SameSite=Lax
```

Historical and current builds already make a same-origin, no-store `HEAD`
request to `/index.html?clock=...` during startup. The rule therefore reaches
stale clients without clearing local storage. The cookie makes the recovery
one-time per browser. The currently running page may continue until it is next
opened or reaches the normal UTC rollover.

## Verification

Before enabling the rule, verify the exact production commit, assets, both
puzzles, result flows, guest progress, account progress, community statistics,
and leaderboards. After enabling it:

1. Confirm the normal public URL still serves the expected production build.
2. Confirm a cookie-free `HEAD /index.html?clock=...` response contains only the
   cache directive above and the rescue cookie.
3. Repeat with the rescue cookie and confirm the recovery headers are absent.
4. Confirm local storage values survive and a cached older-build simulation
   loads the current build after its next navigation.
5. Check mobile and desktop layouts through the same representative states.

Remove the transform rule after seven days. Cloudflare proxying may remain on
if production checks stay healthy, or the DNS records can return to DNS-only to
restore the previous direct GitHub Pages path.

## Rollback

If the public site, HTTPS, redirects, assets, or API calls fail, disable the
transform rule and return the website DNS records to DNS-only. This restores
the previous GitHub Pages route. No database rollback is involved.
