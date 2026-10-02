import assert from "node:assert/strict";
import test from "node:test";

import maintenanceWorker from "../worker/src/maintenance.js";

const env = { ALLOWED_ORIGINS: "https://daily-undead-staging.pages.dev" };

test("maintenance Worker remains healthy while pausing API traffic", async () => {
  const health = await maintenanceWorker.fetch(
    new Request("https://api.example.test/health"),
    env,
  );
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, maintenance: true });

  const write = await maintenanceWorker.fetch(
    new Request("https://api.example.test/api/account/save", {
      method: "PUT",
      headers: { Origin: "https://daily-undead-staging.pages.dev" },
    }),
    env,
  );
  assert.equal(write.status, 503);
  assert.equal(write.headers.get("Retry-After"), "300");
  assert.equal(write.headers.get("Access-Control-Allow-Origin"), "https://daily-undead-staging.pages.dev");
  assert.equal((await write.json()).maintenance, true);
});

test("maintenance Worker rejects unapproved browser origins", async () => {
  const response = await maintenanceWorker.fetch(
    new Request("https://api.example.test/api/stats?date=2026-10-02", {
      headers: { Origin: "https://not-the-site.example" },
    }),
    env,
  );
  assert.equal(response.status, 403);
});
