import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import {
  buildMarketingCopy,
  formatDiscordDate,
  getDailyPostNumber,
  getPreviousDateKey,
} from "../js/marketing-core.js";

test("daily Reddit post numbers are anchored to 13 August 2026", () => {
  assert.equal(getDailyPostNumber("2026-08-13"), 1);
  assert.equal(getDailyPostNumber("2026-09-10"), 29);
});

test("previous date handles month boundaries", () => {
  assert.equal(getPreviousDateKey("2026-09-01"), "2026-08-31");
});

test("Discord dates use the requested short September spelling", () => {
  assert.equal(formatDiscordDate("2026-09-10"), "10 Sept");
});

test("marketing copy fills daily data but leaves usernames blank", () => {
  const copy = buildMarketingCopy({
    dateKey: "2026-09-10",
    clue: "Defeat the boss, then defend your ally as he carries the warhead into the portal.",
    yesterdayAnswer: "Liberty Falls",
    solvePercentage: 67,
  });

  assert.equal(copy.redditTitle, "Can you guess the map from the main quest step? #29");
  assert.match(copy.redditBody, /Yesterday’s answer: Liberty Falls 🧟/);
  assert.match(copy.redditBody, /Solved on The Daily Undead: 67% 🔎/);
  assert.match(copy.redditBody, /u\/____, u\/____, u\/____/);
  assert.match(copy.discordBody, /🧟 The Daily Undead - 10 Sept/);
  assert.match(copy.discordBody, /@____, @____, @____/);
  assert.doesNotMatch(copy.redditBody, /TXIC|Working5099|Expensive_Ad/);
  assert.doesNotMatch(copy.discordBody, /The blaze|Tob1asV|be nice/);
});

test("missing statistics are visibly left incomplete", () => {
  const copy = buildMarketingCopy({
    dateKey: "2026-09-10",
    clue: "A clue.",
    yesterdayAnswer: "Liberty Falls",
    solvePercentage: null,
  });

  assert.match(copy.redditBody, /—%/);
  assert.match(copy.discordBody, /—%/);
});

test("marketing page keeps its source and controls wired", async () => {
  const html = await readFile(new URL("../marketing.html", import.meta.url), "utf8");
  assert.match(html, /name="robots" content="noindex, nofollow"/);
  assert.match(html, /id="marketing-image"/);
  assert.match(html, /id="download-image"/);
  assert.match(html, /data-copy-target="reddit-body"/);
  assert.match(html, /data-copy-target="discord-body"/);
  assert.match(html, /\.\/js\/marketing\.js/);
});

test("the supplied marketing image template is available", async () => {
  const template = await stat(new URL("../assets/marketing-template.jpg", import.meta.url));
  assert.equal(template.isFile(), true);
  assert.equal(template.size > 0, true);
});
