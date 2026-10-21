import test from "node:test";
import assert from "node:assert/strict";
import { canPreviewDays, createDayPreviewStorage } from "../js/day-preview.js";

test("staging day controls require both staging configuration and its exact hostname", () => {
  assert.equal(canPreviewDays("daily-undead-staging.pages.dev", "staging", false), true);
  assert.equal(canPreviewDays("daily-undead-staging.pages.dev", "production", false), false);
  assert.equal(canPreviewDays("thedailyundead.com", "staging", false), false);
  assert.equal(canPreviewDays("www.thedailyundead.com", "staging", false), false);
  assert.equal(canPreviewDays("other.pages.dev", "staging", false), false);
  assert.equal(canPreviewDays("localhost", "local", true), true);
});

test("preview scores and puzzles are isolated by day without altering today's guest save", () => {
  const values = new Map([["score", "100"], ["puzzle", "today"]]);
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
  const tomorrow = createDayPreviewStorage(storage, "2026-10-18", true);
  assert.equal(tomorrow.getItem("score"), null);
  tomorrow.setItem("score", 200);
  tomorrow.setItem("puzzle", "tomorrow");
  assert.equal(storage.getItem("score"), "100");
  assert.equal(storage.getItem("puzzle"), "today");
  assert.equal(createDayPreviewStorage(storage, "2026-10-18", true).getItem("score"), "200");
  assert.equal(createDayPreviewStorage(storage, "2026-10-19", true).getItem("score"), null);
  tomorrow.removeItem("score");
  assert.equal(storage.getItem("score"), "100");
  assert.equal(createDayPreviewStorage(storage, "2026-10-17", false), storage);
});

test('fresh preview runs retain previous previews and never select ordinary storage', () => {
  const values = new Map([['score', '100']]);
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
  const original = createDayPreviewStorage(storage, '2026-10-22', true);
  original.setItem('score', '70');
  const fresh = createDayPreviewStorage(storage, '2026-10-22', true, 'run-one');
  assert.equal(fresh.getItem('score'), null); fresh.setItem('score', '40');
  assert.equal(createDayPreviewStorage(storage, '2026-10-22', true, 'run-one').getItem('score'), '40');
  assert.equal(original.getItem('score'), '70'); assert.equal(storage.getItem('score'), '100');
  assert.equal(createDayPreviewStorage(storage, '2026-10-22', true, '../invalid').getItem('score'), '70');
});
