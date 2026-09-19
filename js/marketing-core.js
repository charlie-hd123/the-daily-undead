import { getUtcDateKey, isValidDateKey } from "./game-core.js?v=20260919-1";

export const firstRedditPostDate = "2026-08-13";

export function isAppleMobileDevice(navigatorObject) {
  const userAgent = navigatorObject?.userAgent || "";
  const platform = navigatorObject?.platform || "";
  const touchPoints = navigatorObject?.maxTouchPoints || 0;
  return /iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && touchPoints > 1);
}

export function getPreviousDateKey(dateKey) {
  if (!isValidDateKey(dateKey)) throw new Error("A valid date is required.");
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return getUtcDateKey(date);
}

export function getDailyPostNumber(dateKey, startDateKey = firstRedditPostDate) {
  if (!isValidDateKey(dateKey) || !isValidDateKey(startDateKey)) {
    throw new Error("Valid puzzle and launch dates are required.");
  }

  const elapsedDays = Math.floor(
    (Date.parse(`${dateKey}T00:00:00Z`) - Date.parse(`${startDateKey}T00:00:00Z`)) / 86400000,
  );
  return elapsedDays + 1;
}

export function formatPackDate(dateKey) {
  if (!isValidDateKey(dateKey)) throw new Error("A valid date is required.");
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateKey}T12:00:00Z`));
}

export function formatDiscordDate(dateKey) {
  if (!isValidDateKey(dateKey)) throw new Error("A valid date is required.");
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
    .format(new Date(`${dateKey}T12:00:00Z`))
    .replace(/\bSep\b/, "Sept");
}

export function buildMarketingCopy({
  dateKey,
  clue,
  yesterdayAnswer,
  solvePercentage,
  postNumber = getDailyPostNumber(dateKey),
}) {
  if (!isValidDateKey(dateKey)) throw new Error("A valid puzzle date is required.");
  if (typeof clue !== "string" || !clue.trim()) throw new Error("Today’s clue is required.");
  if (typeof yesterdayAnswer !== "string" || !yesterdayAnswer.trim()) {
    throw new Error("Yesterday’s answer is required.");
  }

  const solved = Number.isInteger(solvePercentage) && solvePercentage >= 0 && solvePercentage <= 100
    ? `${solvePercentage}%`
    : "—%";
  const cleanClue = clue.trim();
  const cleanAnswer = yesterdayAnswer.trim();
  const redditTitle = `Can you guess the map from the main quest step? #${postNumber}`;
  const redditBody = [
    `Yesterday’s answer: ${cleanAnswer} 🧟`,
    `Solved on The Daily Undead: ${solved} 🔎`,
    "First correct on Reddit: u/____, u/____, u/____ 👏",
    "",
    "Today’s main quest step:",
    `*${cleanClue}*`,
    "",
    "Which Treyarch Zombies map is it from?",
    "",
    "Try to get it before reading the comments 👀",
    "",
    "Drop your guess below.",
  ].join("\n");
  const discordBody = [
    `🧟 The Daily Undead - ${formatDiscordDate(dateKey)}`,
    `Yesterday’s answer: ${cleanAnswer} 🧟`,
    `Solved on The Daily Undead: ${solved} 🔎`,
    "First correct here: @____, @____, @____ 👏",
    "",
    "Today’s main quest step:",
    cleanClue,
    "",
    "**Think you know the map?** Drop your guess below 👇",
    "",
    "Need another clue, or want to lock in your answer on the official website?",
    "🔗 <https://thedailyundead.com/>",
    "",
    "📱 Tip: Open the game in your normal browser (Safari/Chrome) rather than an in-app browser so your rounds, points and progress stay saved in the same place.",
  ].join("\n");

  return { redditTitle, redditBody, discordBody, solved };
}
