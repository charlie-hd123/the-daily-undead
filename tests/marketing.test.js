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

  assert.equal(copy.redditTitle, "Which Zombies map is it? — 10 Sept");
  assert.equal(copy.redditBody, [
    "Yesterday’s answer: Juggernog 🧟",
    "Yesterday’s solve rate: 67% 🔎",
    "First correct here: u/____, u/____, u/____ 👏",
    "",
    "Today’s puzzle:",
    "Which Treyarch Zombies map is it?",
    "",
    "Try to get it before reading the comments 👀",
    "",
    "Drop your guess below👇",
  ].join("\n"));
  assert.doesNotMatch(copy.redditBody, /Today’s Quest Steps clue|Defeat the boss/);
  assert.match(copy.redditBody, /Which Treyarch Zombies map is it\?/);
  assert.equal(copy.discordBody, [
    "🧟 __The Daily Undead · 10 Sept__",
    "Yesterday’s answer: Juggernog 🧟",
    "Yesterday’s solve rate: 67% 🔎",
    "First correct here: @____, @____, @____ 👏",
    "",
    "Today’s puzzle:",
    "**Think you know the map?**",
    "",
    "Drop your guess below 👇",
    "",
    "Need another clue, or want to lock in your answer on the website?",
    "",
    "🔗 <https://thedailyundead.com/>",
  ].join("\n"));
  assert.doesNotMatch(copy.discordBody, /Today’s Quest Steps clue|Defeat the boss/);
  assert.match(copy.discordBody, /on the website\?/);
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
    dateKey: "2026-10-17",
    answer: "Edward Richtofen",
    initialLetters: ["C", "O"],
    category: "Character",
    yesterdayAnswer: "Tag der Toten",
    solvePercentage: 76,
  });

  assert.equal(copy.redditTitle, "Which Zombies word is it? — 17 Oct");
  assert.equal(copy.pattern, "______ __C__O___");
  assert.equal(copy.redditBody, [
    "Yesterday’s answer: Tag der Toten 🧟",
    "Yesterday’s solve rate: 76% 🔎",
    "First correct here: u/____, u/____, u/____ 👏",
    "",
    "Today’s puzzle:",
    "Which Zombies word or phrase is it?",
    "",
    "Try to get it before reading the comments 👀",
    "",
    "Drop your guess below👇",
  ].join("\n"));
  assert.doesNotMatch(copy.redditBody, /Today’s Last Words puzzle|Hint: Character|______ __C__O___/);
  assert.equal(copy.discordBody, [
    "🧟 __The Daily Undead · 17 Oct__",
    "Yesterday’s answer: Tag der Toten 🧟",
    "Yesterday’s solve rate: 76% 🔎",
    "First correct here: @____, @____, @____ 👏",
    "",
    "Today’s puzzle:",
    "**Think you know the word or phrase?**",
    "",
    "Drop your guess below 👇",
    "",
    "Need another letter, or want to lock in your answer on the website?",
    "",
    "🔗 <https://thedailyundead.com/>",
  ].join("\n"));
  assert.doesNotMatch(copy.discordBody, /Today’s Last Words puzzle|Hint: Character|______ __C__O___/);
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
