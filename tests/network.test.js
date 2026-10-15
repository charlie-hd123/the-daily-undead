import test from "node:test";
import assert from "node:assert/strict";

import { fetchWithTimeout } from "../js/network.js";

test("startup requests reject promptly when the network never responds", async () => {
  let signal;

  await assert.rejects(
    fetchWithTimeout(
      "https://example.test/stalled",
      { cache: "no-store" },
      {
        timeoutMs: 5,
        fetchImpl: async (_input, options) => {
          signal = options.signal;
          return new Promise(() => {});
        },
      },
    ),
    /Request timed out\./,
  );

  assert.equal(signal.aborted, true);
});

test("startup requests preserve their fetch options", async () => {
  let received;
  const response = { ok: true };

  const result = await fetchWithTimeout(
    "https://example.test/data.json",
    { cache: "no-store", headers: { Accept: "application/json" } },
    {
      timeoutMs: 50,
      fetchImpl: async (input, options) => {
        received = { input, options };
        return response;
      },
    },
  );

  assert.equal(result, response);
  assert.equal(received.input, "https://example.test/data.json");
  assert.equal(received.options.cache, "no-store");
  assert.equal(received.options.headers.Accept, "application/json");
  assert.equal(received.options.signal.aborted, false);
});
