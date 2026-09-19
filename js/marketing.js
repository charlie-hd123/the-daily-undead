import {
  buildDailyPuzzle,
  getAnswerDisplayTitle,
  getUtcDateKey,
} from "./game-core.js?v=20260919-1";
import { fetchCommunityStats } from "./community-stats.js?v=20260817-1";
import {
  buildMarketingCopy,
  formatPackDate,
  getDailyPostNumber,
  getPreviousDateKey,
  isAppleMobileDevice,
} from "./marketing-core.js?v=20260910-2";

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
  const indexResponse = await fetch("./data/maps/index.json", { cache: "no-store" });
  if (!indexResponse.ok) throw new Error("Could not load the map index.");
  const catalog = await indexResponse.json();
  if (!Array.isArray(catalog.maps)) throw new Error("The map index is invalid.");

  const maps = await Promise.all(
    catalog.maps.map(async (filename) => {
      const response = await fetch(`./data/maps/${filename}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Could not load ${filename}.`);
      return response.json();
    }),
  );
  return { catalog, maps };
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load the image template."));
    image.src = source;
  });
}

function erasePreviousClue(context) {
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width } = image;
  const left = 98;
  const right = 1156;
  const top = 523;
  const bottom = 672;
  const sampleTop = 514;
  const sampleBottom = 682;

  for (let y = top; y <= bottom; y += 1) {
    const ratio = (y - top) / (bottom - top);
    for (let x = left; x <= right; x += 1) {
      const target = (y * width + x) * 4;
      const upper = (sampleTop * width + x) * 4;
      const lower = (sampleBottom * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        data[target + channel] = Math.round(
          data[upper + channel] * (1 - ratio) + data[lower + channel] * ratio,
        );
      }
      data[target + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);
}

function wrapText(context, text, maximumWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maximumWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fitClue(context, clue) {
  for (let fontSize = 45; fontSize >= 31; fontSize -= 1) {
    context.font = `500 ${fontSize}px Barlow`;
    const lines = wrapText(context, clue, 1010);
    const lineHeight = Math.round(fontSize * 1.48);
    if (lines.length <= 3 && lines.length * lineHeight <= 148) {
      return { fontSize, lineHeight, lines };
    }
  }

  context.font = "500 31px Barlow";
  return { fontSize: 31, lineHeight: 46, lines: wrapText(context, clue, 1010).slice(0, 3) };
}

async function drawDailyImage(clue) {
  await document.fonts.load("500 45px Barlow");
  const template = await loadImage("./assets/marketing-template.jpg?v=20260910-1");
  const context = canvas.getContext("2d", { alpha: false });
  context.drawImage(template, 0, 0, canvas.width, canvas.height);
  erasePreviousClue(context);

  const fitted = fitClue(context, clue);
  const visualHeight = fitted.fontSize + (fitted.lines.length - 1) * fitted.lineHeight;
  const blockTop = 596 - visualHeight / 2;
  context.font = `500 ${fitted.fontSize}px Barlow`;
  context.fillStyle = "#f1f4f8";
  context.textBaseline = "top";
  context.textAlign = "left";
  fitted.lines.forEach((line, index) => {
    context.fillText(line, 122, blockTop + index * fitted.lineHeight);
  });
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
    const [now, { catalog, maps }] = await Promise.all([getTrustedNow(), loadPuzzleData()]);
    const dateKey = getUtcDateKey(now);
    const postNumber = getDailyPostNumber(dateKey);
    const puzzle = buildDailyPuzzle(dateKey, maps);
    const yesterdayPuzzle = buildDailyPuzzle(getPreviousDateKey(dateKey), maps);
    const yesterdayAnswer = getAnswerDisplayTitle(yesterdayPuzzle.map, catalog.answerEquivalents);
    const clue = puzzle.displayedSteps[0].hardClue;
    let solvePercentage = null;
    let statsWarning = "";

    try {
      const stats = await fetchCommunityStats({
        apiUrl: document.querySelector('meta[name="daily-undead-stats-api"]').content,
        puzzleDate: dateKey,
      });
      solvePercentage = stats?.yesterday?.solvePercentage;
      if (!Number.isInteger(solvePercentage)) {
        statsWarning = "Yesterday’s solve percentage is not available yet, so the text shows —%.";
      }
    } catch {
      statsWarning = "The statistics service could not be reached, so the text shows —%. Refresh before posting.";
    }

    const copy = buildMarketingCopy({
      dateKey,
      clue,
      yesterdayAnswer,
      solvePercentage,
      postNumber,
    });
    await drawDailyImage(clue);

    packDate.textContent = formatPackDate(dateKey);
    roundBadge.textContent = `#${postNumber}`;
    redditTitle.value = copy.redditTitle;
    redditBody.value = copy.redditBody;
    discordBody.value = copy.discordBody;
    downloadFilename = `daily-undead-${dateKey}.png`;
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
