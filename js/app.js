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
} from "./game-core.js?v=20261003-1";
import {
  canUseRequestedPreviewDate,
  getProgressionUpdateVisibility,
  isLocalDevelopmentHostname,
  migrateLegacyLocalScore,
  migrateStoredRoundNumbering,
  prepareMissedDayProgress,
} from "./progression.js?v=20261003-1";
import {
  confirmAccountResultSubmission,
  initialiseAccount,
} from "./account.js?v=20261003-1";
import {
  fetchCommunityStats,
  formatCommunityCount,
  formatSolvePercentage,
  resolveCommunityStatsApiUrl,
  submitCommunityAttempt,
} from "./community-stats.js?v=20261003-1";
import {
  initialiseLeaderboards,
  resolveLeaderboardsApiUrl,
} from "./leaderboards.js?v=20261003-1";
import { createSocialDemoFetch, initialiseSocialDemo } from "./social-demo.js?v=20261003-1";

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
const advanceDevDayButton = document.querySelector("#advance-dev-day");
const leaderboardsButton = document.querySelector("#leaderboards-button");
const leaderboardsDialog = document.querySelector("#leaderboards-dialog");
const clueTemplate = document.querySelector("#clue-template");
const communityStatsContainer = document.querySelector(".community-stats");
const communityPlayersTodayLabel = document.querySelector("#community-players-today");
const communityGamesTotalLabel = document.querySelector("#community-games-total");
const communityYesterdaySolvedLabel = document.querySelector("#community-yesterday-solved");
const communityYesterdayMapLabel = document.querySelector("#community-yesterday-map");
const isLocalDevelopment = isLocalDevelopmentHostname(window.location.hostname);
const socialDemoEnabled = isLocalDevelopment && new URLSearchParams(window.location.search).get("socialDemo") === "1";
const communityStatsApiUrl = resolveCommunityStatsApiUrl({ isLocalDevelopment });
const leaderboardsApiUrl = resolveLeaderboardsApiUrl({ isLocalDevelopment });
const streakStorageKey = "the-daily-undead:streak";
const roundNumberingStorageKey = "the-daily-undead:round-numbering";
const solvesStorageKey = "the-daily-undead:total-rounds";
const scoreStorageKey = "the-daily-undead:score";
const legacyPointsStorageKey = "the-daily-undead:total-points";
const legacyScoreMigrationStorageKey = "the-daily-undead:legacy-score-migration";
const progressionUpdateStorageKey = "the-daily-undead:progression-update-v2";
const statExplainers = {
  round: {
    title: "Round",
    copy: "Your current survival run. It advances after each solve and ends if you miss a day or choose the wrong map.",
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
let accountController = {
  canSync: false,
  resultSubmissionRequiresSignIn: false,
  requestResultSignIn() {},
  scheduleSave() {},
  async recordMapResult() { return null; },
  async recordBonusResult() { return null; },
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
      isLocalDevelopment &&
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
    const response = await fetch(`./index.html?clock=${requestStarted}`, {
      method: "HEAD",
      cache: "no-store",
    });
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
  communityPlayersTodayLabel.textContent = formatCommunityCount(stats?.playersToday);
  communityGamesTotalLabel.textContent = formatCommunityCount(stats?.totalGames);
  communityYesterdaySolvedLabel.textContent = formatSolvePercentage(stats?.yesterday?.solvePercentage);
  communityStatsContainer.dataset.status = stats ? "ready" : "unavailable";
}

function prepareCommunityStatsDisplay() {
  const yesterdayDateKey = getPreviousDateKey(puzzle.dateKey);

  try {
    const yesterdayPuzzle = buildDailyPuzzle(yesterdayDateKey, maps);
    communityYesterdayMapLabel.textContent = getAnswerDisplayTitle(
      yesterdayPuzzle.map,
      catalog.answerEquivalents,
    );
  } catch {
    communityYesterdayMapLabel.textContent = "yesterday’s map";
  }

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

function recordCommunityAttempt(isCorrect) {
  // Preview puzzles never contribute to the live community totals.
  if (!communityStatsApiUrl || puzzle.dateKey !== liveDateKey) return;

  submitCommunityAttempt({
    apiUrl: communityStatsApiUrl,
    puzzleDate: puzzle.dateKey,
    puzzleId: puzzle.key,
    mapId: puzzle.map.id,
    mapName: getPuzzleAnswerTitle(),
    isCorrect,
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

if (isLocalDevelopment) {
  advanceDevDayButton.hidden = false;
  advanceDevDayButton.addEventListener("click", advanceSimulatedDay);
} else {
  advanceDevDayButton.remove();
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
  const indexResponse = await fetch("./data/maps/index.json", { cache: "no-store" });
  if (!indexResponse.ok) {
    throw new Error("Could not load the map index.");
  }

  catalog = await indexResponse.json();
  if (!Array.isArray(catalog.games) || !Array.isArray(catalog.maps)) {
    throw new Error("The map index is invalid.");
  }

  const gameTitles = new Map(catalog.games.map((game) => [game.id, game.title]));
  if (gameTitles.size !== catalog.games.length) {
    throw new Error("The map index contains a duplicate game id.");
  }

  const responses = await Promise.all(
    catalog.maps.map(async (filename) => {
      const response = await fetch(`./data/maps/${filename}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Could not load ${filename}.`);
      }
      return validateMap(await response.json(), filename);
    }),
  );

  maps = responses;
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
  };
}

function storageKey() {
  return `dead-drop:${puzzle.dateKey}`;
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
    const response = await fetch(url, { headers: { Accept: "application/json" } });
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
  try {
    localStorage.setItem(storageKey(), JSON.stringify(state));
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
    dailyState: state,
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

  if (
    account?.dailyState &&
    supportedStateVersions.has(account.dailyState.stateVersion) &&
    account.dailyState.puzzleKey === puzzle.key
  ) {
    state = { ...createInitialState(), ...account.dailyState, stateVersion: currentStateVersion };
  } else {
    state = createInitialState();
  }

  try {
    localStorage.setItem(storageKey(), JSON.stringify(state));
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

function renderHeading(title, description, kicker = "Today’s round") {
  return `
    <div class="screen-heading">
      <p class="kicker">${escapeHtml(kicker)}</p>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(description)}</p>
    </div>
  `;
}

function createClueCard(step, index) {
  const card = clueTemplate.content.firstElementChild.cloneNode(true);
  card.querySelector(".clue-number").textContent = `Clue ${index + 1}`;
  card.querySelector(".clue-text").textContent = step.hardClue;
  return card;
}

function renderClueCards(container, visibleCount = 3, showHidden = false) {
  puzzle.displayedSteps.forEach((step, index) => {
    if (index < visibleCount) {
      container.append(createClueCard(step, index));
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

function renderClues() {
  app.innerHTML = `
    <section class="panel">
      ${renderHeading(
        "Which Zombies map is it?",
        "Identify the map from its main quest steps. Reveal as few clues as possible to earn more points.",
      )}
      <div id="clue-list" class="clue-list"></div>
      <div class="actions">
        <button id="reveal-clue" class="button" type="button" ${state.cluesRevealed >= 3 ? "disabled" : ""}>
          ${state.cluesRevealed >= 3 ? "All clues revealed" : "Reveal next clue"}
        </button>
        <button id="lock-answer" class="button primary" type="button">
          Select map · ${state.cluesRevealed} ${state.cluesRevealed === 1 ? "clue" : "clues"}
        </button>
      </div>
    </section>
  `;

  renderClueCards(app.querySelector("#clue-list"), state.cluesRevealed, true);
  focusAfterRender("clues");
  app.querySelector("#reveal-clue")?.addEventListener("click", () => {
    const cluesRevealed = Math.min(3, state.cluesRevealed + 1);
    setState(
      { cluesRevealed },
      cluesRevealed === 3 ? "#lock-answer" : "#reveal-clue",
    );
  });
  app.querySelector("#lock-answer").addEventListener("click", () => {
    setState({ phase: "game", lockedClues: null });
  });
}

function renderGameSelection() {
  const games = [...catalog.games].sort((left, right) => left.releaseOrder - right.releaseOrder);

  app.innerHTML = `
    <section class="panel">
      ${renderHeading("Choose the game", `You have revealed ${state.cluesRevealed} ${state.cluesRevealed === 1 ? "clue" : "clues"}.`, "Lock in your answer")}
      <ul class="card-grid">
        ${games
          .map(
            (game) => `
              <li>
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
    <section class="panel">
      ${renderHeading(`Choose a ${game.title} map`, "Tap a map, then confirm your final answer.", "Lock in your answer")}
      <ul class="card-grid">
        ${gameMaps
          .map(
            (map) => `
              <li>
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
      setState(
        { selectedMapId: mapId },
        `[data-map-id="${CSS.escape(mapId)}"]`,
      );
    });
  });
  app.querySelector("#back-to-games").addEventListener("click", () => {
    setState({ phase: "game", selectedGameId: null, selectedMapId: null });
  });
  app.querySelector("#confirm-map").addEventListener("click", () => {
    if (!confirmAccountResultSubmission(accountController)) return;
    const isCorrect = isAcceptedMapSelection(
      state.selectedMapId,
      puzzle.map.id,
      catalog.answerEquivalents,
    );
    const mapPoints = isCorrect ? calculateMapPoints(state.cluesRevealed) : 0;
    const roundsSurvivedBeforeLoss = isCorrect ? 0 : streakCount;
    const newBestRound = recordMapResult(isCorrect);
    if (!state.pointsRecorded) awardPoints(mapPoints);
    if (isCorrect) recordDailyParticipation();
    recordCommunityAttempt(isCorrect);
    accountController.recordMapResult({
      puzzleDate: puzzle.dateKey,
      puzzleId: puzzle.key,
      selectedMapId: state.selectedMapId,
      cluesUsed: state.cluesRevealed,
    });
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
    });
  });
}

function getPuzzleAnswerTitle() {
  return getAnswerDisplayTitle(puzzle.map, catalog.answerEquivalents);
}

function renderCorrectStepOrder(showTicks = false) {
  return `
    <ol class="steps-order">
      ${puzzle.chronologicalSteps
        .map(
          (step, index) => `
            <li>
              <span class="order-rank">${index + 1}</span>
              <span>${escapeHtml(step.clue)}</span>
              ${showTicks ? '<span class="step-tick" aria-label="Correct">✓</span>' : ""}
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
        ${renderCorrectStepOrder()}
      </section>
    `;
  }

  return `
    <section class="bonus-panel">
      <h3>Bonus Objective: Put the steps in order</h3>
      <p class="helper-text">Select the steps in the order they occur to earn Double Points. Tap a selected step again to remove it and revise your order.</p>
      <p class="selection-progress">Selected: ${state.bonusOrder.length} of 3</p>
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
        <button id="submit-order" class="button primary" type="button" ${state.bonusOrder.length === 3 ? "" : "disabled"}>
          Submit order · One attempt only
        </button>
      </div>
    </section>
  `;
}

function renderNextRoundScreen() {
  return `
    <section class="next-round-screen" aria-labelledby="next-round-screen-title" aria-live="off">
      <p class="kicker">Next round</p>
      <h3 id="next-round-screen-title">Next map in</h3>
      <strong id="end-screen-countdown" class="end-screen-countdown" aria-label="Time until the next round">--:--:--</strong>
      <p class="next-round-motivation">Return tomorrow to keep your Round alive.</p>
    </section>
  `;
}

function renderMissedDay() {
  const missedMapCopy = missedDayState.missedDays === 1
    ? "You missed yesterday’s map."
    : `You missed ${missedDayState.missedDays} daily maps.`;
  app.innerHTML = `
    <section class="panel missed-day-panel">
      <div class="result-banner failed animate">
        <h2>Run ended</h2>
        <p>${escapeHtml(missedMapCopy)} Your Score, Solves and Highest Round are safe.</p>
        <p class="survival-summary">Your run ended at <strong>Round ${missedDayState.roundsBeforeLoss}</strong>. Today starts a new run at <strong>Round 1</strong>.</p>
      </div>
      <div class="actions">
        <button id="continue-after-missed-day" class="button primary" type="button">Play today’s map</button>
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
  const shareRound = !state.isCorrect
    ? Math.max(1, state.roundsSurvivedBeforeLoss)
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

function renderResult() {
  const selectedMap = selectableMaps.find((map) => map.id === state.selectedMapId);
  const answerTitle = getPuzzleAnswerTitle();
  const failedBonus = state.isCorrect && state.bonusFailed;
  const perfectResult = state.isCorrect && state.bonusComplete;
  const clueLabel = state.lockedClues === 1 ? "clue" : "clues";
  const endedRound = Math.max(1, state.roundsSurvivedBeforeLoss);
  const resultTitle = failedBonus
      ? "Not quite"
      : perfectResult
        ? "Double Points!"
        : state.isCorrect
          ? "Round Survived!"
          : "Run ended";
  const resultCopy = failedBonus
      ? `You identified ${answerTitle}, but the step order was incorrect. You still earned ${state.mapPoints} points this round.`
      : perfectResult
        ? `You found ${answerTitle} using ${state.lockedClues} ${clueLabel} and got the steps in the correct order. You earned ${state.mapPoints + state.bonusPoints} points this round.`
        : state.isCorrect
          ? `You identified ${answerTitle} using ${state.lockedClues} ${clueLabel}. You earned ${state.mapPoints} points this round.`
          : `You chose ${selectedMap?.title ?? "an unknown map"}. Today’s answer was ${answerTitle}. Your permanent Score and Solves are safe.`;
  const resultClass = failedBonus
      ? "partial"
      : perfectResult
        ? "perfect"
        : state.isCorrect
          ? "correct"
          : "failed";
  const animateResult = resultClass !== lastResultClass;
  lastResultClass = resultClass;
  const isFinished = !state.isCorrect || state.bonusComplete || state.bonusFailed;

  app.innerHTML = `
    <section class="panel">
      <div class="result-banner ${resultClass}${animateResult ? " animate" : ""}">
        <h2>${resultTitle}</h2>
        <p>${escapeHtml(resultCopy)}</p>
        ${
          !state.isCorrect
            ? `<p class="survival-summary">Your run ended at <strong>Round ${endedRound}</strong>. Your next game starts at <strong>Round 1</strong>.</p>`
            : ""
        }
      </div>
      ${state.isCorrect ? renderBonus() : '<h3>Today’s three clues</h3><div id="clue-list" class="clue-list"></div>'}
      ${
        isFinished
          ? `<div class="actions share-score-actions">
              <button id="share-score" class="button share-score-button" type="button">Share with your squad</button>
            </div>
            <p id="share-score-status" class="share-score-status" aria-live="polite"></p>`
          : ""
      }
    </section>
    ${isFinished ? renderNextRoundScreen() : ""}
  `;

  updateNextRoundCountdown();

  if (!state.isCorrect) {
    renderClueCards(app.querySelector("#clue-list"), 3);
  }
  focusAfterRender(`result:${resultClass}:${isFinished ? "finished" : "bonus"}`);
  app.querySelector("#share-score")?.addEventListener("click", (event) => {
    shareScore(event.currentTarget, app.querySelector("#share-score-status"));
  });
  if (!state.isCorrect || state.bonusComplete || state.bonusFailed) return;

  app.querySelectorAll("[data-bonus-step-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const stepId = button.dataset.bonusStepId;
      setState(
        { bonusOrder: toggleOrderedSelection(state.bonusOrder, stepId) },
        `[data-bonus-step-id="${CSS.escape(stepId)}"]`,
      );
    });
  });
  app.querySelector("#submit-order").addEventListener("click", () => {
    if (!confirmAccountResultSubmission(accountController)) return;
    accountController.recordBonusResult({
      puzzleDate: puzzle.dateKey,
      bonusOrder: state.bonusOrder,
    });
    if (isCorrectOrder(state.bonusOrder, puzzle.chronologicalSteps)) {
      const bonusPoints = calculateBonusPoints(state.mapPoints, true);
      if (!state.bonusPointsRecorded) awardPoints(bonusPoints);
      setState({
        bonusComplete: true,
        bonusPoints,
        bonusPointsRecorded: true,
      });
      return;
    }

    setState({ bonusFailed: true, bonusPoints: 0, bonusPointsRecorded: true });
  });
}

function render() {
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
    await synchroniseClock();
    await loadData();
    populateProfileDropdowns();
    initialiseProfileScrollbars();
    const dateKey = getDateKey();
    liveDateKey = getUtcDateKey(getCurrentTime());
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
    lastPlayedDate = loadLastPlayedDate();
    puzzle = buildDailyPuzzle(dateKey, maps);
    state = loadState();
    score = migrateLegacyLocalScore(localStorage, {
      scoreKey: scoreStorageKey,
      legacyPointsKey: legacyPointsStorageKey,
      markerKey: legacyScoreMigrationStorageKey,
      currentScore: score,
      solves,
      dailyState: state,
    }).score;
    accountController = socialDemoEnabled
      ? initialiseSocialDemo()
      : await initialiseAccount({
          apiUrl: leaderboardsApiUrl,
          puzzleDate: dateKey,
          getLocalSnapshot: getLocalAccountSnapshot,
          applyRemoteAccount,
        });
    protectedDates = await loadProtectedDates(lastPlayedDate, dateKey);
    prepareCommunityStatsDisplay();
    migrateCompletedScore();
    clearTemporaryLocalProgress();
    if (state.phase === "result" && typeof state.isCorrect === "boolean") {
      recordCommunityAttempt(state.isCorrect);
    }
    if (state.phase === "result" && state.isCorrect) {
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
    if (missedDayState && !missedDayState.resolved) {
      renderMissedDay();
    } else {
      render();
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
