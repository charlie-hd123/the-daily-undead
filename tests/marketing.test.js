import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import {
  buildMarketingCopy,
  buildWordMarketingCopy,
  buildBloodMarketingCopy,
  buildWordPattern,
  formatDiscordDate,
  getDailyPostNumber,
  getPreviousDateKey,
  isAppleMobileDevice,
} from "../js/marketing-core.js";

test('Blood Ties marketing names the connection game and preserves yesterday’s answer and solve rate', () => {
  const copy = buildBloodMarketingCopy({ dateKey: '2026-10-22', yesterdayAnswer: 'Doctor Groph', solvePercentage: 73 });
  assert.equal(copy.redditTitle, 'Spot a Zombies connection? — 22 Oct');
  assert.match(copy.redditBody, /Can you identify three tiles that form a connection\? There are four total\./);
  assert.match(copy.redditBody, /Found a connection\? Comment your three tiles and what connects them 👇/);
  assert.match(copy.discordBody, /First correct here: @____, @____, @____/);
  assert.match(copy.discordBody, /Yesterday’s answer: Doctor Groph/);
  assert.match(copy.discordBody, /73%/);
  assert.match(copy.discordBody, /Want to find all four\? Complete the puzzle on the website\./);
  assert.equal(buildBloodMarketingCopy({ dateKey: '2026-10-22', yesterdayAnswer: 'Doctor Groph', solvePercentage: null }).solved, '—%');
});

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
    "Which Zombies map is it?",
    "",
    "Can you identify the map from one of its main quest steps?",
    "",
    "Try to get it before reading the comments 👀",
    "",
    "Drop your guess below 👇",
  ].join("\n"));
  assert.doesNotMatch(copy.redditBody, /Today’s Quest Steps clue|Defeat the boss/);
  assert.match(copy.redditBody, /Which Zombies map is it\?/);
  assert.equal(copy.discordBody, [
    "🧟 __The Daily Undead · 10 Sept__",
    "",
    "Yesterday’s answer: Juggernog 🧟",
    "Yesterday’s solve rate: 67% 🔎",
    "First correct here: @____, @____, @____ 👏",
    "",
    "**Which Zombies map is it?**",
    "",
    "Can you identify the map from one of its main quest steps?",
    "",
    "Drop your guess below 👇",
    "",
    "Need another clue? Continue the puzzle on the website.",
    "",
    "🔗 <https://thedailyundead.com/>",
  ].join("\n"));
  assert.doesNotMatch(copy.discordBody, /Today’s Quest Steps clue|Defeat the boss/);
  assert.match(copy.discordBody, /on the website\./);
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
    "Which Zombies word is it?",
    "",
    "Try to solve the Zombies word or phrase with these limited letters.",
    "",
    "Try to get it before reading the comments 👀",
    "",
    "Drop your guess below 👇",
  ].join("\n"));
  assert.doesNotMatch(copy.redditBody, /Today’s Last Words puzzle|Hint: Character|______ __C__O___/);
  assert.equal(copy.discordBody, [
    "🧟 __The Daily Undead · 17 Oct__",
    "",
    "Yesterday’s answer: Tag der Toten 🧟",
    "Yesterday’s solve rate: 76% 🔎",
    "First correct here: @____, @____, @____ 👏",
    "",
    "**Which Zombies word is it?**",
    "",
    "Try to solve the Zombies word or phrase with these limited letters.",
    "",
    "Drop your guess below 👇",
    "",
    "Need another letter? Continue the puzzle on the website.",
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

test('the previous Blood Ties recap keeps only its solve rate and shout-outs for every post type', () => {
  const input = { dateKey: '2026-10-23', yesterdayAnswer: 'Revive perks: Quick Revive, Tombstone Soda, Dying Wish\nPack-a-Punch: Wall Power, Crate Power, Bullet Boost', yesterdayPuzzleName: 'Blood Ties', solvePercentage: 70 };
  const copies = [buildMarketingCopy({ ...input, clue: 'A clue' }), buildWordMarketingCopy({ ...input, answer: 'Mystery Box', initialLetters: ['M'], category: 'Object' }), buildBloodMarketingCopy(input)];
  copies.forEach(copy => {
    for (const text of [copy.redditBody, copy.discordBody]) {
      assert.match(text, /Yesterday’s Blood Ties solve rate: 70% 🔎/);
      assert.doesNotMatch(text, /Yesterday’s connections:|Yesterday’s answer:|Revive perks|Quick Revive|Pack-a-Punch|Bullet Boost/);
    }
    assert.match(copy.redditBody, /First correct here: u\/____, u\/____, u\/____ 👏/);
    assert.match(copy.discordBody, /First correct here: @____, @____, @____ 👏/);
  });
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
