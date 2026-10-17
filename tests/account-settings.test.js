import test from "node:test";
import assert from "node:assert/strict";
import { clearDeletedAccountStorage, requestEmailChange, verifyEmailChange } from "../js/account-settings.js";

test("email changes validate the new address and propagate delivery failures", async () => {
  let calls = 0;
  const auth = { async updateUser(value) { calls++; assert.deepEqual(value, { email: "new@example.com" }); return { error: new Error("Email delivery unavailable") }; } };
  await assert.rejects(requestEmailChange(auth, "bad", "old@example.com"), /valid email/);
  await assert.rejects(requestEmailChange(auth, " OLD@example.com ", "old@example.com"), /different email/);
  assert.equal(calls, 0);
  await assert.rejects(requestEmailChange(auth, " NEW@example.com ", "old@example.com"), /delivery unavailable/);
  assert.equal(calls, 1);
  assert.equal(await requestEmailChange({ updateUser: async () => ({ data: { user: { email: "old@example.com" } } }) }, "new@example.com", "old@example.com"), "new@example.com");
});

test("email verification only completes once the auth service confirms the new address", async () => {
  const calls = [];
  let response = { data: { user: null, session: null }, error: null };
  const auth = { async verifyOtp(value) { calls.push(value); return response; } };
  await assert.rejects(verifyEmailChange(auth, "new@example.com", "bad", "new@example.com"), /verification code/);
  assert.equal(calls.length, 0);
  assert.equal(await verifyEmailChange(auth, "new@example.com", "123 456", "new@example.com"), false);
  assert.deepEqual(calls[0], { email: "new@example.com", token: "123456", type: "email_change" });
  response = { data: { user: { email: "new@example.com" } }, error: null };
  assert.equal(await verifyEmailChange(auth, "old@example.com", "87654321", "new@example.com"), true);
  response = { error: new Error("Code expired") };
  await assert.rejects(verifyEmailChange(auth, "new@example.com", "123456", "new@example.com"), /Code expired/);
});

test("account deletion clears game progress without erasing unrelated site storage", () => {
  const values = new Map([["the-daily-undead:account-memory", "account"], ["the-daily-undead:account-pending:acct_123", "save"], ["the-daily-undead:account-pending:acct_other", "other player's offline save"], ["dead-drop:2026-10-17", "puzzle"], ["unrelated", "keep"], ["sb-project-auth-token", "session"]]);
  const storage = { get length() { return values.size; }, key: (index) => [...values.keys()][index], removeItem: (key) => values.delete(key) };
  clearDeletedAccountStorage(storage, ["acct_123"]);
  assert.deepEqual([...values.keys()], ["the-daily-undead:account-pending:acct_other", "unrelated", "sb-project-auth-token"]);
});
