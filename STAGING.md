# Private staging environment

Staging is isolated from the live Daily Undead site.

- Website: `https://daily-undead-staging.pages.dev`
- API: `https://daily-undead-staging-api.charlieharrisondavies.workers.dev`
- D1 database: `daily-undead-staging`
- Clerk environment: Development (`rapid-pigeon-846.clerk.accounts.dev`)
- API config: `worker/wrangler.staging.jsonc`
- Generated website directory: `.staging-dist/`

The staging build replaces the production API metadata before upload, adds a
visible staging banner, and sends `noindex` headers. It does not publish the
repository `CNAME`, tests, scripts, Worker files, or production configuration.
The deployed Pages project also requires staging-only HTTP credentials. The
password is stored as Cloudflare's `STAGING_PASSWORD` secret and is never
written to the repository or generated website files.

Build the staging website with:

```sh
npm run build:staging
```

Deploy it with:

```sh
npm run deploy:staging
```

Apply database migrations only to the isolated staging database:

```sh
npx wrangler@latest d1 migrations apply daily-undead-staging \
  --remote --config worker/wrangler.staging.jsonc
```

Deploy only the staging API:

```sh
cd worker
npx wrangler@latest deploy --config wrangler.staging.jsonc
```

Never substitute `worker/wrangler.jsonc` or `daily-undead-stats` in staging
commands. Those identify production.
