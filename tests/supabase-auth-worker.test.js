import test from "node:test";
import assert from "node:assert/strict";

import { resetJwksCacheForTests, verifySupabaseRequest } from "../worker/src/auth.js";
import { createAccountId, resolveAccountIdentity } from "../worker/src/identities.js";
import worker from "../worker/src/index.js";

const encode = (value) => Buffer.from(
  typeof value === "string" ? value : JSON.stringify(value),
).toString("base64url");

async function signedToken(payloadOverrides = {}) {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const publicKey = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const header = { alg: "ES256", typ: "JWT", kid: "staging-key" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: "https://example.supabase.co/auth/v1",
    sub: "c6ca42ae-f94f-4f44-80d3-bd08d52fd724",
    aud: "authenticated",
    role: "authenticated",
    exp: now + 600,
    iat: now,
    session_id: "session-1",
    ...payloadOverrides,
  };
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keyPair.privateKey,
    new TextEncoder().encode(signingInput),
  );
  return {
    token: `${signingInput}.${Buffer.from(signature).toString("base64url")}`,
    jwk: { ...publicKey, kid: header.kid, alg: header.alg, use: "sig" },
  };
}

test("Supabase JWT verification accepts only signed authenticated users", async () => {
  resetJwksCacheForTests();
  const { token, jwk } = await signedToken({
    app_metadata: { daily_undead_clerk_user_id: "user_existing" },
  });
  const identity = await verifySupabaseRequest(
    new Request("https://api.example/api/account", {
      headers: { Authorization: `Bearer ${token}` },
    }),
    { SUPABASE_ISSUER: "https://example.supabase.co/auth/v1" },
    async () => Response.json({ keys: [jwk] }),
  );

  assert.deepEqual(identity, {
    provider: "supabase",
    subject: "c6ca42ae-f94f-4f44-80d3-bd08d52fd724",
    sessionId: "session-1",
    migrationSubject: "user_existing",
  });
});

test("Supabase JWT verification rejects the wrong audience", async () => {
  resetJwksCacheForTests();
  const { token, jwk } = await signedToken({ aud: "anon", role: "anon" });
  await assert.rejects(
    verifySupabaseRequest(
      new Request("https://api.example/api/account", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      { SUPABASE_ISSUER: "https://example.supabase.co/auth/v1" },
      async () => Response.json({ keys: [jwk] }),
    ),
    /claims are invalid/,
  );
});

test("app-owned account ids do not depend on an auth provider", () => {
  assert.equal(
    createAccountId(() => "12345678-1234-4234-9234-1234567890ab"),
    "acct_123456781234423492341234567890ab",
  );
});

test("an imported Supabase identity links to the existing Clerk-owned profile", async () => {
  let inserted = false;
  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          if (/WHERE identities\.provider = \?/.test(sql)) {
            return { first: async () => null };
          }
          if (/provider = 'clerk'/.test(sql)) {
            assert.deepEqual(values, ["user_existing"]);
            return { first: async () => ({ account_id: "acct_existing" }) };
          }
          if (/INSERT INTO account_identities/.test(sql)) {
            return { run: async () => { inserted = true; } };
          }
          if (/provider = 'supabase'/.test(sql)) {
            return {
              first: async () => inserted
                ? { user_id: "user_existing", account_id: "acct_existing" }
                : null,
            };
          }
          throw new Error(`Unexpected query: ${sql}`);
        },
      };
    },
  };

  const identity = await resolveAccountIdentity(db, {
    provider: "supabase",
    subject: "c6ca42ae-f94f-4f44-80d3-bd08d52fd724",
    migrationSubject: "user_existing",
  });
  assert.equal(inserted, true);
  assert.deepEqual(identity, {
    provider: "supabase",
    subject: "c6ca42ae-f94f-4f44-80d3-bd08d52fd724",
    userId: "user_existing",
    accountId: "acct_existing",
  });
});

test("the scheduled Worker calls the protected Supabase heartbeat", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  let pending;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(null, { status: 204 });
  };

  try {
    await worker.scheduled(null, {
      SUPABASE_HEARTBEAT_URL: "https://example.supabase.co/functions/v1/project-heartbeat",
      SUPABASE_HEARTBEAT_SECRET_KEY: "server-only-secret",
    }, {
      waitUntil(value) {
        pending = value;
      },
    });
    await pending;
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(request, {
    url: "https://example.supabase.co/functions/v1/project-heartbeat",
    options: {
      method: "POST",
      headers: { apikey: "server-only-secret" },
    },
  });
});
