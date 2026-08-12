import {
  buildDailyPuzzle,
  calculateBonusPoints,
  calculateMapPoints,
  calculateNextPoints,
  calculateNextStreak,
  getAnswerDisplayTitle,
  getMillisecondsUntilNextUtcDay,
  getUtcDateKey,
  isAcceptedMapSelection,
  isCorrectOrder,
  isValidDateKey,
  orderMapsForGame,
  toggleOrderedSelection,
} from "./game-core.js?v=20260812-4";
import {
  calculateReviveCost,
  canUseRequestedPreviewDate,
  incrementReviveCount,
  isLocalDevelopmentHostname,
  prepareMissedDayProgress,
  purchaseMissedDayRevive,
  resetReviveCount,
  shouldResetReviveCycle,
} from "./progression.js?v=20260812-4";
import {
  fetchCommunityStats,
  formatCommunityCount,
  formatSolvePercentage,
  resolveCommunityStatsApiUrl,
  submitCommunityAttempt,
} from "./community-stats.js?v=20260812-4";

const app = document.querySelector("#app");
const dateLabel = document.querySelector("#puzzle-date");
const streakLabel = document.querySelector("#streak-count");
const totalRoundsLabel = document.querySelector("#total-rounds-count");
const pointsLabel = document.querySelector("#points-count");
const countdownLabel = document.querySelector("#next-round-countdown");
const advanceDevDayButton = document.querySelector("#advance-dev-day");
const clueTemplate = document.querySelector("#clue-template");
const communityStatsContainer = document.querySelector(".community-stats");
const communityPlayersTodayLabel = document.querySelector("#community-players-today");
const communityGamesTotalLabel = document.querySelector("#community-games-total");
const communityYesterdaySolvedLabel = document.querySelector("#community-yesterday-solved");
const communityYesterdayMapLabel = document.querySelector("#community-yesterday-map");
const isLocalDevelopment = isLocalDevelopmentHostname(window.location.hostname);
const communityStatsApiUrl = resolveCommunityStatsApiUrl({ isLocalDevelopment });
const streakStorageKey = "the-daily-undead:streak";
const totalRoundsStorageKey = "the-daily-undead:total-rounds";
const pointsStorageKey = "the-daily-undead:total-points";
const reviveCountStorageKey = "the-daily-undead:revive-count";
const lastPlayedDateStorageKey = "the-daily-undead:last-played-date";
const missedDayStorageKey = "the-daily-undead:missed-day";
const devPreviewStorageKey = "the-daily-undead:dev-preview";
const currentStateVersion = 10;
const supportedStateVersions = new Set([2, 3, 4, 5, 6, 7, 8, 9, currentStateVersion]);
// Saves created before progressive revive pricing did not record the amount paid.
const legacyReviveCost = 50;

let catalog;
let maps;
let selectableMaps;
let puzzle;
let state;
let streakCount = 0;
let totalRounds = 0;
let totalPoints = 0;
let reviveCount = 0;
let lastPlayedDate = null;
let missedDayState = null;
let lastResultClass = null;
let clockOffset = 0;
let liveDateKey;
let activeScreenKey = null;
let pendingFocusSelector = null;

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
    streakRecorded: false,
    totalRoundsRecorded: false,
    roundsSurvivedBeforeLoss: 0,
    pointsBeforeLoss: 0,
    revived: false,
    reviveCostPaid: 0,
    reviveCostOffered: 0,
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
    return Number.isInteger(savedStreak) && savedStreak >= 0 ? savedStreak : 0;
  } catch {
    return 0;
  }
}

function saveStreak() {
  try {
    localStorage.setItem(streakStorageKey, String(streakCount));
  } catch {
    // The streak remains available for the current session when storage is disabled.
  }
}

function loadTotalRounds() {
  try {
    const savedTotal = Number.parseInt(localStorage.getItem(totalRoundsStorageKey), 10);
    return Number.isInteger(savedTotal) && savedTotal >= 0 ? savedTotal : 0;
  } catch {
    return 0;
  }
}

function saveTotalRounds() {
  try {
    localStorage.setItem(totalRoundsStorageKey, String(totalRounds));
  } catch {
    // The lifetime total remains available for the current session when storage is disabled.
  }
}

function loadPoints() {
  try {
    const savedPoints = Number.parseInt(localStorage.getItem(pointsStorageKey), 10);
    return Number.isInteger(savedPoints) && savedPoints >= 0 ? savedPoints : 0;
  } catch {
    return 0;
  }
}

function savePoints() {
  try {
    localStorage.setItem(pointsStorageKey, String(totalPoints));
  } catch {
    // The total remains available for the current session when storage is disabled.
  }
}

function loadReviveCount() {
  try {
    const savedCount = Number.parseInt(localStorage.getItem(reviveCountStorageKey), 10);
    return Number.isInteger(savedCount) && savedCount >= 0 ? savedCount : 0;
  } catch {
    return 0;
  }
}

function saveReviveCount() {
  try {
    localStorage.setItem(reviveCountStorageKey, String(reviveCount));
  } catch {
    // The revive count remains available for the current session when storage is disabled.
  }
}

function recordRevivePurchase() {
  reviveCount = incrementReviveCount(reviveCount);
  saveReviveCount();
}

function resetReviveCycle() {
  if (reviveCount === 0) return;
  reviveCount = resetReviveCount();
  saveReviveCount();
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
      saved.roundsBeforeLoss >= 0 &&
      Number.isInteger(saved?.pointsBeforeLoss) &&
      saved.pointsBeforeLoss >= 0
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
}

function prepareMissedDayState(dateKey) {
  const saved = loadSavedMissedDayState();
  const progression = prepareMissedDayProgress({
    savedState: saved,
    lastPlayedDate,
    dateKey,
    currentRound: streakCount,
    points: totalPoints,
  });

  missedDayState = progression.missedDayState;
  streakCount = progression.currentRound;
  totalPoints = progression.points;
  if (progression.progressReset) {
    saveStreak();
    savePoints();
  }
  if (progression.shouldSaveState) saveMissedDayState();
  return missedDayState;
}

function animateStat(label) {
  const display = label.closest(".stat-display");
  display.classList.remove("is-earned");
  void display.offsetWidth;
  display.classList.add("is-earned");
  window.setTimeout(() => display.classList.remove("is-earned"), 850);
}

function updateStreakDisplay() {
  streakLabel.textContent = String(streakCount);
  streakLabel.closest(".stat-display").setAttribute(
    "aria-label",
    `Current round: ${streakCount}`,
  );
}

function updateTotalRoundsDisplay() {
  totalRoundsLabel.textContent = String(totalRounds);
  totalRoundsLabel.closest(".stat-display").setAttribute(
    "aria-label",
    `Total rounds completed: ${totalRounds}`,
  );
}

function updatePointsDisplay() {
  pointsLabel.textContent = String(totalPoints);
  pointsLabel.closest(".stat-display").setAttribute(
    "aria-label",
    `Points: ${totalPoints}`,
  );
}

function awardPoints(points, shouldAnimate = true) {
  if (!Number.isInteger(points) || points <= 0) return;

  totalPoints = calculateNextPoints(totalPoints, points, true);
  savePoints();
  updatePointsDisplay();
  if (shouldAnimate) animateStat(pointsLabel);
}

function resetPoints() {
  totalPoints = calculateNextPoints(totalPoints, 0, false);
  savePoints();
  updatePointsDisplay();
}

function recordMapResult(isCorrect) {
  if (state.streakRecorded) return;

  streakCount = calculateNextStreak(streakCount, isCorrect);
  saveStreak();
  updateStreakDisplay();
  if (isCorrect) {
    animateStat(streakLabel);
    if (!state.totalRoundsRecorded) {
      totalRounds += 1;
      saveTotalRounds();
      updateTotalRoundsDisplay();
      animateStat(totalRoundsLabel);
    }
  } else {
    resetPoints();
  }
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

        totalPoints = Math.max(0, totalPoints + adjustment);
        savePoints();
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
}

function migrateCompletedScore() {
  if (state.phase !== "result") return;

  if (state.isCorrect && !state.totalRoundsRecorded) {
    totalRounds += 1;
    saveTotalRounds();
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
  card.querySelector(".clue-text").textContent = step.clue;
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
    selectableMaps,
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
    const isCorrect = isAcceptedMapSelection(
      state.selectedMapId,
      puzzle.map.id,
      catalog.answerEquivalents,
    );
    const mapPoints = isCorrect ? calculateMapPoints(state.cluesRevealed) : 0;
    const reviveCostOffered = isCorrect ? 0 : calculateReviveCost(reviveCount);
    const roundsSurvivedBeforeLoss = isCorrect ? 0 : streakCount;
    const pointsBeforeLoss = isCorrect ? 0 : totalPoints;
    recordMapResult(isCorrect);
    if (!state.pointsRecorded) awardPoints(mapPoints);
    if (isCorrect) recordDailyParticipation();
    recordCommunityAttempt(isCorrect);
    setState({
      phase: "result",
      isCorrect,
      lockedClues: state.cluesRevealed,
      cluesRevealed: isCorrect ? 3 : state.cluesRevealed,
      streakRecorded: true,
      totalRoundsRecorded: isCorrect || state.totalRoundsRecorded,
      roundsSurvivedBeforeLoss,
      pointsBeforeLoss,
      reviveCostOffered,
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
      <p class="next-round-motivation">Come back tomorrow to maintain your Current Round and Points.</p>
    </section>
  `;
}

function renderMissedDay() {
  const survivedRoundLabel = missedDayState.roundsBeforeLoss === 1 ? "Round" : "Rounds";
  const preLossPointLabel = missedDayState.pointsBeforeLoss === 1 ? "Point" : "Points";
  const missedMapCopy = missedDayState.missedDays === 1
    ? "You missed yesterday’s map, so your Current Round and Points have been reset."
    : `You missed ${missedDayState.missedDays} daily maps, so your Current Round and Points have been reset.`;
  const reviveCost = calculateReviveCost(reviveCount);
  const reviveCostPaid = missedDayState.reviveCostPaid || legacyReviveCost;
  const canRevive = missedDayState.pointsBeforeLoss >= reviveCost;

  if (missedDayState.revived) {
    app.innerHTML = `
      <section class="panel missed-day-panel">
        <div class="result-banner revived animate">
          <h2>Revived!</h2>
          <p>You spent ${reviveCostPaid} points and saved your run.</p>
          <p class="survival-summary">Current Round restored to <strong>${missedDayState.roundsBeforeLoss}</strong> with <strong>${totalPoints}</strong> ${totalPoints === 1 ? "Point" : "Points"}</p>
        </div>
        <div class="actions">
          <button id="continue-after-missed-day" class="button primary" type="button">Play today’s map</button>
        </div>
      </section>
    `;
  } else {
    app.innerHTML = `
      <section class="panel missed-day-panel">
        <div class="result-banner failed animate">
          <h2>Your run has ended</h2>
          <p>${escapeHtml(missedMapCopy)}</p>
          <p class="survival-summary">You had survived <strong>${missedDayState.roundsBeforeLoss}</strong> ${survivedRoundLabel} with <strong>${missedDayState.pointsBeforeLoss}</strong> ${preLossPointLabel}</p>
        </div>
        <section class="revive-offer" aria-labelledby="missed-day-revive-title">
          <div>
            <h3 id="missed-day-revive-title">Save your run?</h3>
            <p>${
              canRevive
                ? `Spend ${reviveCost} points to restore Current Round ${missedDayState.roundsBeforeLoss} and keep your remaining points.`
                : `You need at least ${reviveCost} points to restore Current Round ${missedDayState.roundsBeforeLoss}.`
            }</p>
          </div>
          <button id="revive-missed-day" class="button revive-button" type="button" ${canRevive ? "" : "disabled"}>
            ${canRevive ? `Revive · ${reviveCost} Points` : "Revive unavailable"}
          </button>
        </section>
        <div class="actions">
          <button id="continue-after-missed-day" class="button" type="button">Continue without revive</button>
        </div>
      </section>
    `;
  }

  focusAfterRender(`missed-day:${missedDayState.revived ? "revived" : "lost"}`);
  app.querySelector("#revive-missed-day")?.addEventListener("click", () => {
    if (!canRevive) return;

    const revival = purchaseMissedDayRevive(missedDayState, reviveCost);
    if (!revival) return;

    totalPoints = revival.points;
    streakCount = revival.currentRound;
    missedDayState = revival.missedDayState;
    recordRevivePurchase();
    savePoints();
    saveStreak();
    recordDailyParticipation(getPreviousDateKey(puzzle.dateKey));
    saveMissedDayState();
    updatePointsDisplay();
    updateStreakDisplay();
    animateStat(pointsLabel);
    animateStat(streakLabel);
    renderMissedDay();
  });

  app.querySelector("#continue-after-missed-day").addEventListener("click", () => {
    if (!missedDayState.revived) resetReviveCycle();
    missedDayState = { ...missedDayState, resolved: true };
    saveMissedDayState();
    lastResultClass = null;
    render();
  });
}

function buildScoreSharePayload() {
  const shareRound = !state.isCorrect && !state.revived
    ? state.roundsSurvivedBeforeLoss
    : streakCount;
  const sharePoints = !state.isCorrect && !state.revived
    ? state.pointsBeforeLoss
    : totalPoints;
  const shareUrl = document.querySelector('link[rel="canonical"]')?.href || window.location.href;

  const scoreText = [
    `The Daily Undead · ${formatDate(puzzle.dateKey)}`,
    `Round: ${shareRound}`,
    `Points: ${sharePoints}`,
    `Total Rounds: ${totalRounds}`,
    "",
    "Will you survive?",
  ].join("\n");

  return {
    title: "The Daily Undead",
    scoreText,
    text: `${scoreText}\n${shareUrl}`,
    url: shareUrl,
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
    const hasTouchInput = navigator.maxTouchPoints > 0;
    const nativePayload = hasTouchInput
      ? { title: payload.title, text: payload.scoreText, url: payload.url }
      : { title: payload.title, text: payload.text };

    try {
      await navigator.share(nativePayload);
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
  const revivedResult = !state.isCorrect && state.revived;
  const reviveCost = state.reviveCostOffered || calculateReviveCost(reviveCount);
  const reviveCostPaid = state.reviveCostPaid || legacyReviveCost;
  const clueLabel = state.lockedClues === 1 ? "clue" : "clues";
  const resultTitle = revivedResult
    ? "Revived!"
    : failedBonus
      ? "Not quite"
      : perfectResult
        ? "Double Points!"
        : state.isCorrect
          ? "Round Survived!"
          : "Game Over";
  const resultCopy = revivedResult
    ? `You spent ${reviveCostPaid} points and kept your run alive. Today’s answer was ${answerTitle}.`
    : failedBonus
      ? `You identified ${answerTitle}, but the step order was incorrect. You still earned ${state.mapPoints} points this round.`
      : perfectResult
        ? `You found ${answerTitle} using ${state.lockedClues} ${clueLabel} and got the steps in the correct order. You earned ${state.mapPoints + state.bonusPoints} points this round.`
        : state.isCorrect
          ? `You identified ${answerTitle} in ${state.lockedClues} ${clueLabel}. You earned ${state.mapPoints} points this round.`
          : `You chose ${selectedMap?.title ?? "an unknown map"}. Today’s answer was ${answerTitle}.`;
  const resultClass = revivedResult
    ? "revived"
    : failedBonus
      ? "partial"
      : perfectResult
        ? "perfect"
        : state.isCorrect
          ? "correct"
          : "failed";
  const animateResult = resultClass !== lastResultClass;
  lastResultClass = resultClass;
  const isFinished = !state.isCorrect || state.bonusComplete || state.bonusFailed;
  const survivedRoundLabel = state.roundsSurvivedBeforeLoss === 1 ? "Round" : "Rounds";
  const preLossPointLabel = state.pointsBeforeLoss === 1 ? "Point" : "Points";
  const showReviveOffer = !state.isCorrect && !state.revived;
  const canRevive =
    showReviveOffer &&
    Number.isInteger(state.pointsBeforeLoss) &&
    state.pointsBeforeLoss >= reviveCost;

  app.innerHTML = `
    <section class="panel">
      <div class="result-banner ${resultClass}${animateResult ? " animate" : ""}">
        <h2>${resultTitle}</h2>
        <p>${escapeHtml(resultCopy)}</p>
        ${
          !state.isCorrect
            ? state.revived
              ? `<p class="survival-summary">Current Round restored to <strong>${state.roundsSurvivedBeforeLoss}</strong></p>`
              : `<p class="survival-summary">You survived <strong>${state.roundsSurvivedBeforeLoss}</strong> ${survivedRoundLabel} with <strong>${state.pointsBeforeLoss}</strong> ${preLossPointLabel}</p>`
            : ""
        }
      </div>
      ${
        showReviveOffer
          ? `<section class="revive-offer" aria-labelledby="revive-title">
              <div>
                <h3 id="revive-title">Need a revive?</h3>
                <p>${
                  canRevive
                    ? `Spend ${reviveCost} points to restore Current Round ${state.roundsSurvivedBeforeLoss}.`
                    : `You need at least ${reviveCost} points to restore Current Round ${state.roundsSurvivedBeforeLoss}.`
                }</p>
              </div>
              <button id="revive-player" class="button revive-button" type="button" ${canRevive ? "" : "disabled"}>
                ${canRevive ? `Revive · ${reviveCost} Points` : "Revive unavailable"}
              </button>
            </section>`
          : ""
      }
      ${state.isCorrect ? renderBonus() : '<h3>Today’s three clues</h3><div id="clue-list" class="clue-list"></div>'}
      ${
        isFinished
          ? `<div class="actions share-score-actions">
              <button id="share-score" class="button share-score-button" type="button">Share score</button>
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
  app.querySelector("#revive-player")?.addEventListener("click", () => {
    if (!canRevive || state.revived) return;

    totalPoints = state.pointsBeforeLoss - reviveCost;
    streakCount = state.roundsSurvivedBeforeLoss;
    recordRevivePurchase();
    savePoints();
    saveStreak();
    recordDailyParticipation();
    updatePointsDisplay();
    updateStreakDisplay();
    animateStat(pointsLabel);
    animateStat(streakLabel);
    setState({ revived: true, reviveCostPaid: reviveCost });
  });
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
    await synchroniseClock();
    await loadData();
    const dateKey = getDateKey();
    liveDateKey = getUtcDateKey(getCurrentTime());
    streakCount = loadStreak();
    totalRounds = loadTotalRounds();
    totalPoints = loadPoints();
    reviveCount = loadReviveCount();
    lastPlayedDate = loadLastPlayedDate();
    puzzle = buildDailyPuzzle(dateKey, maps);
    state = loadState();
    prepareCommunityStatsDisplay();
    migrateCompletedScore();
    if (state.phase === "result" && typeof state.isCorrect === "boolean") {
      recordCommunityAttempt(state.isCorrect);
    }
    if (state.phase === "result" && (state.isCorrect || state.revived)) {
      recordDailyParticipation(dateKey);
    } else if (!lastPlayedDate && (streakCount > 0 || totalPoints > 0)) {
      // Preserve existing players' progress when missed-day tracking is first introduced.
      recordDailyParticipation(dateKey);
    }
    missedDayState = prepareMissedDayState(dateKey);
    if (shouldResetReviveCycle({
      missedDayState,
      phase: state.phase,
      currentRound: streakCount,
      points: totalPoints,
    })) {
      resetReviveCycle();
    }
    dateLabel.textContent = `${formatDate(dateKey)}${new URLSearchParams(window.location.search).has("date") ? " · Preview" : ""}`;
    updateStreakDisplay();
    updateTotalRoundsDisplay();
    updatePointsDisplay();
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
        <h2>The puzzle could not load</h2>
        <p>${escapeHtml(error.message)}</p>
        <p>If you opened <code>index.html</code> directly, start a local web server and open the supplied local URL instead.</p>
      </section>
    `;
    focusAfterRender("error");
  }
}

initialise();
