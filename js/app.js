import { browserStorage } from "./browser-storage.js?v=20261025-3";
import { buildDailyBloodTiesPuzzle, createBloodTiesSession, normalizeBloodTiesSession, replayBloodTiesAttempts } from './blood-ties-core.js?v=20261025-3';
import { renderBloodTiesGroup, renderBloodTiesView } from './blood-ties-view.js?v=20261025-3';
import { rememberPlayDestination, restorePlayDestination } from "./play-destination.js?v=20261025-3";
import {
  buildDailyPuzzle,
  calculateBonusPoints,
  calculateMapPoints,
  calculateNextStreak,
  getAnswerDisplayTitle,
  getMillisecondsUntilNextUtcDay,
  getUtcDateKey,
  isAcceptedMapSelection,
  isCorrectOrder,
  isMapAvailableOnDate,
  isValidDateKey,
  orderMapsForGame,
  toggleOrderedSelection,
} from "./game-core.js?v=20261025-3";
import {
  buildDailyWordPuzzle,
  calculateWordPoints,
  isWordSolved,
  normalizeLetter,
  shouldHandleWordShortcut,
} from "./word-puzzle-core.js?v=20261025-3";
import {
  getOfficialPuzzleType as selectOfficialPuzzleType,
  isPuzzleSessionComplete,
  MULTI_PUZZLE_LAUNCH_DATE,
} from "./daily-challenge-core.js?v=20261025-3";
import {
  canUseRequestedPreviewDate,
  getProgressionUpdateVisibility,
  isLocalDevelopmentHostname,
  isLocalPreviewHostname,
  migrateLegacyLocalScore,
  migrateStoredRoundNumbering,
  prepareMissedDayProgress,
} from "./progression.js?v=20261025-3";
import {
  confirmAccountResultSubmission,
  initialiseAccount,
} from "./account.js?v=20261025-3";
import {
  fetchCommunityStats,
  formatCommunityCount,
  formatSolvePercentage,
  resolveCommunityStatsApiUrl,
  submitCommunityAttempt,
} from "./community-stats.js?v=20261025-3";
import {
  initialiseLeaderboards,
  resolveLeaderboardsApiUrl,
} from "./leaderboards.js?v=20261025-3";
import { fetchWithTimeout } from "./network.js?v=20261025-3";
import { loadPuzzleCatalogues } from "./puzzle-catalogues.js?v=20261025-3";
import { createReleaseMonitor, readCurrentBuild } from "./release.js?v=20261025-3";
import { createSocialDemoFetch, initialiseSocialDemo } from "./social-demo.js?v=20261025-3";
import { canPreviewDays, createDayPreviewStorage } from "./day-preview.js?v=20261025-3";
import { createMysteryBox } from "./mystery-box.js?v=20261025-3";
import { initialiseGameAudio, letterSound, bloodConnectionSound } from "./game-audio.js?v=20261025-3";

const gameAudio = initialiseGameAudio(browserStorage);
const mysteryBox = createMysteryBox({
  beforeOpen: () => gameAudio.ready('mystery-box-a'),
  onOpen: () => { void gameAudio.play('mystery-box-a'); },
  onSkip: () => { void gameAudio.play('map-select'); },
  onCancel: () => gameAudio.stopCue('mystery-box-a'),
});

const app = document.querySelector("#app");
const dateLabel = document.querySelector("#puzzle-date");
const streakLabel = document.querySelector("#streak-count");
const solvesLabel = document.querySelector("#solves-count");
const scoreLabel = document.querySelector("#score-count");
const countdownLabel = document.querySelector("#next-round-countdown");
const playerStats = document.querySelector(".player-stats");
const statExplainer = document.querySelector("#player-stat-explainer");
const progressionUpdateButton = document.querySelector("#progression-update-button");
const progressionUpdateDialog = document.querySelector("#progression-update-dialog");
const leaderboardsButton = document.querySelector("#leaderboards-button");
const leaderboardsDialog = document.querySelector("#leaderboards-dialog");
const clueTemplate = document.querySelector("#clue-template");
const communityStatsContainer = document.querySelector(".community-stats");
const communityPlayersTodayLabel = document.querySelector("#community-players-today");
const communityGamesTotalLabel = document.querySelector("#community-games-total");
const communityYesterdayWordSolvedLabel = document.querySelector("#community-yesterday-word-solved");
const communityYesterdayEasterSolvedLabel = document.querySelector("#community-yesterday-easter-solved");
const communityYesterdayWordAnswerLabel = document.querySelector("#community-yesterday-word-answer");
const communityYesterdayEasterAnswerLabel = document.querySelector("#community-yesterday-easter-answer");
const yesterdayCommunityResults = [...document.querySelectorAll("[data-community-puzzle]")];
const isLocalDevelopment = isLocalDevelopmentHostname(window.location.hostname);
const isLocalPreview = canPreviewDays(window.location.hostname, document.querySelector('meta[name="daily-undead-environment"]')?.content, isLocalPreviewHostname(window.location.hostname));
const bloodTiesEnabled = isLocalPreview;
const getOfficialPuzzleType = (dateKey) => selectOfficialPuzzleType(dateKey, { bloodTies: bloodTiesEnabled });
if (bloodTiesEnabled) {
  const article = document.createElement('article');
  article.className = 'community-result'; article.dataset.communityPuzzle = 'blood'; article.hidden = true;
  article.innerHTML = '<div class="community-result-copy"><div class="community-result-title"><span>Blood Ties ·</span><em data-yesterday-round-badge>Yesterday’s round</em></div><button class="community-answer-button" id="community-yesterday-blood-open" type="button" aria-haspopup="dialog">View connections ›</button></div><div class="community-result-rate"><strong id="community-yesterday-blood-solved">—</strong><span>solved</span></div>';
  document.querySelector('.community-result-grid')?.append(article);
  yesterdayCommunityResults.push(article);
  const dialog = document.createElement('dialog');
  dialog.className = 'account-dialog blood-yesterday-dialog';
  dialog.setAttribute('aria-labelledby', 'blood-yesterday-title');
  dialog.innerHTML = '<button class="dialog-close" type="button" aria-label="Close yesterday’s connections">×</button><p class="kicker">Yesterday’s round</p><h2 id="blood-yesterday-title">Blood Ties</h2><p class="helper-text" id="blood-yesterday-date"></p><div class="blood-solved" id="community-yesterday-blood-answer"></div>';
  document.body.append(dialog);
  article.querySelector('button').addEventListener('click', () => dialog.showModal());
  dialog.querySelector('button').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) { const bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close(); } });
}
// Direct local file servers skip the environment build that normally adds these links.
if (isLocalPreview && !document.querySelector("#advance-dev-day")) {
  const footerCopy = document.querySelector(".site-footer > p");
  for (const [id, label] of [["advance-dev-day", "ADVANCE A DAY"], ["return-dev-today", "RETURN TO TODAY"]]) {
    const button = document.createElement("button");
    button.id = id;
    button.className = "dev-day-button";
    button.type = "button";
    button.hidden = true;
    button.textContent = label;
    footerCopy?.append(document.createTextNode(" "), button);
  }
}
const advanceDevDayButton = document.querySelector("#advance-dev-day");
const returnDevTodayButton = document.querySelector("#return-dev-today");
let dayPreviewEnabled = false;
let localStorage = browserStorage;
const socialDemoEnabled = isLocalDevelopment && new URLSearchParams(window.location.search).get("socialDemo") === "1";
const currentBuild = readCurrentBuild();
const communityStatsApiUrl = resolveCommunityStatsApiUrl({ isLocalDevelopment });
const leaderboardsApiUrl = resolveLeaderboardsApiUrl({ isLocalDevelopment });
const streakStorageKey = "the-daily-undead:streak";
const roundNumberingStorageKey = "the-daily-undead:round-numbering";
const solvesStorageKey = "the-daily-undead:total-rounds";
const scoreStorageKey = "the-daily-undead:score";
const legacyPointsStorageKey = "the-daily-undead:total-points";
const legacyScoreMigrationStorageKey = "the-daily-undead:legacy-score-migration";
const puzzleStatsStorageKey = "the-daily-undead:puzzle-stats-v1";
const multiPuzzleDayStoragePrefix = "the-daily-undead:multi-puzzle-day:";
const progressionUpdateStorageKey = "the-daily-undead:progression-update-v2";
const statExplainers = {
  round: {
    title: "Round",
    copy: "Your current survival run. It advances after each solve and ends if you miss a day or answer incorrectly.",
  },
  score: {
    title: "Score",
    copy: "Your permanent lifetime total. Points earned in each puzzle are added to Score, which never decreases or resets.",
  },
  solves: {
    title: "Solves",
    copy: "The total number of Daily Undead puzzles you’ve solved.",
  },
};
const lastPlayedDateStorageKey = "the-daily-undead:last-played-date";
const missedDayStorageKey = "the-daily-undead:missed-day";
const bestRoundStorageKey = "the-daily-undead:best-round";
const devPreviewStorageKey = "the-daily-undead:dev-preview";
const currentStateVersion = 10;
const supportedStateVersions = new Set([2, 3, 4, 5, 6, 7, 8, 9, currentStateVersion]);
const progressNumberFormatter = new Intl.NumberFormat("en-GB");

function getLeaderboardUsername() {
  if (accountController.profile?.username) return accountController.profile.username;
  if (!isLocalDevelopment) return null;
  const previewUsername = new URLSearchParams(window.location.search).get("leaderboardUser");
  return /^[A-Za-z0-9_]{3,16}$/.test(previewUsername || "") ? previewUsername : null;
}

let catalog;
let maps;
let selectableMaps;
let puzzle;
let wordEntries;
let wordPuzzle;
let bloodPuzzle;
let dayState;
let activePlay = null;
let state;
let streakCount = 0;
let bestRound = 0;
let solves = 0;
let score = 0;
let protectedDates = [];
let lastPlayedDate = null;
let missedDayState = null;
let lastResultClass = null;
let clockOffset = 0;
let liveDateKey;
let activeScreenKey = null;
let pendingFocusSelector = null;
let bonusSubmissionPending = false;
let releaseMonitoringStarted = false;
let accountController = {
  signedIn: false,
  canSync: false,
  resultSubmissionRequiresSignIn: false,
  openAccountAccess() {},
  requestResultSignIn() {},
  scheduleSave() {},
  async recordMapResult() { return null; },
  async recordBonusResult() { return null; },
  async recordWordResult() { return null; },
  async recordBloodResult() { return null; },
};

function preserveProgressBeforeReleaseReload() {
  if (puzzle && state) saveState();
}

const releaseMonitor = createReleaseMonitor({
  currentBuild,
  currentUrl: window.location.href,
  beforeReload: preserveProgressBeforeReleaseReload,
});

function checkForReleaseUpdate({ force = false } = {}) {
  if (isLocalDevelopment || bonusSubmissionPending) return Promise.resolve(false);
  return releaseMonitor.check({ force });
}

function initialiseReleaseMonitoring() {
  if (releaseMonitoringStarted || isLocalDevelopment) return;
  releaseMonitoringStarted = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void checkForReleaseUpdate();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) void checkForReleaseUpdate({ force: true });
  });
  window.setInterval(() => void checkForReleaseUpdate(), 30 * 60 * 1000);
}

const puzzleTypes = {
  easter: {
    name: "Quest Steps",
    kicker: "Easter egg puzzle",
    description: "Can you identify the Zombies map from its Easter egg steps?",
    image: "./assets/quest-steps-card.svg?v=20261025-3",
  },
  word: {
    name: "Last Words",
    kicker: "Letter puzzle",
    description: "Can you identify the Zombies word or phrase by revealing its letters?",
    image: "./assets/dead-letters-card.svg?v=20261025-3",
  },
};
if (bloodTiesEnabled) puzzleTypes.blood = {
  name: 'Blood Ties', kicker: 'Connection puzzle',
  description: 'Can you uncover the hidden Zombies connections?',
  image: './assets/blood-ties-card.svg?v=20261025-3',
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function punctuateSentenceEnding(value) {
  const text = String(value || "");
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function formatWordMisses(count) {
  if (count === 0) return "no misses";
  return `${count} ${count === 1 ? "miss" : "misses"}`;
}

function getDateKey() {
  const currentDateKey = getUtcDateKey(getCurrentTime());
  const searchParams = new URLSearchParams(window.location.search);
  const previewDate = searchParams.get("date");
  if (!previewDate || !isValidDateKey(previewDate)) return currentDateKey;

  let isAuthorized = false;
  try {
    const savedAuthorization = JSON.parse(sessionStorage.getItem(devPreviewStorageKey));
    isAuthorized =
      isLocalPreview &&
      savedAuthorization?.dateKey === previewDate &&
      savedAuthorization?.token === searchParams.get("devPreview");
  } catch {
    // An unavailable session store simply disables future-date previews.
  }

  if (canUseRequestedPreviewDate(previewDate, currentDateKey, isAuthorized)) {
    return previewDate;
  }

  searchParams.delete("date");
  searchParams.delete("devPreview");
  const query = searchParams.toString();
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
  );
  return currentDateKey;
}

initialiseLeaderboards({
  apiUrl: leaderboardsApiUrl,
  button: leaderboardsButton,
  dialog: leaderboardsDialog,
  getPuzzleDate: getDateKey,
  getCurrentUsername: getLeaderboardUsername,
  onSelectPlayer: (username) => accountController.openPlayerProfile?.(username),
  fetchImpl: socialDemoEnabled ? createSocialDemoFetch() : globalThis.fetch,
});

function getCurrentTime() {
  return new Date(Date.now() + clockOffset);
}

async function synchroniseClock() {
  const requestStarted = Date.now();

  try {
    const response = await fetchWithTimeout(
      `./index.html?clock=${requestStarted}`,
      { method: "HEAD", cache: "no-store" },
    );
    const serverTime = Date.parse(response.headers.get("Date"));
    if (!response.ok || Number.isNaN(serverTime)) return;

    const requestFinished = Date.now();
    clockOffset = serverTime + (requestFinished - requestStarted) / 2 - requestFinished;
  } catch {
    // The device clock is a safe fallback if the host time cannot be read.
  }
}

function formatCountdown(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function updateNextRoundCountdown() {
  const now = getCurrentTime();
  const millisecondsRemaining = getMillisecondsUntilNextUtcDay(now);
  const formattedCountdown = formatCountdown(millisecondsRemaining);
  const countdownAriaLabel = `${Math.ceil(millisecondsRemaining / 1000)} seconds until the next round`;

  countdownLabel.textContent = formattedCountdown;
  countdownLabel.setAttribute("aria-label", countdownAriaLabel);
  const endScreenCountdown = document.querySelector("#end-screen-countdown");
  if (endScreenCountdown) {
    endScreenCountdown.textContent = formattedCountdown;
    endScreenCountdown.setAttribute("aria-label", countdownAriaLabel);
  }

  const isPreview = new URLSearchParams(window.location.search).has("date");
  if (!isPreview && liveDateKey && getUtcDateKey(now) !== liveDateKey) {
    window.location.reload();
  }
}

function formatDate(dateKey) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${dateKey}T12:00:00`));
}

function formatLongDate(dateKey) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${dateKey}T12:00:00`));
}

function updatePuzzleDateDisplay(dateKey) {
  const previewSuffix = new URLSearchParams(window.location.search).has("date") ? " · Preview" : "";
  const shortDate = document.createElement("span");
  const longDate = document.createElement("span");

  shortDate.className = "puzzle-date-short";
  shortDate.textContent = `${formatDate(dateKey)}${previewSuffix}`;
  longDate.className = "puzzle-date-long";
  longDate.textContent = `${formatLongDate(dateKey)}${previewSuffix}`;
  dateLabel.replaceChildren(shortDate, longDate);
}

function getFollowingDateKey(dateKey) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return getUtcDateKey(date);
}

function getPreviousDateKey(dateKey) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return getUtcDateKey(date);
}

function updateCommunityStatsDisplay(stats) {
  const bloodRate = document.querySelector('#community-yesterday-blood-solved');
  if (bloodRate) bloodRate.textContent = formatSolvePercentage(stats?.yesterday?.blood?.solvePercentage);
  communityPlayersTodayLabel.textContent = formatCommunityCount(stats?.playersToday);
  communityGamesTotalLabel.textContent = formatCommunityCount(stats?.totalPuzzles ?? stats?.totalGames);
  communityYesterdayWordSolvedLabel.textContent = formatSolvePercentage(stats?.yesterday?.word?.solvePercentage);
  communityYesterdayEasterSolvedLabel.textContent = formatSolvePercentage(stats?.yesterday?.easter?.solvePercentage ?? stats?.yesterday?.solvePercentage);
  if (stats?.yesterday?.word?.answerName) communityYesterdayWordAnswerLabel.textContent = stats.yesterday.word.answerName;
  if (stats?.yesterday?.easter?.answerName || stats?.yesterday?.mapName) {
    communityYesterdayEasterAnswerLabel.textContent = stats.yesterday.easter?.answerName || stats.yesterday.mapName;
  }
  communityStatsContainer.dataset.status = stats ? "ready" : "unavailable";
}

function prepareCommunityStatsDisplay() {
  const yesterdayDateKey = getPreviousDateKey(puzzle.dateKey);
  if (bloodTiesEnabled) {
    document.querySelector('#community-yesterday-blood-answer').innerHTML = buildDailyBloodTiesPuzzle(yesterdayDateKey).groups.map((g, i) => renderBloodTiesGroup(g, i, true)).join('');
    document.querySelector('#blood-yesterday-date').textContent = formatLongDate(yesterdayDateKey);
  }

  try {
    const yesterdayPuzzle = buildDailyPuzzle(yesterdayDateKey, maps);
    communityYesterdayEasterAnswerLabel.textContent = getAnswerDisplayTitle(
      yesterdayPuzzle.map,
      catalog.answerEquivalents,
    );
    communityYesterdayWordAnswerLabel.textContent = buildDailyWordPuzzle(
      yesterdayDateKey,
      wordEntries,
    ).entry.answer;
  } catch {
    communityYesterdayEasterAnswerLabel.textContent = "—";
    communityYesterdayWordAnswerLabel.textContent = "—";
  }
  const yesterdayOfficialType = getOfficialPuzzleType(yesterdayDateKey);
  yesterdayCommunityResults.forEach((result) => {
    const official = result.dataset.communityPuzzle === yesterdayOfficialType;
    result.hidden = !official;
    result.classList.toggle("is-official", official);
    const badge = result.querySelector("[data-yesterday-round-badge]");
    if (badge) badge.hidden = !official;
  });

  if (!communityStatsApiUrl) {
    updateCommunityStatsDisplay(null);
    return;
  }

  fetchCommunityStats({
    apiUrl: communityStatsApiUrl,
    puzzleDate: puzzle.dateKey,
  })
    .then(updateCommunityStatsDisplay)
    .catch(() => updateCommunityStatsDisplay(null));
}

function recordCommunityAttemptFor(type, isCorrect) {
  // Preview puzzles never contribute to the live community totals.
  if (!communityStatsApiUrl || puzzle.dateKey !== liveDateKey) return;

  const puzzleId = type === 'blood' ? bloodPuzzle.key : type === "word" ? wordPuzzle.key : puzzle.key;
  const answerId = type === 'blood' ? 'blood-ties' : type === "word" ? wordPuzzle.entry.id : puzzle.map.id;
  const answerName = type === 'blood' ? 'Four hidden connections' : type === "word" ? wordPuzzle.entry.answer : getPuzzleAnswerTitle();
  submitCommunityAttempt({
    apiUrl: communityStatsApiUrl,
    puzzleDate: puzzle.dateKey,
    puzzleType: type,
    puzzleId,
    mapId: answerId,
    mapName: answerName,
    isCorrect,
    attempts: type === 'blood' ? dayState.sessions.blood?.attempts : undefined,
    rulesVersion: type === 'blood' ? dayState.sessions.blood?.rulesVersion : undefined,
  })
    .then((stats) => {
      if (stats) updateCommunityStatsDisplay(stats);
    })
    .catch(() => {
      // A failed stats request must never interrupt or alter the game result.
    });
}

function advanceSimulatedDay() {
  const currentDateKey = puzzle?.dateKey || getDateKey();
  const nextDateKey = getFollowingDateKey(currentDateKey);
  const token = globalThis.crypto?.randomUUID?.() || String(Date.now());
  const searchParams = new URLSearchParams(window.location.search);
  try {
    sessionStorage.setItem(
      devPreviewStorageKey,
      JSON.stringify({ dateKey: nextDateKey, token }),
    );
  } catch {
    return;
  }
  searchParams.set("date", nextDateKey);
  searchParams.set("devPreview", token);
  window.location.search = searchParams.toString();
}

if (isLocalPreview && advanceDevDayButton) {
  advanceDevDayButton.hidden = false;
  advanceDevDayButton.addEventListener("click", advanceSimulatedDay);
  if (returnDevTodayButton) {
    returnDevTodayButton.hidden = !new URLSearchParams(window.location.search).has("date");
    returnDevTodayButton.addEventListener("click", () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("date");
      url.searchParams.delete("devPreview");
      url.searchParams.delete('previewRun');
      sessionStorage.removeItem(devPreviewStorageKey);
      window.location.assign(url.href);
    });
  }
} else {
  advanceDevDayButton?.remove();
  returnDevTodayButton?.remove();
}

function validateMap(map, source) {
  // When adding a new answer map, set availableFrom to a future UTC date, not today.
  const requiredStrings = ["id", "gameId", "gameTitle", "title", "availableFrom"];
  const missingField = requiredStrings.find((field) => typeof map[field] !== "string" || !map[field]);

  if (
    missingField ||
    !isValidDateKey(map.availableFrom) ||
    !Array.isArray(map.steps) ||
    map.steps.length < 3
  ) {
    throw new Error(`Invalid map data in ${source}.`);
  }

  const stepIds = new Set();
  const stepOrders = new Set();
  for (const step of map.steps) {
    if (
      typeof step.id !== "string" ||
      !step.id ||
      !Number.isInteger(step.order) ||
      step.order < 1 ||
      typeof step.hardClue !== "string" ||
      !step.hardClue ||
      typeof step.clue !== "string" ||
      !step.clue ||
      stepIds.has(step.id) ||
      stepOrders.has(step.order)
    ) {
      throw new Error(`Invalid step data in ${source}.`);
    }
    stepIds.add(step.id);
    stepOrders.add(step.order);
  }

  const hasConsecutiveOrders = [...stepOrders]
    .sort((left, right) => left - right)
    .every((order, index) => order === index + 1);
  if (!hasConsecutiveOrders) {
    throw new Error(`Invalid step order in ${source}.`);
  }

  return map;
}

async function loadData() {
  const loaded = await loadPuzzleCatalogues();
  catalog = loaded.catalog;
  const wordBank = loaded.wordBank;
  wordEntries = Array.isArray(wordBank.words) ? wordBank.words : [];
  if (!Array.isArray(catalog.games) || !Array.isArray(catalog.maps)) {
    throw new Error("The map index is invalid.");
  }

  const gameTitles = new Map(catalog.games.map((game) => [game.id, game.title]));
  if (gameTitles.size !== catalog.games.length) {
    throw new Error("The map index contains a duplicate game id.");
  }

  maps = loaded.maps.map((map, index) => validateMap(map, catalog.maps[index]));
  for (const map of maps) {
    if (gameTitles.get(map.gameId) !== map.gameTitle) {
      throw new Error(`Invalid game details for ${map.id}.`);
    }
  }
  const selectionOnlyMaps = (catalog.selectionOnlyMaps || []).map((map) => {
    const gameTitle = gameTitles.get(map.gameId);
    if (!map.id || !map.title || !gameTitle || !isValidDateKey(map.releaseDate)) {
      throw new Error(`Invalid selectable-only map data for ${map.id || "an unknown map"}.`);
    }
    return { ...map, gameTitle, selectionOnly: true };
  });
  const selectableIds = [...maps, ...selectionOnlyMaps].map((map) => map.id);
  if (new Set(selectableIds).size !== selectableIds.length) {
    throw new Error("The selectable map catalogue contains a duplicate map id.");
  }
  selectableMaps = [...maps, ...selectionOnlyMaps];
}

function populateProfileDropdowns() {
  const form = document.querySelector("#profile-editor-form");
  const gameSelect = form?.elements.favouriteGame;
  const mapSelect = form?.elements.favouriteMap;
  if (!gameSelect || !mapSelect) return;

  const gamePlaceholder = document.createElement("option");
  gamePlaceholder.value = "";
  gamePlaceholder.hidden = true;
  gameSelect.replaceChildren(gamePlaceholder);
  catalog.games
    .slice()
    .sort((left, right) => left.releaseOrder - right.releaseOrder)
    .forEach((game) => {
      const option = document.createElement("option");
      option.value = game.title;
      option.textContent = game.title;
      gameSelect.append(option);
    });

  const mapPlaceholder = document.createElement("option");
  mapPlaceholder.value = "";
  mapPlaceholder.hidden = true;
  mapSelect.replaceChildren(mapPlaceholder);
  catalog.games
    .slice()
    .sort((left, right) => left.releaseOrder - right.releaseOrder)
    .forEach((game) => {
      const mapOrder = new Map(
        (catalog.mapOrder?.[game.id] || []).map((mapId, index) => [mapId, index]),
      );
      const groupMaps = selectableMaps
        .filter((map) => map.gameId === game.id)
        .sort((left, right) => (mapOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER)
          - (mapOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER));
      if (!groupMaps.length) return;
      const group = document.createElement("optgroup");
      group.label = game.title;
      groupMaps.forEach((map) => {
        const option = document.createElement("option");
        option.value = map.title;
        option.textContent = map.title;
        group.append(option);
      });
      mapSelect.append(group);
    });
}

function initialiseProfileScrollbars() {
  document.querySelectorAll("[data-profile-scrollbar]").forEach((track) => {
    const picker = track.previousElementSibling;
    const thumb = track.firstElementChild;
    if (!picker || !thumb) return;

    const update = () => {
      const trackWidth = track.clientWidth;
      const maxScroll = Math.max(0, picker.scrollWidth - picker.clientWidth);
      const thumbWidth = maxScroll
        ? Math.max(36, trackWidth * (picker.clientWidth / picker.scrollWidth))
        : trackWidth;
      const maxOffset = Math.max(0, trackWidth - thumbWidth);
      const offset = maxScroll ? (picker.scrollLeft / maxScroll) * maxOffset : 0;
      thumb.style.width = `${thumbWidth}px`;
      thumb.style.transform = `translateX(${offset}px)`;
    };

    picker.addEventListener("scroll", update, { passive: true });
    new ResizeObserver(update).observe(picker);
    new MutationObserver(update).observe(picker, { childList: true });
    update();
  });
}

function createInitialState() {
  return {
    stateVersion: currentStateVersion,
    puzzleKey: puzzle.key,
    phase: "clues",
    cluesRevealed: 1,
    lockedClues: null,
    selectedGameId: null,
    selectedMapId: null,
    isCorrect: null,
    bonusOrder: [],
    bonusComplete: false,
    bonusFailed: false,
    newBestRound: false,
    streakRecorded: false,
    totalRoundsRecorded: false,
    roundsSurvivedBeforeLoss: 0,
    mapPoints: 0,
    bonusPoints: 0,
    pointsRecorded: false,
    bonusPointsRecorded: false,
    complete: false,
    success: null,
    points: 0,
    summary: null,
  };
}

function storageKey() {
  return `dead-drop:${puzzle.dateKey}`;
}

function createWordSession() {
  return {
    key: wordPuzzle.key,
    guesses: [],
    wrongGuesses: 0,
    correctStreak: 0,
    lastGuess: null,
    pendingResult: null,
    complete: false,
    success: null,
    points: 0,
    summary: null,
  };
}

function createDayState(easterSession = createInitialState()) {
  const legacyFinished = getOfficialPuzzleType(puzzle.dateKey) === 'easter' && easterSession.phase === "result"
    && (!easterSession.isCorrect || easterSession.bonusComplete || easterSession.bonusFailed);
  const legacyPoints = Number(easterSession.mapPoints || 0) + Number(easterSession.bonusPoints || 0);
  return {
    dayStateVersion: 1,
    dateKey: puzzle.dateKey,
    officialType: getOfficialPuzzleType(puzzle.dateKey),
    officialCompleted: legacyFinished,
    officialResult: legacyFinished
      ? { type: "easter", puzzleType: "easter", success: Boolean(easterSession.isCorrect), points: legacyPoints }
      : null,
    progressionApplied: Boolean(easterSession.streakRecorded),
    lastCompleted: legacyFinished
      ? { type: "easter", mode: "official", success: Boolean(easterSession.isCorrect), points: legacyPoints }
      : null,
    sessions: {
      easter: easterSession,
      word: null,
      blood: null,
    },
  };
}

function isMultiPuzzleDayState(value) {
  return value?.dayStateVersion === 1 && value.dateKey === puzzle.dateKey;
}

function normalizeWordSession(value) {
  if (!value || value.key !== wordPuzzle.key) return null;
  return {
    ...createWordSession(),
    ...value,
    guesses: Array.isArray(value.guesses)
      ? value.guesses.map(normalizeLetter).filter(Boolean).slice(0, 26)
      : [],
    wrongGuesses: Math.min(5, Math.max(0, Number(value.wrongGuesses) || 0)),
  };
}

function normalizeDayState(value, fallbackEaster = createInitialState()) {
  if (!isMultiPuzzleDayState(value)) return createDayState(fallbackEaster);
  const easterSession = value.sessions?.easter?.puzzleKey === puzzle.key
    ? { ...createInitialState(), ...value.sessions.easter, stateVersion: currentStateVersion }
    : fallbackEaster;
  return {
    ...createDayState(easterSession),
    ...value,
    officialType: getOfficialPuzzleType(puzzle.dateKey),
    sessions: {
      // A stored developer preview may predate the three-game rotation.
      easter: easterSession,
      word: normalizeWordSession(value.sessions?.word),
      blood: bloodTiesEnabled ? normalizeBloodTiesSession(bloodPuzzle, value.sessions?.blood) : null,
    },
    ...(value.officialType !== getOfficialPuzzleType(puzzle.dateKey) ? { officialCompleted: false, officialResult: null, progressionApplied: false } : {}),
  };
}

function loadPuzzleStats() {
  try {
    const saved = JSON.parse(localStorage.getItem(puzzleStatsStorageKey));
    const safe = (type) => ({
      score: Math.max(0, Number(saved?.[type]?.score) || 0),
      solves: Math.max(0, Number(saved?.[type]?.solves) || 0),
      plays: Math.max(0, Number(saved?.[type]?.plays) || 0),
    });
    return { easter: safe("easter"), word: safe("word"), blood: safe('blood') };
  } catch {
    return {
      easter: { score: 0, solves: 0, plays: 0 },
      word: { score: 0, solves: 0, plays: 0 },
      blood: { score: 0, solves: 0, plays: 0 },
    };
  }
}

let puzzleStats = {
  easter: { score: 0, solves: 0, plays: 0 },
  word: { score: 0, solves: 0, plays: 0 },
};

function savePuzzleStats() {
  try {
    localStorage.setItem(puzzleStatsStorageKey, JSON.stringify(puzzleStats));
  } catch {
    // Per-puzzle attribution is supplementary; permanent progression remains intact.
  }
}

function loadMultiPuzzleDayState(legacyEasterState) {
  try {
    const saved = JSON.parse(localStorage.getItem(`${multiPuzzleDayStoragePrefix}${puzzle.dateKey}`));
    return normalizeDayState(saved, legacyEasterState);
  } catch {
    return createDayState(legacyEasterState);
  }
}

function ensureSession(type) {
  if (type === 'blood') {
    dayState.sessions.blood ||= createBloodTiesSession(bloodPuzzle);
    return dayState.sessions.blood;
  }
  if (type === "easter") {
    dayState.sessions.easter = state;
    return state;
  }
  const session = normalizeWordSession(dayState.sessions.word) || createWordSession();
  dayState.sessions.word = session;
  return session;
}

function loadStreak() {
  try {
    const savedStreak = Number.parseInt(localStorage.getItem(streakStorageKey), 10);
    return Number.isInteger(savedStreak) && savedStreak >= 1 ? savedStreak : 1;
  } catch {
    return 1;
  }
}

function loadBestRound() {
  try {
    const savedBestRound = Number.parseInt(localStorage.getItem(bestRoundStorageKey), 10);
    return Number.isInteger(savedBestRound) && savedBestRound >= 0 ? savedBestRound : 0;
  } catch {
    return 0;
  }
}

function saveBestRound() {
  try {
    localStorage.setItem(bestRoundStorageKey, String(bestRound));
  } catch {
    // The best round remains available for the current session when storage is disabled.
  }
  accountController.scheduleSave();
}

function saveStreak() {
  try {
    localStorage.setItem(streakStorageKey, String(streakCount));
  } catch {
    // The streak remains available for the current session when storage is disabled.
  }
  accountController.scheduleSave();
}

function loadSolves() {
  try {
    const savedTotal = Number.parseInt(localStorage.getItem(solvesStorageKey), 10);
    return Number.isInteger(savedTotal) && savedTotal >= 0 ? savedTotal : 0;
  } catch {
    return 0;
  }
}

function saveSolves() {
  try {
    localStorage.setItem(solvesStorageKey, String(solves));
  } catch {
    // The lifetime total remains available for the current session when storage is disabled.
  }
  accountController.scheduleSave();
}

function loadScore() {
  try {
    const savedScore = Number.parseInt(localStorage.getItem(scoreStorageKey), 10);
    const legacyBalance = Number.parseInt(localStorage.getItem(legacyPointsStorageKey), 10);
    const migratedScore = Math.max(
      Number.isInteger(savedScore) && savedScore >= 0 ? savedScore : 0,
      Number.isInteger(legacyBalance) && legacyBalance >= 0 ? legacyBalance : 0,
    );
    localStorage.setItem(scoreStorageKey, String(migratedScore));
    return migratedScore;
  } catch {
    return 0;
  }
}

function saveScore() {
  try {
    localStorage.setItem(scoreStorageKey, String(score));
  } catch {
    // The total remains available for the current session when storage is disabled.
  }
  accountController.scheduleSave();
}

function clearTemporaryLocalProgress() {
  if (!isLocalDevelopment) return;
  const hasHighNumberPreviewValues =
    streakCount === 2_300 && score === 2_000_000_000 && solves === 4_000;
  if (!hasHighNumberPreviewValues) return;

  streakCount = 0;
  score = 0;
  solves = 0;
  saveStreak();
  saveScore();
  saveSolves();
}

function loadLastPlayedDate() {
  try {
    const savedDate = localStorage.getItem(lastPlayedDateStorageKey);
    return savedDate && isValidDateKey(savedDate) ? savedDate : null;
  } catch {
    return null;
  }
}

function saveLastPlayedDate() {
  try {
    localStorage.setItem(lastPlayedDateStorageKey, lastPlayedDate);
  } catch {
    // The date remains available for the current session when storage is disabled.
  }
  accountController.scheduleSave();
}

function recordDailyParticipation(dateKey = puzzle.dateKey) {
  if (!isValidDateKey(dateKey) || (lastPlayedDate && dateKey < lastPlayedDate)) return;

  lastPlayedDate = dateKey;
  saveLastPlayedDate();
}

function loadSavedMissedDayState() {
  try {
    const saved = JSON.parse(localStorage.getItem(missedDayStorageKey));
    if (
      isValidDateKey(saved?.dateKey) &&
      Number.isInteger(saved?.missedDays) &&
      saved.missedDays > 0 &&
      Number.isInteger(saved?.roundsBeforeLoss) &&
      saved.roundsBeforeLoss >= 0
    ) {
      return saved;
    }
  } catch {
    // A corrupt or unavailable missed-day save should not prevent play.
  }

  return null;
}

function saveMissedDayState() {
  try {
    localStorage.setItem(missedDayStorageKey, JSON.stringify(missedDayState));
  } catch {
    // The missed-day prompt remains available for the current session when storage is disabled.
  }
  accountController.scheduleSave();
}

function prepareMissedDayState(dateKey) {
  const saved = loadSavedMissedDayState();
  const progression = prepareMissedDayProgress({
    savedState: saved,
    lastPlayedDate,
    dateKey,
    currentRound: streakCount,
    score,
    protectedDates,
  });

  missedDayState = progression.missedDayState;
  streakCount = progression.currentRound;
  if (progression.progressReset) {
    saveStreak();
  }
  if (progression.shouldSaveState) saveMissedDayState();
  return missedDayState;
}

async function loadProtectedDates(fromDateKey, toDateKey) {
  if (!leaderboardsApiUrl || !fromDateKey || fromDateKey >= toDateKey) return [];
  try {
    const url = new URL("/api/game-dates", leaderboardsApiUrl);
    url.searchParams.set("from", fromDateKey);
    url.searchParams.set("to", toDateKey);
    const response = await fetchWithTimeout(url, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return [];
    const result = await response.json();
    return (result.protectedDates || []).map((entry) => entry.date).filter(isValidDateKey);
  } catch {
    return [];
  }
}

function animateStat(label, amount, theme) {
  if (!Number.isInteger(amount) || amount <= 0) return;
  const display = label.closest(".stat-display");
  const reward = document.createElement("span");
  reward.className = `stat-reward-pop is-${theme}`;
  reward.textContent = `+${progressNumberFormatter.format(amount)}`;
  reward.setAttribute("aria-hidden", "true");
  display.append(reward);
  display.classList.add("has-floating-reward");
  display.classList.toggle("is-record-earned", theme === "record");
  display.classList.remove("is-earned");
  void display.offsetWidth;
  display.classList.add("is-earned");
  const finish = () => {
    reward.remove();
    if (!display.querySelector(".stat-reward-pop")) {
      display.classList.remove("has-floating-reward", "is-record-earned");
    }
  };
  reward.addEventListener("animationend", finish, { once: true });
  window.setTimeout(finish, 1400);
  window.setTimeout(() => display.classList.remove("is-earned"), 850);
}

function hasEstablishedProgress() {
  return score > 0 || solves > 0 || bestRound > 0 || Boolean(lastPlayedDate) || state.phase === "result";
}

function readProgressionUpdateState() {
  try {
    const saved = JSON.parse(localStorage.getItem(progressionUpdateStorageKey));
    return saved && typeof saved === "object" ? { autoShown: Boolean(saved.autoShown) } : null;
  } catch {
    return null;
  }
}

function writeProgressionUpdateState(updateState) {
  try {
    localStorage.setItem(progressionUpdateStorageKey, JSON.stringify(updateState));
  } catch {
    // The explanation remains available for this visit when storage is disabled.
  }
}

function openProgressionUpdate() {
  if (!progressionUpdateDialog || progressionUpdateDialog.open) return;
  if (typeof progressionUpdateDialog.showModal === "function") {
    progressionUpdateDialog.showModal();
  }
}

function initialiseProgressionUpdate() {
  if (!progressionUpdateButton || !progressionUpdateDialog || !hasEstablishedProgress()) return;

  const launchAt = Date.parse(
    document.querySelector('meta[name="daily-undead-progression-launch-at"]')?.content || "",
  );
  const saved = readProgressionUpdateState();
  const updateState = saved || { autoShown: false };
  const visibility = getProgressionUpdateVisibility({
    launchAt,
    now: getCurrentTime().getTime(),
    autoShown: updateState.autoShown,
  });
  if (!visibility.showReminder) return;

  progressionUpdateButton.hidden = false;
  progressionUpdateButton.addEventListener("click", openProgressionUpdate);
  progressionUpdateDialog.querySelectorAll("[data-close-progression-update]").forEach((button) => {
    button.addEventListener("click", () => progressionUpdateDialog.close());
  });

  if (visibility.autoOpen && !document.querySelector("dialog[open]")) {
    updateState.autoShown = true;
    writeProgressionUpdateState(updateState);
    openProgressionUpdate();
  } else if (!saved) {
    writeProgressionUpdateState(updateState);
  }
}

function closeStatExplainer() {
  if (!statExplainer) return;
  statExplainer.hidden = true;
  delete statExplainer.dataset.theme;
  playerStats?.querySelectorAll("[data-stat-explainer]").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });
}

function initialiseStatExplainers() {
  if (!playerStats || !statExplainer) return;
  const title = statExplainer.querySelector("[data-stat-explainer-title]");
  const copy = statExplainer.querySelector("[data-stat-explainer-copy]");

  playerStats.addEventListener("click", (event) => {
    const button = event.target.closest("[data-stat-explainer]");
    if (!button) return;
    const wasOpen = button.getAttribute("aria-expanded") === "true";
    closeStatExplainer();
    if (wasOpen) return;

    const content = statExplainers[button.dataset.statExplainer];
    const isHighestRound = button.classList.contains("is-highest-round");
    statExplainer.dataset.theme = isHighestRound
      ? "record"
      : button.dataset.statExplainer === "score" ? "reward" : "aether";
    title.textContent = content.title;
    copy.replaceChildren(document.createTextNode(content.copy));
    if (isHighestRound) {
      const recordNotice = document.createElement("span");
      recordNotice.className = "stat-explainer-record";
      recordNotice.textContent = "This is your highest round!";
      copy.append(recordNotice);
    }
    button.setAttribute("aria-expanded", "true");
    statExplainer.hidden = false;

    const statsBox = playerStats.getBoundingClientRect();
    const buttonBox = button.getBoundingClientRect();
    statExplainer.style.setProperty(
      "--stat-arrow-x",
      `${buttonBox.left + (buttonBox.width / 2) - statsBox.left}px`,
    );
  });

  document.addEventListener("click", (event) => {
    if (!playerStats.contains(event.target)) closeStatExplainer();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeStatExplainer();
  });
}

function updateStreakDisplay() {
  const formattedStreak = progressNumberFormatter.format(streakCount);
  streakLabel.textContent = formattedStreak;
  streakLabel.closest(".stat-display").setAttribute(
    "aria-label",
    `Round: ${formattedStreak}. Learn more.`,
  );
}

function updateRoundMilestoneDisplay() {
  const display = streakLabel.closest(".stat-display");
  const isHighestRound = state?.phase === "result" && Boolean(state.newBestRound);
  display.classList.toggle("is-highest-round", isHighestRound);
  if (isHighestRound) {
    display.setAttribute(
      "aria-label",
      `Round: ${progressNumberFormatter.format(streakCount)}. New highest round. Learn more.`,
    );
    display.title = "Highest Round yet";
  } else {
    display.removeAttribute("title");
  }
}

function updateSolvesDisplay() {
  const formattedSolves = progressNumberFormatter.format(solves);
  solvesLabel.textContent = formattedSolves;
  solvesLabel.closest(".stat-display").setAttribute(
    "aria-label",
    `Solves: ${formattedSolves}. Learn more.`,
  );
}

function updateScoreDisplay() {
  const formattedScore = progressNumberFormatter.format(score);
  scoreLabel.textContent = formattedScore;
  scoreLabel.closest(".stat-display").setAttribute(
    "aria-label",
    `Score: ${formattedScore}. Learn more.`,
  );
}

function awardPoints(points, shouldAnimate = true) {
  if (!Number.isInteger(points) || points <= 0) return;

  score += points;
  saveScore();
  updateScoreDisplay();
  if (shouldAnimate) animateStat(scoreLabel, points, "reward");
}

function recordMapResult(isCorrect) {
  if (state.streakRecorded) return false;

  const previousBestRound = bestRound;
  streakCount = calculateNextStreak(streakCount, isCorrect);
  if (streakCount > bestRound) {
    bestRound = streakCount;
    saveBestRound();
  }
  saveStreak();
  updateStreakDisplay();
  if (isCorrect) {
    const roundTheme = streakCount > previousBestRound ? "record" : "aether";
    animateStat(streakLabel, 1, roundTheme);
    if (!state.totalRoundsRecorded) {
      solves += 1;
      saveSolves();
      updateSolvesDisplay();
      animateStat(solvesLabel, 1, "aether");
    }
  }
  return isCorrect && streakCount > previousBestRound;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey()));
    if (supportedStateVersions.has(saved?.stateVersion) && saved?.puzzleKey === puzzle.key) {
      const migrated = { ...createInitialState(), ...saved, stateVersion: currentStateVersion };

      if (
        saved.stateVersion < 6 &&
        migrated.phase === "result" &&
        migrated.isCorrect &&
        !migrated.bonusComplete &&
        !migrated.bonusFailed
      ) {
        migrated.bonusOrder = [];
      }

      if (saved.stateVersion < 4 && saved.pointsRecorded) {
        const previousMapPoints = Number.isInteger(saved.mapPoints) ? saved.mapPoints : 0;
        const mapPoints = saved.isCorrect ? calculateMapPoints(saved.lockedClues) : 0;
        let adjustment = mapPoints - previousMapPoints;
        let bonusPoints = migrated.bonusPoints;

        if (saved.bonusPointsRecorded) {
          const previousBonusPoints = Number.isInteger(saved.bonusPoints) ? saved.bonusPoints : 0;
          bonusPoints = calculateBonusPoints(mapPoints, saved.bonusComplete);
          adjustment += bonusPoints - previousBonusPoints;
        }

        score = Math.max(0, score + adjustment);
        saveScore();
        return { ...migrated, mapPoints, bonusPoints };
      }

      return migrated;
    }
  } catch {
    // A corrupt or unavailable local save should not prevent play.
  }

  return createInitialState();
}

function saveState() {
  if (dayState) dayState.sessions.easter = state;
  try {
    localStorage.setItem(storageKey(), JSON.stringify(state));
    if (dayState) {
      localStorage.setItem(
        `${multiPuzzleDayStoragePrefix}${puzzle.dateKey}`,
        JSON.stringify(dayState),
      );
    }
  } catch {
    // The game remains playable when storage is disabled.
  }
  accountController.scheduleSave();
}

function getLocalAccountSnapshot() {
  return {
    progress: {
      currentRound: streakCount,
      bestRound,
      score,
      solves,
      lastPlayedDate,
      missedDayState,
    },
    dailyState: dayState || state,
  };
}

function applyRemoteAccount(account) {
  const progress = account?.progress;
  if (progress) {
    streakCount = progress.currentRound;
    bestRound = Math.max(progress.bestRound, progress.currentRound);
    score = progress.score;
    solves = progress.solves;
    lastPlayedDate = progress.lastPlayedDate;
    missedDayState = progress.missedDayState;

    try {
      localStorage.setItem(streakStorageKey, String(streakCount));
      localStorage.setItem(bestRoundStorageKey, String(bestRound));
      localStorage.setItem(scoreStorageKey, String(score));
      localStorage.setItem(solvesStorageKey, String(solves));
      if (lastPlayedDate) localStorage.setItem(lastPlayedDateStorageKey, lastPlayedDate);
      else localStorage.removeItem(lastPlayedDateStorageKey);
      if (missedDayState) localStorage.setItem(missedDayStorageKey, JSON.stringify(missedDayState));
      else localStorage.removeItem(missedDayStorageKey);
    } catch {
      // Remote progress still applies for the current session if local storage is unavailable.
    }
  }

  const legacyRemoteState = account?.dailyState
    && supportedStateVersions.has(account.dailyState.stateVersion)
    && account.dailyState.puzzleKey === puzzle.key
      ? { ...createInitialState(), ...account.dailyState, stateVersion: currentStateVersion }
      : createInitialState();
  dayState = normalizeDayState(account?.dailyState, legacyRemoteState);
  state = dayState.sessions.easter;

  try {
    localStorage.setItem(storageKey(), JSON.stringify(state));
    localStorage.setItem(
      `${multiPuzzleDayStoragePrefix}${puzzle.dateKey}`,
      JSON.stringify(dayState),
    );
  } catch {
    // The remote daily state remains available for this session.
  }
}

function migrateCompletedScore() {
  if (state.phase !== "result") return;

  if (state.isCorrect && !state.totalRoundsRecorded) {
    solves += 1;
    saveSolves();
    state.totalRoundsRecorded = true;
  }

  if (!state.pointsRecorded) {
    state.mapPoints = state.isCorrect ? calculateMapPoints(state.lockedClues) : 0;
    awardPoints(state.mapPoints, false);
    state.pointsRecorded = true;
  }

  if (!state.bonusPointsRecorded && (state.bonusComplete || state.bonusFailed)) {
    state.bonusPoints = calculateBonusPoints(state.mapPoints, state.bonusComplete);
    awardPoints(state.bonusPoints, false);
    state.bonusPointsRecorded = true;
  }

  saveState();
}

function focusAfterRender(screenKey) {
  const isSameScreen = screenKey === activeScreenKey;
  const focusSelector = pendingFocusSelector;
  pendingFocusSelector = null;

  if (isSameScreen && focusSelector) {
    const control = app.querySelector(focusSelector);
    if (control && !control.disabled) {
      control.focus({ preventScroll: true });
      return;
    }
  }

  if (isSameScreen) return;
  activeScreenKey = screenKey;

  const heading = app.querySelector("h2");
  if (!heading) return;
  heading.setAttribute("tabindex", "-1");
  heading.focus({ preventScroll: true });
}

function setState(update, focusSelector = null) {
  pendingFocusSelector = focusSelector;
  state = { ...state, ...update };
  saveState();
  render();
}

function renderHeading(title, description, kicker = "Today’s round", puzzleTitle = false) {
  return `
    <div class="screen-heading">
      <p class="kicker">${escapeHtml(kicker)}</p>
      <h2>${puzzleTitle ? `<span class="puzzle-title">${escapeHtml(title)}</span>` : escapeHtml(title)}</h2>
      <p>${escapeHtml(description)}</p>
    </div>
  `;
}

function isOfficialPlay(type = activePlay?.type) {
  return activePlay?.mode === "official" && dayState?.officialType === type;
}

function isMultiPuzzleLaunchActive() {
  return Boolean(puzzle?.dateKey && puzzle.dateKey >= MULTI_PUZZLE_LAUNCH_DATE);
}

function startPuzzle(type, mode) {
  gameAudio.stopAll();
  activePlay = { type, mode };
  rememberPlayDestination(localStorage, puzzle.dateKey, activePlay);
  ensureSession(type);
  render();
  const session = dayState.sessions[type];
  mysteryBox.open({
    dateKey: puzzle.dateKey,
    official: isOfficialPlay(type),
    storage: localStorage,
    type,
    availableTypes: Object.keys(puzzleTypes),
    fresh: !hasPuzzleStarted(type, session),
  });
}

function hasPuzzleStarted(type, session) {
  if (!session) return false;
  if (type === 'blood') return session.complete || session.attempts?.length > 0 || session.selected?.length > 0;
  if (type === "word") {
    return session.complete || session.pendingResult || (session.guesses?.length || 0) > 0;
  }
  return session.complete
    || session.phase !== "clues"
    || session.cluesRevealed > 1
    || Boolean(session.selectedGameId || session.selectedMapId);
}

function getPuzzleCardAction(type) {
  const session = dayState.sessions[type];
  if (dayState.officialType === type) {
    if (!dayState.officialCompleted) {
      return { label: session ? "Continue today’s round" : "Play today’s round", action: "official" };
    }
    return { label: "Today’s round complete", action: null };
  }
  if (!dayState.officialCompleted) return { label: "Finish today’s round first", action: null };
  if (isPuzzleSessionComplete(type, session)) return { label: "Puzzle complete", action: null };
  return { label: hasPuzzleStarted(type, session) ? "Continue just for fun" : "Play just for fun", action: "for_fun" };
}

function getPuzzleCardStatus(type) {
  const session = dayState.sessions[type];
  if (dayState.officialType === type) {
    return dayState.officialCompleted ? "Today’s round is complete" : "Today’s round · In progress";
  }
  if (!dayState.officialCompleted) return "Locked until today’s round is complete";
  if (isPuzzleSessionComplete(type, session)) return "Completed just for fun";
  return "Play risk-free. No effect on your stats.";
}

function renderPuzzleCard(type) {
  const details = puzzleTypes[type];
  const action = getPuzzleCardAction(type);
  const official = dayState.officialType === type;
  const completed = isPuzzleSessionComplete(type, dayState.sessions[type]);
  return `
    <article class="puzzle-choice-card${official ? " is-official" : ""}" data-puzzle-card="${type}">
      <img class="puzzle-choice-art" src="${details.image}" alt="" width="512" height="512">
      <div class="puzzle-choice-copy">
        <p class="kicker">${escapeHtml(details.kicker)}</p>
        <h3>${escapeHtml(details.name)}</h3>
        <p>${escapeHtml(details.description)}</p>
      </div>
      <div class="puzzle-choice-status-row">
        <div class="puzzle-choice-status-copy"><p class="puzzle-choice-status${completed ? " is-complete" : ""}">${escapeHtml(getPuzzleCardStatus(type))}</p></div>
        ${completed ? `<button class="puzzle-result-link" type="button" data-see-result="${type}" data-result-mode="${official ? "official" : "for_fun"}">See result</button>` : ""}
      </div>
      <div class="puzzle-choice-actions">
        <button class="button primary" type="button" data-card-action="${action.action || ""}" data-puzzle-type="${type}" ${action.action ? "" : "disabled"}>${escapeHtml(action.label)}</button>
      </div>
    </article>
  `;
}

function areAllPuzzlesCompleted() {
  return Object.keys(puzzleTypes).every((type) =>
    isPuzzleSessionComplete(type, dayState.sessions[type]));
}

function renderHub() {
  gameAudio.stopAll();
  if (!isMultiPuzzleLaunchActive()) {
    startPuzzle("easter", "official");
    return;
  }
  activePlay = null;
  rememberPlayDestination(localStorage, puzzle.dateKey, { screen: "hub" });
  const allComplete = areAllPuzzlesCompleted();
  const otherNames = Object.keys(puzzleTypes).filter((type) => type !== dayState.officialType).map((type) => puzzleTypes[type].name).join(' and ');
  const guidance = allComplete
    ? "You have completed all of today’s puzzles."
    : `Today’s round is complete. You can now play ${otherNames} just for fun, with no effect on your stats.`;
  app.innerHTML = `
    <section class="panel puzzle-hub-panel">
      <div class="puzzle-hub-hero">
        ${renderHeading(
          allComplete ? "Today’s puzzles are complete" : "Play another puzzle",
          guidance,
          allComplete ? "All puzzles" : "Just for fun",
        )}
      </div>
      <div class="puzzle-choice-grid">
        ${renderPuzzleCard("word")}
        ${renderPuzzleCard("easter")}
        ${bloodTiesEnabled ? renderPuzzleCard('blood') : ''}
      </div>
    </section>
    ${renderNextRoundScreen()}
  `;
  updateNextRoundCountdown();
  app.querySelectorAll("[data-card-action]").forEach((button) => {
    if (button.disabled) return;
    button.addEventListener("click", () => startPuzzle(button.dataset.puzzleType, button.dataset.cardAction));
  });
  app.querySelectorAll("[data-see-result]").forEach((button) => {
    button.addEventListener("click", () => startPuzzle(button.dataset.seeResult, button.dataset.resultMode));
  });
  focusAfterRender("puzzle-hub");
}

function renderWordSlots(answer, revealedLetters, { revealLetter = "", finalReveal = false } = {}) {
  const revealed = new Set(revealedLetters);
  const newlyRevealedLetter = normalizeLetter(revealLetter);
  let revealIndex = 0;
  let letterIndex = 0;
  return answer.split(" ").map((word, wordIndex) => `
    <span class="word-token${finalReveal ? " is-completing" : ""}"${finalReveal ? ` style="--word-index: ${wordIndex}"` : ""}>
      ${[...word].map((character) => {
        const letter = normalizeLetter(character);
        if (!letter) return `<span class="word-literal">${escapeHtml(character)}</span>`;
        const visible = revealed.has(letter);
        const newlyRevealed = visible && letter === newlyRevealedLetter;
        const animationIndexes = [`--letter-index: ${letterIndex++}`];
        if (newlyRevealed) animationIndexes.push(`--reveal-index: ${revealIndex++}`);
        return `<span class="word-letter${visible ? " is-visible" : ""}${newlyRevealed ? " is-newly-revealed" : ""}" style="${animationIndexes.join("; ")}" aria-label="${visible ? letter : "Hidden letter"}">${visible ? letter : ""}</span>`;
      }).join("")}
    </span>
  `).join('<span class="word-space" aria-hidden="true"></span>');
}

function renderBloodPuzzle({ flashStrikes = false } = {}) {
  mysteryBox.cancel();
  const session = ensureSession('blood');
  const official = isOfficialPlay('blood');
  renderBloodTiesView({
    app, puzzle: bloodPuzzle, session, official, developer: isLocalPreview, heading: renderHeading, flashStrikes,
    resultActions: `<div class="actions share-score-actions">${official ? renderResultAccountAction() : ''}${official ? '<button id="share-score" class="button share-score-button" type="button">Share with your squad</button>' : ''}<button id="return-to-puzzle-home" class="button" type="button">${areAllPuzzlesCompleted() ? 'View puzzles' : 'Play another puzzle'}</button></div><p id="share-score-status" class="share-score-status" aria-live="polite"></p>`,
    nextRound: renderNextRoundScreen(),
    onSound: (cue) => void gameAudio.play(cue),
    onSave: (rerender) => { saveState(); if (rerender) renderBloodPuzzle(); },
    onSubmit: () => {
      if (session.complete || session.selected.length !== 3) return;
      let next;
      try { next = replayBloodTiesAttempts(bloodPuzzle, [...session.attempts, session.selected], session.rulesVersion); }
      catch { session.message = 'You already tried that trio. Choose a different connection.'; saveState(); renderBloodPuzzle(); return; }
      if (official && next.complete && !confirmAccountResultSubmission(accountController)) return;
      const correct = next.solved.length > session.solved.length;
      Object.assign(session, next, { shuffleCount: session.shuffleCount + (correct ? 1 : 0) });
      if (session.complete) {
        if (official && !dayState.officialCompleted) {
          session.roundsSurvivedBeforeLoss = session.success ? 0 : streakCount;
          session.newBestRound = recordMapResult(session.success);
          if (session.success) awardPoints(session.points);
          recordDailyParticipation(puzzle.dateKey);
          puzzleStats.blood.plays++;
          if (session.success) { puzzleStats.blood.solves++; puzzleStats.blood.score += session.points; }
          savePuzzleStats();
          dayState.progressionApplied = true;
          dayState.officialCompleted = true;
          dayState.officialResult = { type: 'blood', puzzleType: 'blood', success: session.success, points: session.points };
          void accountController.recordBloodResult?.({ puzzleDate: puzzle.dateKey, puzzleId: bloodPuzzle.key, attempts: session.attempts, rulesVersion: session.rulesVersion });
        }
        dayState.lastCompleted = { type: 'blood', mode: activePlay.mode, success: session.success, points: session.points };
        recordCommunityAttemptFor('blood', session.success);
      }
      saveState();
      const present = () => {
        renderBloodPuzzle({ flashStrikes: correct });
        void gameAudio.play(bloodConnectionSound({ correct, complete: session.complete }));
        if (session.complete) {
          snapPageToTop();
          if (session.success) playScoreCount(session.points);
        } else {
          app.querySelector('[data-blood-tile]')?.focus({ preventScroll: true });
        }
      };
      // Persist completion immediately. Hold the existing board only long enough
      // to show the same green strike reset on the third correct submission.
      const circles = app.querySelector('.blood-strike-circles');
      if (correct && session.complete && circles) {
        app.querySelectorAll('button').forEach((button) => { button.disabled = true; });
        circles.querySelectorAll('i').forEach((circle) => circle.classList.remove('is-active'));
        circles.setAttribute('aria-label', '0 of 3 strikes');
        circles.classList.add('is-clearing');
        window.setTimeout(() => { if (app.contains(circles)) present(); }, 520);
      } else present();
    },
  });
  if (session.complete) {
    animatePointTotal(app.querySelector('[data-count-to]'), session.points);
    updateNextRoundCountdown();
    bindResultAccountAction();
    app.querySelector('#return-to-puzzle-home')?.addEventListener('click', () => { renderHub(); snapPageToTop(); });
    app.querySelector('#share-score')?.addEventListener('click', (event) => { snapPageToTop(); void shareScore(event.currentTarget, app.querySelector('#share-score-status')); });
  }
  focusAfterRender(session.complete ? `blood-result:${session.success}` : 'blood-puzzle');
}

function getWordCompletionDelay(success) {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return success ? 1000 : 120;
  if (!success) return 850;
  const wordCount = wordPuzzle.entry.answer.trim().split(/\s+/).length;
  const letterCount = [...wordPuzzle.entry.answer].filter((character) => /[A-Z]/i.test(character)).length;
  return Math.min(3600, Math.max(1900 + ((wordCount - 1) * 180), 1250 + (letterCount * 55)));
}

function applyOfficialWordProgression(session, success, points) {
  if (!isOfficialPlay("word") || dayState.officialCompleted) return;
  const roundsSurvivedBeforeLoss = success ? 0 : streakCount;
  const newBestRound = recordMapResult(success);
  if (success) awardPoints(points);
  recordDailyParticipation(puzzle.dateKey);
  puzzleStats.word.plays += 1;
  if (success) {
    puzzleStats.word.score += points;
    puzzleStats.word.solves += 1;
  }
  savePuzzleStats();
  session.roundsSurvivedBeforeLoss = roundsSurvivedBeforeLoss;
  session.newBestRound = newBestRound;
  dayState.progressionApplied = true;
  dayState.officialCompleted = true;
  dayState.officialResult = { type: "word", puzzleType: "word", success, points };
  accountController.recordWordResult({
    puzzleDate: puzzle.dateKey,
    puzzleId: wordPuzzle.key,
    guesses: session.guesses,
    misses: session.wrongGuesses,
    success,
  });
}

function finishWordPuzzle(session, success) {
  const points = success ? calculateWordPoints(session.wrongGuesses) : 0;
  session.pendingResult = null;
  session.complete = true;
  session.success = success;
  session.points = points;
  session.summary = {
    label: wordPuzzle.entry.category,
    answer: wordPuzzle.entry.answer,
    description: wordPuzzle.entry.description,
    detail: success
      ? session.wrongGuesses === 0 ? "Perfect solve" : formatWordMisses(session.wrongGuesses)
      : "5 misses",
  };
  if (isOfficialPlay("word")) applyOfficialWordProgression(session, success, points);
  dayState.lastCompleted = {
    type: "word",
    mode: activePlay?.mode || "for_fun",
    success,
    points,
    summary: session.summary,
  };
  saveState();
  recordCommunityAttemptFor("word", success);
  renderWordResult(session, activePlay?.mode || "for_fun");
}

function finishPendingWordResult(session) {
  const pending = session.pendingResult;
  if (!pending || session.complete) return;
  window.setTimeout(() => {
    if (session.complete || session.pendingResult !== pending) return;
    finishWordPuzzle(session, pending === "success");
  }, getWordCompletionDelay(pending === "success"));
}

function animatePointTotal(element, total) {
  if (!element) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    element.textContent = String(total);
    return;
  }
  const startedAt = performance.now();
  const duration = 720;
  const tick = (now) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    element.textContent = String(Math.round(total * (1 - ((1 - progress) ** 3))));
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function playScoreCount(total, { reward } = {}) {
  if (total > 0 && app.querySelector('[data-count-to]')) {
    gameAudio.countPoints(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 720, {
      reward: reward ?? (total === 100 ? 'double-points-a' : undefined),
    });
  } else if (reward) void gameAudio.reward(reward);
}

function renderResultAccountAction() {
  return accountController.signedIn
    ? ""
    : '<button id="result-account-action" class="button result-account-button is-save-progress" type="button">Save your progress</button>';
}

function snapPageToTop() {
  window.scrollTo(0, 0);
}

function bindResultAccountAction() {
  app.querySelector("#result-account-action")?.addEventListener("click", () => {
    snapPageToTop();
    accountController.openAccountAccess?.();
  });
}

function renderWordResult(session, mode) {
  const official = mode === "official";
  const answer = session.summary?.answer || wordPuzzle.entry.answer;
  const answerWithPunctuation = punctuateSentenceEnding(answer);
  const answerMarkup = `<strong class="result-answer-name">${escapeHtml(answer)}</strong>`;
  const copy = session.success
    ? `You revealed ${answerMarkup} with ${formatWordMisses(session.wrongGuesses)}.${official ? "" : " This result did not affect your stats."}`
    : `You did not reveal the answer. Today’s answer was <strong class="result-answer-name">${escapeHtml(answerWithPunctuation)}</strong>${official ? " Your permanent Score and Solves are safe." : " This result did not affect your stats."}`;
  const allComplete = areAllPuzzlesCompleted();
  app.innerHTML = `
    <section class="panel">
      <div class="result-banner ${session.success ? "correct" : "failed"} animate">
        <h2>${official ? session.success ? "Round Survived!" : "Run ended" : session.success ? "Puzzle Complete!" : "Not quite"}</h2>
        <p>${copy}</p>
        ${official && session.success ? `<div class="result-score-total"><span>Round score</span><strong data-count-to="${session.points}">0</strong></div>` : ""}
        ${official && !session.success ? `<p class="survival-summary">${Math.max(1, session.roundsSurvivedBeforeLoss || 1) === 1 ? "Your Round remains at <strong>Round 1</strong>." : `Your run ended at <strong>Round ${session.roundsSurvivedBeforeLoss}</strong>. Your next game starts at <strong>Round 1</strong>.`}</p>` : ""}
      </div>
      <section class="bonus-panel">
        <p class="word-result-category">${escapeHtml(session.summary?.label || wordPuzzle.entry.category)}</p>
        <h2 class="final-map-name">${escapeHtml(answer)}</h2>
        <p class="word-result-description">${escapeHtml(session.summary?.description || wordPuzzle.entry.description || "")}</p>
      </section>
      <div class="actions share-score-actions">
        ${official ? renderResultAccountAction() : ""}
        ${official ? '<button id="share-score" class="button share-score-button" type="button">Share with your squad</button>' : ""}
        ${isMultiPuzzleLaunchActive() ? `<button id="return-to-puzzle-home" class="button" type="button">${allComplete ? "View puzzles" : "Play another puzzle"}</button>` : ""}
      </div>
      ${official ? '<p id="share-score-status" class="share-score-status" aria-live="polite"></p>' : ""}
    </section>
    ${renderNextRoundScreen()}
  `;
  updateNextRoundCountdown();
  animatePointTotal(app.querySelector("[data-count-to]"), session.points);
  app.querySelector("#return-to-puzzle-home")?.addEventListener("click", () => {
    renderHub();
    snapPageToTop();
  });
  app.querySelector("#share-score")?.addEventListener("click", (event) => {
    snapPageToTop();
    shareScore(event.currentTarget, app.querySelector("#share-score-status"));
  });
  bindResultAccountAction();
  focusAfterRender(`word-result:${session.success ? "correct" : "failed"}`);
}

function renderWordPuzzle({ scoreChanged = false, revealLetter = "", feedbackLetter = "", statusMessage = "", statusType = "" } = {}) {
  mysteryBox.cancel();
  const session = ensureSession("word");
  if (session.complete) {
    renderWordResult(session, activePlay?.mode || "for_fun");
    return;
  }
  const official = isOfficialPlay("word");
  const finalReveal = session.pendingResult === "success";
  const resultPending = Boolean(session.pendingResult);
  const answerLetters = wordPuzzle.entry.answer.toUpperCase();
  const guesses = new Set(session.guesses);
  const initialLetters = new Set(wordPuzzle.initialLetters);
  const revealed = new Set(wordPuzzle.initialLetters);
  session.guesses.forEach((letter) => { if (answerLetters.includes(letter)) revealed.add(letter); });
  const potentialPoints = calculateWordPoints(session.wrongGuesses);
  const displayedStatus = statusMessage || (finalReveal ? "Answer revealed!" : session.pendingResult === "failure" ? "No guesses remaining." : "Choose a letter.");
  const displayedStatusType = statusType || (finalReveal ? "complete" : "");
  const animatedLetter = revealLetter || (finalReveal ? session.lastGuess : "");
  const activeFeedbackLetter = normalizeLetter(feedbackLetter);
  const correctFeedback = Boolean(normalizeLetter(revealLetter)) && !finalReveal;
  const mistakeFeedback = scoreChanged && !finalReveal;
  const longestWordLength = Math.max(...wordPuzzle.entry.answer.split(/\s+/).map((word) => [...word].filter((character) => /[A-Z]/i.test(character)).length));
  const keyboardRows = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
  app.innerHTML = `
    <section class="panel word-puzzle-panel">
      <img class="puzzle-panel-art" src="${puzzleTypes.word.image}" alt="" width="240" height="240" aria-hidden="true">
      ${renderHeading("Last Words", "Try to solve the Zombies word or phrase by revealing its letters.", official ? "Today’s round" : "Just for fun", true)}
      ${official ? "" : '<p class="puzzle-mode-note">Playing just for fun. This result will not change your stats.</p>'}
      <div class="word-scoreboard${official ? "" : " is-single"}" aria-label="Word puzzle progress">
        <div class="word-mistakes danger-level-${session.wrongGuesses}"><span>Misses</span><strong>${session.wrongGuesses} / 5</strong><div class="word-danger-meter" aria-hidden="true">${[1, 2, 3, 4, 5].map((stage) => `<i class="${stage <= session.wrongGuesses ? "is-active" : ""}${scoreChanged && stage === session.wrongGuesses ? " is-new" : ""}"></i>`).join("")}</div></div>
        ${official ? `<div><span>Potential score</span><strong class="word-score-value${scoreChanged ? " is-changing" : ""}">${potentialPoints}</strong></div>` : ""}
      </div>
      <div class="word-answer${longestWordLength >= 11 ? " has-long-word" : ""}${correctFeedback ? " is-correct-feedback" : ""}${mistakeFeedback ? " is-mistake-feedback" : ""}${finalReveal ? " is-final-reveal" : ""}" aria-label="Partially revealed answer">
        <div class="word-answer-display">${renderWordSlots(wordPuzzle.entry.answer, revealed, { revealLetter: animatedLetter, finalReveal })}</div>
        <p class="word-category-hint">Hint: ${escapeHtml(wordPuzzle.entry.category)}</p>
      </div>
      <div class="word-keyboard" aria-label="Letter keyboard">
        ${keyboardRows.map((row) => `<div class="word-keyboard-row">${[...row].map((letter) => {
          const used = guesses.has(letter) || initialLetters.has(letter);
          const correct = answerLetters.includes(letter);
          const feedbackClass = letter === activeFeedbackLetter ? correct ? " is-newly-correct" : " is-newly-incorrect" : "";
          const stateClass = initialLetters.has(letter) ? " is-revealed" : used && correct ? " is-correct" : used ? " is-incorrect" : "";
          const stateLabel = initialLetters.has(letter) ? "Starting letter" : !used ? "Unused" : correct ? "Correct" : "Miss";
          return `<button class="word-key${stateClass}${feedbackClass}" type="button" data-letter="${letter}" aria-label="${letter}: ${stateLabel}" ${used || resultPending ? "disabled" : ""}>${letter}</button>`;
        }).join("")}</div>`).join("")}
      </div>
      <p id="word-game-status" class="word-game-status${displayedStatusType ? ` is-${displayedStatusType}` : ""}" aria-live="polite">${escapeHtml(displayedStatus)}</p>
    </section>
  `;
  app.querySelectorAll("[data-letter]").forEach((button) => button.addEventListener("click", () => submitLetter(button.dataset.letter)));
  if (resultPending) finishPendingWordResult(session);
  focusAfterRender("word-puzzle");
}

function submitLetter(value) {
  if (activePlay?.type !== "word") return;
  const official = isOfficialPlay("word");
  const letter = normalizeLetter(value);
  const session = ensureSession("word");
  if (!letter || session.complete || session.pendingResult || session.guesses.includes(letter) || wordPuzzle.initialLetters.includes(letter)) return;
  const correct = wordPuzzle.entry.answer.toUpperCase().includes(letter);
  const nextGuesses = [...session.guesses, letter];
  const nextWrongGuesses = session.wrongGuesses + (correct ? 0 : 1);
  const solved = isWordSolved(wordPuzzle.entry.answer, [...wordPuzzle.initialLetters, ...nextGuesses]);
  if (official && (solved || nextWrongGuesses >= 5) && !confirmAccountResultSubmission(accountController)) return;
  session.guesses = nextGuesses;
  session.lastGuess = letter;
  if (correct) session.correctStreak = (session.correctStreak || 0) + 1;
  else {
    session.wrongGuesses = nextWrongGuesses;
    session.correctStreak = 0;
  }
  const cue = letterSound({ correct, solved, streak: session.correctStreak });
  if (solved) void gameAudio.reward(cue); else void gameAudio.play(cue);
  if (solved) {
    // Schedule from the accepted guess, before rendering normalizes the session.
    // The audio engine cancels these pending cues on mute, hiding or navigation.
    if (official) gameAudio.countPoints(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 720, {
      delay: getWordCompletionDelay(true),
      reward: calculateWordPoints(session.wrongGuesses) === 100 ? 'double-points-a' : undefined,
    });
    session.pendingResult = "success";
    saveState();
    renderWordPuzzle({ revealLetter: letter, feedbackLetter: letter, statusMessage: "Answer revealed!", statusType: "complete" });
    return;
  }
  if (session.wrongGuesses >= 5) {
    void gameAudio.play('run-ended', { delay: getWordCompletionDelay(false) });
    session.pendingResult = "failure";
    saveState();
    renderWordPuzzle({ scoreChanged: true, feedbackLetter: letter, statusMessage: "No guesses remaining." });
    return;
  }
  saveState();
  const streakMessage = session.correctStreak >= 2 ? `${session.correctStreak} correct letters in a row!` : `${letter} is in the answer.`;
  renderWordPuzzle({
    scoreChanged: !correct,
    revealLetter: correct ? letter : "",
    feedbackLetter: letter,
    statusMessage: correct ? streakMessage : official ? `${letter} is not in the answer. Potential score is now ${calculateWordPoints(session.wrongGuesses)}.` : `${letter} is not in the answer.`,
    statusType: correct && session.correctStreak >= 2 ? "streak" : "",
  });
}

function createClueCard(step, index) {
  const card = clueTemplate.content.firstElementChild.cloneNode(true);
  card.querySelector(".clue-number").textContent = `Clue ${index + 1}`;
  card.querySelector(".clue-text").textContent = index === 2 ? step.clue : step.hardClue;
  return card;
}

function renderClueCards(container, visibleCount = 3, showHidden = false, newlyRevealedIndex = -1) {
  puzzle.displayedSteps.forEach((step, index) => {
    if (index < visibleCount) {
      const card = createClueCard(step, index);
      if (index === newlyRevealedIndex) card.classList.add("is-newly-revealed");
      container.append(card);
      return;
    }

    if (showHidden) {
      const hidden = document.createElement("article");
      hidden.className = "clue-card is-hidden";
      hidden.textContent = `Clue ${index + 1} hidden`;
      container.append(hidden);
    }
  });
}

function renderClues({ newlyRevealedIndex = -1, scoreChanged = false } = {}) {
  const official = isOfficialPlay("easter");
  const potentialPoints = calculateMapPoints(state.cluesRevealed);
  app.innerHTML = `
    <section class="panel quest-clue-panel">
      <img class="puzzle-panel-art" src="${puzzleTypes.easter.image}" alt="" width="240" height="240" aria-hidden="true">
      ${renderHeading(
        "Quest Steps",
        official
          ? "Identify the map from its main quest steps. Reveal as few clues as possible to earn more points."
          : "Identify the map from its main quest steps. Reveal another clue if you need it.",
        official ? "Today’s round" : "Just for fun",
        true,
      )}
      ${official ? "" : '<p class="puzzle-mode-note">Playing just for fun. This result will not change your stats.</p>'}
      <div class="quest-intel-status${official ? "" : " is-single"}" aria-label="Quest puzzle progress">
        <div><span>Clues revealed</span><strong class="quest-clue-count${newlyRevealedIndex >= 0 ? " is-changing" : ""}">${state.cluesRevealed} / 3</strong></div>
        ${official ? `<div><span>Potential score</span><strong class="quest-score-value${scoreChanged ? " is-changing" : ""}">${potentialPoints}</strong></div>` : ""}
      </div>
      <div id="clue-list" class="clue-list"></div>
      <div class="actions">
        <button id="reveal-clue" class="button quest-reveal-button" type="button" ${state.cluesRevealed >= 3 ? "disabled" : ""}>
          ${state.cluesRevealed >= 3 ? "All clues revealed" : "Reveal next clue"}
        </button>
        <button id="lock-answer" class="button primary quest-select-map${newlyRevealedIndex >= 0 ? " is-ready-cue" : ""}" type="button">
          Select map
        </button>
      </div>
    </section>
  `;

  renderClueCards(app.querySelector("#clue-list"), state.cluesRevealed, true, newlyRevealedIndex);
  focusAfterRender("clues");
  app.querySelector("#reveal-clue")?.addEventListener("click", (event) => {
    const button = event.currentTarget;
    if (button.classList.contains("is-activating")) return;
    const revealClue = () => {
      const cluesRevealed = Math.min(3, state.cluesRevealed + 1);
      state = { ...state, cluesRevealed };
      saveState();
      pendingFocusSelector = cluesRevealed === 3 ? "#lock-answer" : "#reveal-clue";
      renderClues({ newlyRevealedIndex: cluesRevealed - 1, scoreChanged: official });
      void gameAudio.play('quest-clue-reveal');
    };
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      revealClue();
      return;
    }
    button.classList.add("is-activating");
    button.setAttribute("aria-disabled", "true");
    window.setTimeout(revealClue, 180);
  });
  app.querySelector("#lock-answer").addEventListener("click", () => {
    setState({ phase: "game", lockedClues: null });
  });
}

function renderGameSelection() {
  const games = [...catalog.games].sort((left, right) => left.releaseOrder - right.releaseOrder);

  app.innerHTML = `
    <section class="panel answer-selection-panel">
      ${renderHeading("Choose the game", `You have revealed ${state.cluesRevealed} ${state.cluesRevealed === 1 ? "clue" : "clues"}.`, isOfficialPlay("easter") ? "Lock in your answer" : "Just for fun")}
      <ul class="card-grid is-entering">
        ${games
          .map(
            (game, index) => `
              <li style="--card-index: ${index}">
                <button class="card-button" type="button" data-game-id="${escapeHtml(game.id)}">
                  <span class="game-label">Call of Duty</span>
                  <span class="card-title">${escapeHtml(game.title)}</span>
                </button>
              </li>
            `,
          )
          .join("")}
      </ul>
      <div class="actions">
        <button id="back-to-clues" class="button" type="button">Back to clues</button>
      </div>
    </section>
  `;

  focusAfterRender("game-selection");
  app.querySelector("#back-to-clues").addEventListener("click", () => {
    setState({ phase: "clues", selectedGameId: null, selectedMapId: null });
  });
  app.querySelectorAll("[data-game-id]").forEach((button) => {
    button.addEventListener("click", () => {
      setState({
        phase: "map",
        selectedGameId: button.dataset.gameId,
        selectedMapId: null,
      });
    });
  });
}

function renderMapSelection() {
  const game = catalog.games.find((item) => item.id === state.selectedGameId);
  const gameMaps = orderMapsForGame(
    selectableMaps.filter((map) => isMapAvailableOnDate(map, puzzle.dateKey)),
    state.selectedGameId,
    catalog.mapOrder?.[state.selectedGameId],
  );

  app.innerHTML = `
    <section class="panel answer-selection-panel">
      ${renderHeading(`Choose a ${game.title} map`, "Tap a map, then confirm your final answer.", isOfficialPlay("easter") ? "Lock in your answer" : "Just for fun")}
      <ul class="card-grid is-entering">
        ${gameMaps
          .map(
            (map, index) => `
              <li style="--card-index: ${index}">
                <button
                  class="card-button"
                  type="button"
                  data-map-id="${escapeHtml(map.id)}"
                  aria-pressed="${state.selectedMapId === map.id}"
                >
                  <span class="game-label">${escapeHtml(map.questTitle || map.gameTitle)}</span>
                  <span class="card-title">${escapeHtml(map.title)}</span>
                </button>
              </li>
            `,
          )
          .join("")}
      </ul>
      <div class="actions">
        <button id="back-to-games" class="button" type="button">Back to games</button>
        <button id="confirm-map" class="button primary" type="button" ${state.selectedMapId ? "" : "disabled"}>
          Confirm map
        </button>
      </div>
    </section>
  `;

  focusAfterRender(`map-selection:${game.id}`);
  app.querySelectorAll("[data-map-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const mapId = button.dataset.mapId;
      state = { ...state, selectedMapId: mapId };
      saveState();
      app.querySelectorAll("[data-map-id]").forEach((candidate) => {
        candidate.setAttribute("aria-pressed", String(candidate === button));
        candidate.classList.remove("is-newly-selected");
      });
      button.classList.add("is-newly-selected");
      app.querySelector("#confirm-map").disabled = false;
    });
  });
  app.querySelector("#back-to-games").addEventListener("click", () => {
    setState({ phase: "game", selectedGameId: null, selectedMapId: null });
  });
  app.querySelector("#confirm-map").addEventListener("click", () => {
    const official = isOfficialPlay("easter");
    if (official && !confirmAccountResultSubmission(accountController)) return;
    void gameAudio.play('answer-lock');
    const isCorrect = isAcceptedMapSelection(
      state.selectedMapId,
      puzzle.map.id,
      catalog.answerEquivalents,
    );
    const mapPoints = isCorrect ? calculateMapPoints(state.cluesRevealed) : 0;
    const roundsSurvivedBeforeLoss = official && !isCorrect ? streakCount : 0;
    const newBestRound = official ? recordMapResult(isCorrect) : false;
    if (official && !state.pointsRecorded) awardPoints(mapPoints);
    if (official) {
      recordDailyParticipation();
      puzzleStats.easter.plays += 1;
      if (isCorrect) {
        puzzleStats.easter.score += mapPoints;
        puzzleStats.easter.solves += 1;
      }
      savePuzzleStats();
      dayState.progressionApplied = true;
      if (!isCorrect) {
        dayState.officialCompleted = true;
        dayState.officialResult = { type: "easter", puzzleType: "easter", success: false, points: 0 };
      }
      accountController.recordMapResult({
        puzzleDate: puzzle.dateKey,
        puzzleId: puzzle.key,
        selectedMapId: state.selectedMapId,
        cluesUsed: state.cluesRevealed,
      });
    }
    recordCommunityAttemptFor("easter", isCorrect);
    setState({
      phase: "result",
      isCorrect,
      lockedClues: state.cluesRevealed,
      cluesRevealed: isCorrect ? 3 : state.cluesRevealed,
      streakRecorded: true,
      totalRoundsRecorded: isCorrect || state.totalRoundsRecorded,
      newBestRound,
      roundsSurvivedBeforeLoss,
      mapPoints,
      pointsRecorded: true,
      complete: !isCorrect,
      success: isCorrect,
      points: mapPoints,
      summary: {
        label: "Map",
        answer: getPuzzleAnswerTitle(),
      },
    });
    if (!isCorrect) {
      dayState.lastCompleted = { type: "easter", mode: activePlay?.mode || "for_fun", success: false, points: 0 };
      saveState();
    }
    if (isCorrect) {
      void gameAudio.reward('puzzle-solved-a', { delay: 90 });
    } else void gameAudio.play('run-ended', { delay: 90 });
  });
}

function getPuzzleAnswerTitle() {
  return getAnswerDisplayTitle(puzzle.map, catalog.answerEquivalents);
}

function renderCorrectStepOrder(showTicks = false, correction = false) {
  return `
    <ol class="steps-order${showTicks ? " is-confirmed" : ""}${correction ? " is-correction" : ""}">
      ${puzzle.chronologicalSteps
        .map(
          (step, index) => `
            <li style="--step-index: ${index}">
              <span class="order-rank">${index + 1}</span>
              <span>${escapeHtml(step.clue)}</span>
              ${showTicks ? `<span class="step-tick" style="--step-index: ${index}" aria-label="Correct">✓</span>` : ""}
            </li>
          `,
        )
        .join("")}
    </ol>
  `;
}

function renderBonus() {
  if (state.bonusComplete) {
    return `
      <section class="bonus-panel">
        <p class="kicker">Map</p>
        <h2 class="final-map-name">${escapeHtml(getPuzzleAnswerTitle())}</h2>
        ${renderCorrectStepOrder(true)}
      </section>
    `;
  }

  if (state.bonusFailed) {
    return `
      <section class="bonus-panel">
        <h3>Bonus missed</h3>
        <p class="helper-text">The steps were not in the correct order.</p>
        <p class="kicker">Map</p>
        <h2 class="final-map-name">${escapeHtml(getPuzzleAnswerTitle())}</h2>
        ${renderCorrectStepOrder(false, true)}
      </section>
    `;
  }

  const selectedCount = state.bonusOrder.length;
  return `
    <section class="bonus-panel">
      <h3>Bonus: Put the steps in order</h3>
      <p class="helper-text">${isOfficialPlay("easter") ? "Order the steps to earn Double Points. Tap a selected step to remove it." : "Order the steps correctly. Tap a selected step to remove it."}</p>
      <div class="bonus-order-status">
        <p class="selection-progress${selectedCount === 3 ? " is-ready" : ""}" aria-live="polite">${selectedCount === 3 ? "Ready to submit" : `Selected: ${selectedCount} of 3`}</p>
        <div class="order-chain${selectedCount === 3 ? " is-ready" : ""}" aria-hidden="true">
          ${[0, 1, 2].map((index) => `<i class="${index < selectedCount ? "is-active" : ""}"></i>`).join("")}
        </div>
      </div>
      <ul class="order-choice-list">
        ${puzzle.displayedSteps
          .map(
            (step) => {
              const selectedIndex = state.bonusOrder.indexOf(step.id);
              const isSelected = selectedIndex >= 0;
              return `
              <li>
                <button
                  class="order-choice"
                  type="button"
                  data-bonus-step-id="${escapeHtml(step.id)}"
                  aria-pressed="${isSelected}"
                  aria-label="${isSelected ? `Selected ${selectedIndex + 1}` : "Unselected"}: ${escapeHtml(step.clue)}"
                >
                  <span class="order-rank" aria-hidden="true">${isSelected ? selectedIndex + 1 : "+"}</span>
                  <span class="order-text">${escapeHtml(step.clue)}</span>
                </button>
              </li>
            `;
            },
          )
          .join("")}
      </ul>
      <div class="actions">
        <button id="submit-order" class="button primary" type="button" ${selectedCount === 3 ? "" : "disabled"}>
          Submit order · One attempt only
        </button>
      </div>
    </section>
  `;
}

function updateBonusSelection(changedButton = null) {
  const selectedCount = state.bonusOrder.length;
  const ready = selectedCount === 3;
  const progress = app.querySelector(".selection-progress");
  if (progress) {
    progress.textContent = ready ? "Ready to submit" : `Selected: ${selectedCount} of 3`;
    progress.classList.toggle("is-ready", ready);
  }
  const chain = app.querySelector(".order-chain");
  chain?.classList.toggle("is-ready", ready);
  chain?.querySelectorAll("i").forEach((segment, index) => {
    segment.classList.toggle("is-active", index < selectedCount);
  });
  app.querySelectorAll("[data-bonus-step-id]").forEach((button) => {
    const selectedIndex = state.bonusOrder.indexOf(button.dataset.bonusStepId);
    button.setAttribute("aria-pressed", String(selectedIndex >= 0));
    button.setAttribute("aria-label", `${selectedIndex >= 0 ? `Selected ${selectedIndex + 1}` : "Unselected"}: ${button.querySelector(".order-text")?.textContent || ""}`);
    button.classList.remove("is-newly-ranked");
    button.querySelector(".order-rank").textContent = selectedIndex >= 0 ? String(selectedIndex + 1) : "+";
  });
  if (changedButton && state.bonusOrder.includes(changedButton.dataset.bonusStepId)) {
    void changedButton.offsetWidth;
    changedButton.classList.add("is-newly-ranked");
  }
  app.querySelector("#submit-order").disabled = !ready;
}

function showBonusSubmissionFeedback(bonusCorrect) {
  if (!bonusCorrect) void gameAudio.play('letter-wrong');
  bonusSubmissionPending = true;
  const list = app.querySelector(".order-choice-list");
  list?.classList.toggle("is-order-correct", bonusCorrect);
  list?.classList.toggle("is-order-incorrect", !bonusCorrect);
  app.querySelectorAll("[data-bonus-step-id]").forEach((button) => { button.disabled = true; });
  const progress = app.querySelector(".selection-progress");
  if (progress) {
    progress.textContent = bonusCorrect ? "Order correct" : "Order incorrect";
    progress.classList.toggle("is-correct", bonusCorrect);
    progress.classList.toggle("is-incorrect", !bonusCorrect);
  }
  app.querySelector("#submit-order").disabled = true;
}

function renderNextRoundScreen() {
  return `
    <section class="next-round-screen" aria-labelledby="next-round-screen-title" aria-live="off">
      <p class="kicker">Next round</p>
      <h3 id="next-round-screen-title">Next round in</h3>
      <strong id="end-screen-countdown" class="end-screen-countdown" aria-label="Time until the next round">--:--:--</strong>
      <p class="next-round-motivation">Return tomorrow to keep your Round alive.</p>
    </section>
  `;
}

function renderMissedDay() {
  const missedMapCopy = missedDayState.missedDays === 1
    ? "You missed yesterday’s puzzle."
    : `You missed ${missedDayState.missedDays} daily puzzles.`;
  app.innerHTML = `
    <section class="panel missed-day-panel">
      <div class="result-banner failed animate">
        <h2>Run ended</h2>
        <p>${escapeHtml(missedMapCopy)} Your Score, Solves and Highest Round are safe.</p>
        <p class="survival-summary">Your run ended at <strong>Round ${missedDayState.roundsBeforeLoss}</strong>. Today starts a new run at <strong>Round 1</strong>.</p>
      </div>
      <div class="actions">
        <button id="continue-after-missed-day" class="button primary" type="button">Play today’s puzzle</button>
      </div>
    </section>
  `;

  focusAfterRender("missed-day:lost");

  app.querySelector("#continue-after-missed-day").addEventListener("click", () => {
    missedDayState = { ...missedDayState, resolved: true };
    saveMissedDayState();
    lastResultClass = null;
    render();
  });
}

function buildScoreSharePayload() {
  const activeSession = ['word', 'blood'].includes(activePlay?.type) ? dayState?.sessions?.[activePlay.type] : state;
  const isCorrect = ['word', 'blood'].includes(activePlay?.type) ? activeSession?.success : state.isCorrect;
  const shareRound = !isCorrect
    ? Math.max(1, activeSession?.roundsSurvivedBeforeLoss || 1)
    : Math.max(1, streakCount);
  const shareUrl = document.querySelector('link[rel="canonical"]')?.href || window.location.href;

  const scoreText = [
    `🧟 The Daily Undead · ${formatDate(puzzle.dateKey)}`,
    "",
    `🔥 Round: ${shareRound}`,
    `⚡ Score: ${score}`,
    `🏆 Solves: ${solves}`,
    `📈 Highest Round: ${bestRound}`,
    "",
    "Think you can do better?",
    "Give it a try!",
  ].join("\n");

  return {
    scoreText,
    text: `${scoreText}\n\n${shareUrl}`,
  };
}

async function copyScoreText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.append(textArea);
  textArea.select();
  const copied = document.execCommand("copy");
  textArea.remove();

  if (!copied) throw new Error("Copying is not supported in this browser.");
}

async function shareScore(button, status) {
  const payload = buildScoreSharePayload();

  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ text: payload.text });
      button.textContent = "Shared!";
      status.textContent = "Your score was shared.";
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }

  try {
    await copyScoreText(payload.text);
    button.textContent = "Score copied!";
    status.textContent = "Sharing wasn’t available, so your score was copied instead.";
  } catch {
    status.textContent = "Couldn’t share automatically. Please try again.";
  }
}

function finaliseBonusSubmission(official, bonusCorrect) {
  const bonusPoints = calculateBonusPoints(state.mapPoints, bonusCorrect);
  bonusSubmissionPending = false;
  if (bonusCorrect) {
    if (official && !state.bonusPointsRecorded) {
      awardPoints(bonusPoints);
      puzzleStats.easter.score += bonusPoints;
      savePuzzleStats();
    }
    if (official) {
      dayState.officialCompleted = true;
      dayState.officialResult = { type: "easter", puzzleType: "easter", success: true, points: state.mapPoints + bonusPoints };
    }
    dayState.lastCompleted = { type: "easter", mode: activePlay?.mode || "for_fun", success: true, points: state.mapPoints + bonusPoints };
    setState({
      bonusComplete: true,
      bonusPoints,
      bonusPointsRecorded: true,
      complete: true,
      success: true,
      points: state.mapPoints + bonusPoints,
    });
    playScoreCount(state.mapPoints + bonusPoints, { reward: 'double-points-a' });
    return;
  }
  if (official) {
    dayState.officialCompleted = true;
    dayState.officialResult = { type: "easter", puzzleType: "easter", success: true, points: state.mapPoints };
  }
  dayState.lastCompleted = { type: "easter", mode: activePlay?.mode || "for_fun", success: true, points: state.mapPoints };
  setState({ bonusFailed: true, bonusPoints: 0, bonusPointsRecorded: true, complete: true, success: true, points: state.mapPoints });
  playScoreCount(state.mapPoints);
}

function renderResult() {
  const official = isOfficialPlay("easter");
  const selectedMap = selectableMaps.find((map) => map.id === state.selectedMapId);
  const answerTitle = getPuzzleAnswerTitle();
  const failedBonus = state.isCorrect && state.bonusFailed;
  const perfectResult = state.isCorrect && state.bonusComplete;
  const clueLabel = state.lockedClues === 1 ? "clue" : "clues";
  const endedRound = Math.max(1, state.roundsSurvivedBeforeLoss);
  const resultTitle = !official
    ? failedBonus || !state.isCorrect
      ? "Not quite"
      : perfectResult
        ? "Puzzle Complete!"
        : "Map Identified!"
    : failedBonus
      ? "Not quite"
      : perfectResult
        ? "Double Points!"
        : state.isCorrect
          ? "Round Survived!"
          : "Run ended";
  const answerMarkup = `<strong class="result-answer-name identified-map-name">${escapeHtml(answerTitle)}</strong>`;
  const resultCopy = failedBonus
    ? official
      ? `You identified ${answerMarkup}, but the step order was incorrect.`
      : `You identified ${answerMarkup}, but the step order was incorrect. This result did not affect your stats.`
    : perfectResult
      ? official
        ? `You found ${answerMarkup} using ${state.lockedClues} ${clueLabel} and got the steps in the correct order.`
        : `You found ${answerMarkup} using ${state.lockedClues} ${clueLabel} and got the steps in the correct order. This result did not affect your stats.`
      : state.isCorrect
        ? official
          ? `You identified ${answerMarkup} using ${state.lockedClues} ${clueLabel}. You earned ${state.mapPoints} points this round.`
          : `You identified ${answerMarkup} using ${state.lockedClues} ${clueLabel}. Now try the bonus objective.`
        : `You chose <strong class="result-answer-name">${escapeHtml(selectedMap?.title ?? "an unknown map")}</strong>. Today’s answer was ${answerMarkup}. ${official ? "Your permanent Score and Solves are safe." : "This result did not affect your stats."}`;
  const resultClass = failedBonus
      ? "partial"
      : state.isCorrect
          ? "correct"
          : "failed";
  const isFinished = !state.isCorrect || state.bonusComplete || state.bonusFailed;
  const resultAnimationKey = `${resultClass}:${isFinished ? "finished" : "bonus"}:${perfectResult ? "perfect" : "standard"}`;
  const animateResult = resultAnimationKey !== lastResultClass;
  lastResultClass = resultAnimationKey;
  const resultScore = state.mapPoints + state.bonusPoints;
  const resultVariantClasses = [
    animateResult ? "animate" : "",
    perfectResult && official ? "double-points-result" : "",
    failedBonus ? "bonus-correction-result" : "",
    state.isCorrect && !isFinished ? "map-identification-banner" : "",
  ].filter(Boolean).join(" ");

  app.innerHTML = `
    <section class="panel${state.isCorrect && !isFinished ? " easter-bonus-panel" : ""}">
      ${state.isCorrect && !isFinished && !official ? '<p class="kicker">Just for fun</p>' : ""}
      <div class="result-banner ${resultClass}${resultVariantClasses ? ` ${resultVariantClasses}` : ""}">
        <h2>${resultTitle}</h2>
        <p>${resultCopy}</p>
        ${official && state.isCorrect && isFinished ? `<div class="result-score-total"><span>Round score</span><strong data-count-to="${resultScore}">0</strong></div>` : ""}
        ${
          official && !state.isCorrect
            ? `<p class="survival-summary">Your run ended at <strong>Round ${endedRound}</strong>. Your next game starts at <strong>Round 1</strong>.</p>`
            : ""
        }
      </div>
      ${state.isCorrect ? renderBonus() : '<h3>Today’s three clues</h3><div id="clue-list" class="clue-list"></div>'}
      ${
        isFinished
            ? `<div class="actions share-score-actions">
              ${official ? renderResultAccountAction() : ""}
              ${official ? '<button id="share-score" class="button share-score-button" type="button">Share with your squad</button>' : ""}
              ${isMultiPuzzleLaunchActive() ? `<button id="return-to-puzzle-home" class="button" type="button">${areAllPuzzlesCompleted() ? "View puzzles" : "Play another puzzle"}</button>` : ""}
            </div>
            ${official ? '<p id="share-score-status" class="share-score-status" aria-live="polite"></p>' : ""}`
          : ""
      }
    </section>
    ${isFinished ? renderNextRoundScreen() : ""}
  `;

  updateNextRoundCountdown();
  animatePointTotal(app.querySelector("[data-count-to]"), resultScore);

  if (!state.isCorrect) {
    renderClueCards(app.querySelector("#clue-list"), 3);
  }
  focusAfterRender(`result:${resultAnimationKey}`);
  app.querySelector("#share-score")?.addEventListener("click", (event) => {
    snapPageToTop();
    shareScore(event.currentTarget, app.querySelector("#share-score-status"));
  });
  bindResultAccountAction();
  app.querySelector("#return-to-puzzle-home")?.addEventListener("click", () => {
    renderHub();
    snapPageToTop();
  });
  if (!state.isCorrect || state.bonusComplete || state.bonusFailed) return;

  app.querySelectorAll("[data-bonus-step-id]").forEach((button) => {
    button.addEventListener("click", () => {
      if (bonusSubmissionPending) return;
      const stepId = button.dataset.bonusStepId;
      state = { ...state, bonusOrder: toggleOrderedSelection(state.bonusOrder, stepId) };
      if (state.bonusOrder.includes(stepId)) void gameAudio.play(`bonus-step-${state.bonusOrder.length}`);
      else void gameAudio.play('map-select');
      saveState();
      updateBonusSelection(button);
    });
  });
  app.querySelector("#submit-order").addEventListener("click", () => {
    if (bonusSubmissionPending) return;
    if (official && !confirmAccountResultSubmission(accountController)) return;
    const bonusCorrect = isCorrectOrder(state.bonusOrder, puzzle.chronologicalSteps);
    if (bonusCorrect) void gameAudio.play('answer-lock');
    if (official) {
      accountController.recordBonusResult({
        puzzleDate: puzzle.dateKey,
        bonusOrder: state.bonusOrder,
      });
    }
    showBonusSubmissionFeedback(bonusCorrect);
    const delay = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 120 : bonusCorrect ? 800 : 950;
    window.setTimeout(() => finaliseBonusSubmission(official, bonusCorrect), delay);
  });
}

function render() {
  mysteryBox.cancel();
  if (!activePlay) {
    startPuzzle(dayState.officialType, "official");
    return;
  }
  if (activePlay.type === 'blood') {
    renderBloodPuzzle();
    return;
  }
  if (activePlay.type === "word") {
    renderWordPuzzle();
    return;
  }
  if (state.phase !== "result") {
    lastResultClass = null;
  }
  updateRoundMilestoneDisplay();

  switch (state.phase) {
    case "game":
      renderGameSelection();
      break;
    case "map":
      renderMapSelection();
      break;
    case "result":
      renderResult();
      break;
    default:
      renderClues();
  }
}

async function initialise() {
  try {
    initialiseStatExplainers();
    if (await checkForReleaseUpdate({ force: true })) return;
    await synchroniseClock();
    await loadData();
    populateProfileDropdowns();
    initialiseProfileScrollbars();
    const dateKey = getDateKey();
    liveDateKey = getUtcDateKey(getCurrentTime());
    dayPreviewEnabled = isLocalPreview && dateKey !== liveDateKey;
    localStorage = createDayPreviewStorage(browserStorage, dateKey, dayPreviewEnabled, new URLSearchParams(window.location.search).get('previewRun') || '');
    if (dayPreviewEnabled) {
      const fresh = document.createElement('button'); fresh.id = 'fresh-dev-preview'; fresh.type = 'button'; fresh.className = 'dev-day-button'; fresh.textContent = 'FRESH PREVIEW';
      fresh.addEventListener('click', () => {
        const url = new URL(window.location.href); url.searchParams.set('previewRun', crypto.randomUUID()); window.location.assign(url.href);
      });
      document.querySelector('.site-footer > p')?.append(document.createTextNode(' '), fresh);
    }
    migrateStoredRoundNumbering(localStorage, {
      streakKey: streakStorageKey,
      bestRoundKey: bestRoundStorageKey,
      versionKey: roundNumberingStorageKey,
    });
    streakCount = loadStreak();
    bestRound = Math.max(loadBestRound(), streakCount);
    // Older browser saves only tracked the current round. Persist that value as
    // the initial best before a later loss can reset the current round.
    saveBestRound();
    solves = loadSolves();
    score = loadScore();
    puzzleStats = loadPuzzleStats();
    lastPlayedDate = loadLastPlayedDate();
    puzzle = buildDailyPuzzle(dateKey, maps);
    wordPuzzle = buildDailyWordPuzzle(dateKey, wordEntries);
    if (bloodTiesEnabled) bloodPuzzle = buildDailyBloodTiesPuzzle(dateKey);
    const legacyEasterState = loadState();
    dayState = loadMultiPuzzleDayState(legacyEasterState);
    state = dayState.sessions.easter;
    score = migrateLegacyLocalScore(localStorage, {
      scoreKey: scoreStorageKey,
      legacyPointsKey: legacyPointsStorageKey,
      markerKey: legacyScoreMigrationStorageKey,
      currentScore: score,
      solves,
      dailyState: legacyEasterState,
    }).score;
    accountController = socialDemoEnabled
      ? initialiseSocialDemo()
      : await initialiseAccount({
          apiUrl: leaderboardsApiUrl,
          puzzleDate: dateKey,
          readOnlyProgress: dayPreviewEnabled,
          getLocalSnapshot: getLocalAccountSnapshot,
          applyRemoteAccount: dayPreviewEnabled ? () => {} : applyRemoteAccount,
        });
    document.addEventListener("keydown", (event) => {
      if (activePlay?.type !== "word") return;
      if (!shouldHandleWordShortcut(event, {
        presenting: mysteryBox.isPresenting,
        modalOpen: Boolean(document.querySelector('dialog[open]')),
      })) return;
      const letter = normalizeLetter(event.key);
      if (letter) submitLetter(letter);
    });
    protectedDates = await loadProtectedDates(lastPlayedDate, dateKey);
    prepareCommunityStatsDisplay();
    migrateCompletedScore();
    clearTemporaryLocalProgress();
    if (dayState.officialCompleted && dayState.officialResult?.success) {
      recordDailyParticipation(dateKey);
    } else if (!lastPlayedDate && (streakCount > 0 || score > 0)) {
      // Preserve existing players' progress when missed-day tracking is first introduced.
      recordDailyParticipation(dateKey);
    }
    missedDayState = prepareMissedDayState(dateKey);
    updatePuzzleDateDisplay(dateKey);
    updateStreakDisplay();
    updateSolvesDisplay();
    updateScoreDisplay();
    initialiseProgressionUpdate();
    updateNextRoundCountdown();
    window.setInterval(updateNextRoundCountdown, 1000);
    initialiseReleaseMonitoring();
    if (missedDayState && !missedDayState.resolved) {
      renderMissedDay();
    } else {
      const destination = restorePlayDestination(localStorage, dateKey, dayState);
      if (destination?.screen === "hub") renderHub();
      else startPuzzle(destination?.type || dayState.officialType, destination?.mode || "official");
    }
  } catch (error) {
    console.error(error);
    app.innerHTML = `
      <section class="panel error-panel">
        <h2>The puzzle couldn’t load</h2>
        <p>Refresh the page and try again.</p>
        ${window.location.protocol === "file:"
          ? "<p>If you opened <code>index.html</code> directly, start a local web server and open the supplied local URL instead.</p>"
          : ""}
      </section>
    `;
    focusAfterRender("error");
  }
}

initialise();
