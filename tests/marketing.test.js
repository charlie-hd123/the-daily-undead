import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import {
  buildMarketingCopy,
  buildWordMarketingCopy,
  buildWordPattern,
  formatDiscordDate,
  getDailyPostNumber,
  getPreviousDateKey,
  isAppleMobileDevice,
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
    yesterdayAnswer: "Juggernog",
    yesterdayPuzzleName: "Last Words",
    solvePercentage: 67,
  });

  assert.equal(copy.redditTitle, "Can you solve today’s Quest Steps puzzle? — 10 Sept");
  assert.match(copy.redditBody, /Yesterday’s Last Words answer: Juggernog 🧟/);
  assert.match(copy.redditBody, /Yesterday’s Last Words solve rate: 67% 🔎/);
  assert.match(copy.redditBody, /First correct Last Words Redditors:/);
  assert.match(copy.redditBody, /u\/____, u\/____, u\/____/);
  assert.match(copy.redditBody, /Today’s Quest Steps clue:\nDefeat the boss/);
  assert.doesNotMatch(copy.redditBody, /\*Defeat the boss/);
  assert.match(copy.discordBody, /🧟 The Daily Undead · 10 Sept/);
  assert.match(copy.discordBody, /First correct Last Words guesses here:/);
  assert.match(copy.discordBody, /The Daily Undead website/);
  assert.match(copy.discordBody, /@____, @____, @____/);
  assert.match(copy.discordBody, /🔗 <https:\/\/thedailyundead\.com\/>$/);
  assert.doesNotMatch(copy.discordBody, /in-app browser|rounds, points and progress/);
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

test("Last Words marketing copy reveals only the daily starting letters", () => {
  assert.equal(
    buildWordPattern("Edward Richtofen", ["C", "O"]),
    "______ __C__O___",
  );
  assert.equal(buildWordPattern("Pack-a-Punch", ["A", "P"]), "PA__-A-P____");

  const copy = buildWordMarketingCopy({
    dateKey: "2026-10-13",
    answer: "Edward Richtofen",
    initialLetters: ["C", "O"],
    category: "Character",
    yesterdayAnswer: "Der Riese / The Giant",
    solvePercentage: 72,
  });

  assert.equal(copy.redditTitle, "Can you solve today’s Last Words puzzle? — 13 Oct");
  assert.equal(copy.pattern, "______ __C__O___");
  assert.match(copy.redditBody, /Today’s Last Words puzzle:\n______ __C__O___\nHint: Character/);
  assert.match(copy.redditBody, /Yesterday’s Quest Steps answer: Der Riese \/ The Giant/);
  assert.match(copy.discordBody, /Think you know the word or phrase/);
  assert.doesNotMatch(copy.redditBody, /Edward Richtofen/);
  assert.doesNotMatch(copy.discordBody, /Edward Richtofen/);
});

test("Apple mobile devices are detected for the Photos save flow", () => {
  assert.equal(isAppleMobileDevice({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" }), true);
  assert.equal(isAppleMobileDevice({ platform: "MacIntel", maxTouchPoints: 5 }), true);
  assert.equal(isAppleMobileDevice({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 0 }), false);
});

test("marketing page keeps its source and controls wired", async () => {
  const html = await readFile(new URL("../marketing.html", import.meta.url), "utf8");
  assert.match(html, /name="robots" content="noindex, nofollow"/);
  assert.match(html, /id="marketing-image"/);
  assert.match(html, /id="download-image"/);
  assert.match(html, /id="image-save-help"/);
  assert.match(html, /id="image-save-preview"/);
  assert.match(html, /data-copy-target="reddit-body"/);
  assert.match(html, /data-copy-target="discord-body"/);
  assert.match(html, /\.\/js\/marketing\.js/);
});

test("the supplied marketing image templates are available", async () => {
  const templates = await Promise.all([
    stat(new URL("../assets/marketing-template.jpg", import.meta.url)),
    stat(new URL("../assets/marketing-last-words-template.jpg", import.meta.url)),
  ]);
  templates.forEach((template) => {
    assert.equal(template.isFile(), true);
    assert.equal(template.size > 0, true);
  });
});
