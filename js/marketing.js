import {
  buildDailyPuzzle,
  getAnswerDisplayTitle,
  getUtcDateKey,
} from "./game-core.js?v=20261025-1";
import { getOfficialPuzzleType } from "./daily-challenge-core.js?v=20261025-1";
import { buildDailyWordPuzzle } from "./word-puzzle-core.js?v=20261025-1";
import { buildDailyBloodTiesPuzzle } from './blood-ties-core.js?v=20261025-1';
import { fetchCommunityStats } from "./community-stats.js?v=20261025-1";
import {
  buildMarketingCopy,
  buildWordMarketingCopy,
  buildBloodMarketingCopy,
  formatPackDate,
  getDailyPostNumber,
  getPreviousDateKey,
  isAppleMobileDevice,
} from "./marketing-core.js?v=20261025-1";

import { drawMarketingImage } from "./marketing-art.js?v=20261025-1";

const pack = document.querySelector("#marketing-pack");
const packDate = document.querySelector("#pack-date");
const roundBadge = document.querySelector("#round-badge");
const canvas = document.querySelector("#marketing-image");
const downloadButton = document.querySelector("#download-image");
const redditTitle = document.querySelector("#reddit-title");
const redditBody = document.querySelector("#reddit-body");
const discordBody = document.querySelector("#discord-body");
const packStatus = document.querySelector("#pack-status");
const saveHelpDialog = document.querySelector("#image-save-help");
const saveHelpPreview = document.querySelector("#image-save-preview");

let downloadFilename = "daily-undead.png";

async function getTrustedNow() {
  const requestStarted = Date.now();

  try {
    const response = await fetch(`./marketing.html?clock=${requestStarted}`, {
      method: "HEAD",
      cache: "no-store",
    });
    const serverTime = Date.parse(response.headers.get("Date"));
    if (!response.ok || Number.isNaN(serverTime)) return new Date();
    const requestFinished = Date.now();
    return new Date(serverTime + (requestFinished - requestStarted) / 2);
  } catch {
    return new Date();
  }
}

async function loadPuzzleData() {
  const [indexResponse, wordResponse] = await Promise.all([
    fetch("./data/maps/index.json", { cache: "no-store" }),
    fetch("./data/word-puzzle-demo.json", { cache: "no-store" }),
  ]);
  if (!indexResponse.ok || !wordResponse.ok) {
    throw new Error("Could not load the puzzle catalogues.");
  }
  const catalog = await indexResponse.json();
  const wordBank = await wordResponse.json();
  if (!Array.isArray(catalog.maps)) throw new Error("The map index is invalid.");
  if (!Array.isArray(wordBank.words)) throw new Error("The word catalogue is invalid.");

  const maps = await Promise.all(
    catalog.maps.map(async (filename) => {
      const response = await fetch(`./data/maps/${filename}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Could not load ${filename}.`);
      return response.json();
    }),
  );
  return { catalog, maps, wordEntries: wordBank.words };
}

async function copyText(button, target) {
  try {
    await navigator.clipboard.writeText(target.value);
  } catch {
    target.focus();
    target.select();
    document.execCommand("copy");
    target.setSelectionRange(0, 0);
  }

  const originalLabel = button.textContent;
  button.textContent = "Copied";
  window.setTimeout(() => {
    button.textContent = originalLabel;
  }, 1600);
}

function getImageDataUrl() {
  return canvas.toDataURL("image/png");
}

function createImageFile(dataUrl) {
  const encodedImage = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const decodedImage = window.atob(encodedImage);
  const bytes = new Uint8Array(decodedImage.length);

  for (let index = 0; index < decodedImage.length; index += 1) {
    bytes[index] = decodedImage.charCodeAt(index);
  }

  return new File([bytes], downloadFilename, { type: "image/png" });
}

function showImageSaveHelp(dataUrl) {
  saveHelpPreview.src = dataUrl;
  if (typeof saveHelpDialog.showModal === "function") {
    saveHelpDialog.showModal();
  } else {
    saveHelpDialog.setAttribute("open", "");
  }
  packStatus.textContent = "Press and hold the image, then choose Save to Photos.";
  packStatus.dataset.tone = "warning";
}

function downloadImage(dataUrl) {
  const link = document.createElement("a");
  link.download = downloadFilename;
  link.href = dataUrl;
  link.click();
}

async function saveImage() {
  const dataUrl = getImageDataUrl();

  if (!isAppleMobileDevice(navigator)) {
    downloadImage(dataUrl);
    packStatus.textContent = "Image downloaded.";
    packStatus.dataset.tone = "ready";
    return;
  }

  try {
    const file = createImageFile(dataUrl);
    const shareData = { files: [file], title: "The Daily Undead" };

    if (typeof navigator.share !== "function" ||
        (typeof navigator.canShare === "function" && !navigator.canShare(shareData))) {
      showImageSaveHelp(dataUrl);
      return;
    }

    packStatus.textContent = "Choose Save Image to add it to Photos.";
    packStatus.dataset.tone = "ready";
    await navigator.share(shareData);
  } catch (error) {
    if (error?.name === "AbortError") {
      packStatus.textContent = "Image not saved. Tap the button to try again.";
      packStatus.dataset.tone = "warning";
      return;
    }
    console.error(error);
    showImageSaveHelp(dataUrl);
  }
}

function enableActions() {
  downloadButton.disabled = false;
  if (isAppleMobileDevice(navigator)) {
    downloadButton.textContent = "Save image to Photos";
  }
  document.querySelectorAll("[data-copy-target]").forEach((button) => {
    const target = document.querySelector(`#${button.dataset.copyTarget}`);
    button.addEventListener("click", () => copyText(button, target));
  });

  downloadButton.addEventListener("click", saveImage);
}

async function initialise() {
  try {
    const [now, { catalog, maps, wordEntries }] = await Promise.all([
      getTrustedNow(),
      loadPuzzleData(),
    ]);
    const dateKey = getUtcDateKey(now);
    const yesterdayDateKey = getPreviousDateKey(dateKey);
    const bloodTies = ['local', 'staging'].includes(document.querySelector('meta[name="daily-undead-environment"]')?.content);
    const puzzleType = getOfficialPuzzleType(dateKey, { bloodTies });
    const yesterdayPuzzleType = getOfficialPuzzleType(yesterdayDateKey, { bloodTies });
    const yesterdayPuzzleName = { word: 'Last Words', easter: 'Quest Steps', blood: 'Blood Ties' }[yesterdayPuzzleType];
    const postNumber = getDailyPostNumber(dateKey);
    const puzzle = buildDailyPuzzle(dateKey, maps);
    const wordPuzzle = buildDailyWordPuzzle(dateKey, wordEntries);
    const yesterdayAnswer = yesterdayPuzzleType === 'blood'
      ? buildDailyBloodTiesPuzzle(yesterdayDateKey).groups.map((g) => `${g.name}: ${g.answers.join(', ')}`).join('\n')
      : yesterdayPuzzleType === "word"
      ? buildDailyWordPuzzle(yesterdayDateKey, wordEntries).entry.answer
      : getAnswerDisplayTitle(
        buildDailyPuzzle(yesterdayDateKey, maps).map,
        catalog.answerEquivalents,
      );
    const clue = puzzle.displayedSteps[0].hardClue;
    let solvePercentage = null;
    let statsWarning = "";

    try {
      const stats = await fetchCommunityStats({
        apiUrl: document.querySelector('meta[name="daily-undead-stats-api"]').content,
        puzzleDate: dateKey,
      });
      solvePercentage = stats?.yesterday?.[yesterdayPuzzleType]?.solvePercentage;
      if (yesterdayPuzzleType === "easter" && !Number.isInteger(solvePercentage)) {
        solvePercentage = stats?.yesterday?.solvePercentage;
      }
      if (!Number.isInteger(solvePercentage)) {
        statsWarning = "Yesterday’s solve percentage is not available yet, so the text shows —%.";
      }
    } catch {
      statsWarning = "The statistics service could not be reached, so the text shows —%. Refresh before posting.";
    }

    const copy = puzzleType === 'blood' ? buildBloodMarketingCopy({ dateKey, yesterdayAnswer, yesterdayPuzzleName, solvePercentage }) : puzzleType === "word"
      ? buildWordMarketingCopy({
        dateKey,
        answer: wordPuzzle.entry.answer,
        initialLetters: wordPuzzle.initialLetters,
        category: wordPuzzle.entry.category,
        yesterdayAnswer,
        yesterdayPuzzleName,
        solvePercentage,
      })
      : buildMarketingCopy({
        dateKey,
        clue,
        yesterdayAnswer,
        yesterdayPuzzleName,
        solvePercentage,
      });
    const imagePuzzle = puzzleType === 'blood'
      ? buildDailyBloodTiesPuzzle(dateKey)
      : puzzleType === 'word'
      ? { answer: wordPuzzle.entry.answer, initialLetters: wordPuzzle.initialLetters, category: wordPuzzle.entry.category }
      : { clue };
    await drawMarketingImage(canvas, puzzleType, imagePuzzle);

    packDate.textContent = formatPackDate(dateKey);
    roundBadge.textContent = `#${postNumber}`;
    redditTitle.value = copy.redditTitle;
    redditBody.value = copy.redditBody;
    discordBody.value = copy.discordBody;
    const puzzleSlug = { word: 'last-words', easter: 'quest-steps', blood: 'blood-ties' }[puzzleType];
    downloadFilename = `daily-undead-${puzzleSlug}-${dateKey}.png`;
    packStatus.textContent = statsWarning || "Today’s image and text are ready.";
    packStatus.dataset.tone = statsWarning ? "warning" : "ready";
    pack.setAttribute("aria-busy", "false");
    enableActions();
  } catch (error) {
    console.error(error);
    packStatus.textContent = "Today’s pack could not be prepared. Refresh the page and try again.";
    packStatus.dataset.tone = "error";
    pack.setAttribute("aria-busy", "false");
  }
}

initialise();
