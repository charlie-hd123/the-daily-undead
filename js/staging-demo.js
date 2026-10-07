import {
  buildDailyPuzzle,
  calculateBonusPoints,
  calculateMapPoints,
  getAnswerDisplayTitle,
  getMillisecondsUntilNextUtcDay,
  getUtcDateKey,
  isAcceptedMapSelection,
  isCorrectOrder,
  isMapAvailableOnDate,
  isValidDateKey,
  orderMapsForGame,
  toggleOrderedSelection,
} from "./game-core.js";
import {
  buildDailyWordPuzzle,
  calculateWordPoints,
  getFollowingDateKey,
  isWordSolved,
  normalizeLetter,
} from "./word-puzzle-core.js";

const app = document.querySelector("#demo-app");
const dateLabel = document.querySelector("#demo-date");
const countdownLabel = document.querySelector("#demo-countdown");
const scoreLabel = document.querySelector("#demo-score");
const solvesLabel = document.querySelector("#demo-solves");
const roundLabel = document.querySelector("#demo-round");
const advanceButton = document.querySelector("#advance-demo-day");
const rulesDialog = document.querySelector("#rules-dialog");

const profileStorageKey = "daily-undead:multi-puzzle-demo:profile";
const dayStoragePrefix = "daily-undead:multi-puzzle-demo:day:";
const puzzleTypes = {
  easter: {
    name: "Easter Egg Hunt",
    shortName: "Easter Egg",
    kicker: "Main quest challenge",
    description: "Identify today’s Zombies map from its Easter egg steps, then order the steps for Double Points.",
  },
  word: {
    name: "Zombies Word Puzzle",
    shortName: "Word Puzzle",
    kicker: "Letter challenge",
    description: "Reveal today’s Zombies word or phrase. Every incorrect letter removes 20 potential points.",
  },
};

let catalog;
let maps;
let selectableMaps;
let wordEntries;
let easterPuzzle;
let wordPuzzle;
let dateKey;
let dayState;
let profile;
let activePlay = null;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function getRequestedDateKey() {
  const requested = new URLSearchParams(window.location.search).get("date");
  return isValidDateKey(requested) ? requested : getUtcDateKey();
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${value}T12:00:00Z`));
}

function loadJson(key, fallback) {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    return saved && typeof saved === "object" ? saved : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The current page remains playable if browser storage is unavailable.
  }
}

function loadProfile() {
  const saved = loadJson(profileStorageKey, {});
  return {
    score: Number.isInteger(saved.score) && saved.score >= 0 ? saved.score : 0,
    solves: Number.isInteger(saved.solves) && saved.solves >= 0 ? saved.solves : 0,
    round: Number.isInteger(saved.round) && saved.round >= 1 ? saved.round : 1,
    bestRound: Number.isInteger(saved.bestRound) && saved.bestRound >= 1 ? saved.bestRound : 1,
  };
}

function createDayState() {
  return {
    version: 1,
    dateKey,
    officialType: null,
    officialCompleted: false,
    officialResult: null,
    progressionApplied: false,
    lastCompleted: null,
    sessions: { easter: null, word: null },
  };
}

function loadDayState() {
  const saved = loadJson(`${dayStoragePrefix}${dateKey}`, null);
  if (saved?.version !== 1 || saved?.dateKey !== dateKey) return createDayState();
  return {
    ...createDayState(),
    ...saved,
    sessions: { easter: null, word: null, ...(saved.sessions || {}) },
  };
}

function persist() {
  saveJson(profileStorageKey, profile);
  saveJson(`${dayStoragePrefix}${dateKey}`, dayState);
  updateStats();
}

function updateStats() {
  scoreLabel.textContent = profile.score.toLocaleString("en-GB");
  solvesLabel.textContent = profile.solves.toLocaleString("en-GB");
  roundLabel.textContent = profile.round.toLocaleString("en-GB");
}

function updateCountdown() {
  const remaining = getMillisecondsUntilNextUtcDay();
  const seconds = Math.max(0, Math.ceil(remaining / 1000));
  const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const finalSeconds = String(seconds % 60).padStart(2, "0");
  countdownLabel.textContent = `${hours}:${minutes}:${finalSeconds}`;
}

function renderHeading(title, description, kicker = "Today’s puzzle") {
  return `
    <div class="screen-heading">
      <p class="kicker">${escapeHtml(kicker)}</p>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(description)}</p>
    </div>
  `;
}

function createWordSession() {
  return {
    key: wordPuzzle.key,
    guesses: [],
    wrongGuesses: 0,
    complete: false,
    success: null,
    points: 0,
    summary: null,
  };
}

function createEasterSession() {
  return {
    key: easterPuzzle.key,
    phase: "clues",
    cluesRevealed: 1,
    selectedGameId: null,
    selectedMapId: null,
    mapPoints: 0,
    bonusOrder: [],
    complete: false,
    success: null,
    points: 0,
    summary: null,
  };
}

function ensureSession(type) {
  const expectedKey = type === "word" ? wordPuzzle.key : easterPuzzle.key;
  const existing = dayState.sessions[type];
  if (existing?.key === expectedKey) return existing;
  const session = type === "word" ? createWordSession() : createEasterSession();
  dayState.sessions[type] = session;
  persist();
  return session;
}

function openRules(type) {
  const isWord = type === "word";
  rulesDialog.querySelector("[data-rules-title]").textContent = puzzleTypes[type].name;
  rulesDialog.querySelector("[data-rules-copy]").innerHTML = isWord
    ? `
      <ul class="demo-rules-list">
        <li>One letter is revealed at the start, but never the first letter.</li>
        <li>Correct letters reveal every matching position and cost no points.</li>
        <li>Each incorrect letter removes 20 from the potential score.</li>
        <li>Reveal the full answer before five mistakes to survive the Round.</li>
      </ul>
    `
    : `
      <ul class="demo-rules-list">
        <li>Identify the map from one, two or three main-quest clues.</li>
        <li>Fewer clues award more points.</li>
        <li>A correct map unlocks one attempt to order three quest steps.</li>
        <li>A correct order doubles the map points.</li>
      </ul>
    `;
  rulesDialog.showModal();
}

function lockOfficialChoice(type) {
  if (!type || dayState.officialType) return;
  dayState.officialType = type;
  ensureSession(type);
  persist();
  startPuzzle(type, "official");
}

function startPuzzle(type, mode) {
  activePlay = { type, mode };
  ensureSession(type);
  if (type === "word") renderWordPuzzle();
  else renderEasterPuzzle();
}

function getCardAction(type) {
  const session = dayState.sessions[type];
  if (!dayState.officialType) {
    return { label: "Choose as official", disabled: false, action: "choose" };
  }
  if (dayState.officialType === type) {
    if (!dayState.officialCompleted) {
      return { label: session ? "Continue official puzzle" : "Play official puzzle", disabled: false, action: "official" };
    }
    return { label: "Official puzzle complete", disabled: true, action: null };
  }
  if (!dayState.officialCompleted) {
    return { label: "Finish official puzzle first", disabled: true, action: null };
  }
  if (session?.complete) {
    return { label: "Just-for-fun puzzle complete", disabled: true, action: null };
  }
  return { label: session ? "Continue just for fun" : "Play just for fun", disabled: false, action: "for_fun" };
}

function getCardStatus(type) {
  const session = dayState.sessions[type];
  if (!dayState.officialType) return "Available as today’s official puzzle";
  if (dayState.officialType === type) {
    if (!dayState.officialCompleted) return "Your official choice · In progress";
    const result = dayState.officialResult;
    return result?.success
      ? `Official complete · ${result.points} points`
      : "Official complete · Run ended";
  }
  if (!dayState.officialCompleted) return "Locked until the official result is complete";
  if (session?.complete) return "Completed just for fun";
  return "Available just for fun · No effect on stats";
}

function renderPuzzleCard(type) {
  const puzzle = puzzleTypes[type];
  const action = getCardAction(type);
  const official = dayState.officialType === type;
  const number = type === "easter" ? "01" : "02";
  return `
    <article class="puzzle-choice-card${official ? " is-official" : ""}" data-puzzle-card="${type}">
      <div class="puzzle-choice-copy">
        <div class="puzzle-choice-kicker-row">
          <p class="kicker">${escapeHtml(puzzle.kicker)}</p>
          <span class="puzzle-choice-number" aria-hidden="true">${number}</span>
        </div>
        <h3>${escapeHtml(puzzle.name)}</h3>
        <p>${escapeHtml(puzzle.description)}</p>
        <div class="puzzle-choice-meta">
          <p class="puzzle-choice-status">${escapeHtml(getCardStatus(type))}</p>
          <button class="puzzle-rules-link" type="button" data-rules="${type}">How to play</button>
        </div>
      </div>
      <div class="puzzle-choice-actions">
        <button
          class="button primary"
          type="button"
          data-card-action="${action.action || ""}"
          data-puzzle-type="${type}"
          ${action.disabled ? "disabled" : ""}
        >${escapeHtml(action.label)}</button>
      </div>
    </article>
  `;
}

function renderHubStats() {
  return `
    <div class="hub-stats" aria-label="Your current prototype statistics">
      <div><span>Score</span><strong>${profile.score.toLocaleString("en-GB")}</strong></div>
      <div><span>Solves</span><strong>${profile.solves.toLocaleString("en-GB")}</strong></div>
      <div><span>Round</span><strong>${profile.round.toLocaleString("en-GB")}</strong></div>
    </div>
  `;
}

function renderHub() {
  activePlay = null;
  const guidance = !dayState.officialType
    ? "Pick the one puzzle that will count towards today’s Score, Solves and Round. Your choice locks when you tap."
    : dayState.officialCompleted
      ? "Your official result is complete. The other puzzle is available if you would like to play again for fun."
      : `Finish ${puzzleTypes[dayState.officialType].name} to unlock the other puzzle just for fun.`;
  app.innerHTML = `
    <section class="panel puzzle-hub-panel">
      <div class="puzzle-hub-hero">
        ${renderHeading(dayState.officialType ? "Today’s puzzles" : "Choose your official puzzle", guidance, "Daily challenge")}
        ${renderHubStats()}
      </div>
      <div class="puzzle-choice-grid">
        ${renderPuzzleCard("easter")}
        ${renderPuzzleCard("word")}
      </div>
    </section>
  `;

  app.querySelectorAll("[data-rules]").forEach((button) => {
    button.addEventListener("click", () => openRules(button.dataset.rules));
  });
  app.querySelectorAll("[data-card-action]").forEach((button) => {
    if (button.disabled) return;
    button.addEventListener("click", () => {
      const type = button.dataset.puzzleType;
      const action = button.dataset.cardAction;
      if (action === "choose") lockOfficialChoice(type);
      else startPuzzle(type, action);
    });
  });
}

function applyOfficialProgression(type, success, points) {
  if (dayState.progressionApplied) return;
  if (success) {
    profile.score += points;
    profile.solves += 1;
    profile.round += 1;
    profile.bestRound = Math.max(profile.bestRound, profile.round);
  } else {
    profile.round = 1;
  }
  dayState.progressionApplied = true;
  dayState.officialCompleted = true;
  dayState.officialResult = { type, success, points };
}

function finishPuzzle(type, { success, points, summary }) {
  const session = ensureSession(type);
  session.complete = true;
  session.success = success;
  session.points = points;
  session.summary = summary;
  if (activePlay?.mode === "official") {
    applyOfficialProgression(type, success, points);
  }
  dayState.lastCompleted = {
    type,
    mode: activePlay?.mode || "for_fun",
    success,
    points,
    summary,
  };
  persist();
  renderCompletion(type, session, activePlay?.mode || "for_fun");
}

function renderCompletion(type, session, mode) {
  const official = mode === "official";
  const resultTitle = session.success ? "Round Survived!" : "Run ended";
  const resultCopy = official
    ? session.success
      ? `You earned ${session.points} points. Your Score, Solves and Round have advanced.`
      : "Your Round has reset to 1. Your permanent Score and Solves remain safe."
    : "This result was just for fun, so your Score, Solves and Round have not changed.";
  const homeLabel = official ? "Play another puzzle for fun" : "Return to puzzle home";
  app.innerHTML = `
    <section class="panel demo-completion-panel">
      <div class="result-banner ${session.success ? "correct" : "failed"}">
        <p class="kicker">${official ? "Official result" : "Just for fun"} · ${escapeHtml(puzzleTypes[type].name)}</p>
        <h2>${resultTitle}</h2>
        <p>${escapeHtml(resultCopy)}</p>
      </div>
      <div class="demo-answer-reveal">
        <span>${escapeHtml(session.summary?.label || "Today’s answer")}</span>
        <strong>${escapeHtml(session.summary?.answer || "")}</strong>
        ${session.summary?.detail ? `<p>${escapeHtml(session.summary.detail)}</p>` : ""}
      </div>
      ${renderHubStats()}
      <div class="completion-next-step">
        <p>${official ? "Finished for today? You can close the game here." : "That’s both of today’s puzzles complete."}</p>
        <button id="return-to-puzzle-home" class="button" type="button">${homeLabel}</button>
      </div>
    </section>
  `;
  app.querySelector("#return-to-puzzle-home").addEventListener("click", renderHub);
}

function renderWordSlots(answer, revealedLetters) {
  const revealed = new Set(revealedLetters);
  return answer.split(" ").map((word) => `
    <span class="word-token">
      ${[...word].map((character) => {
        const letter = normalizeLetter(character);
        if (!letter) return `<span class="word-literal">${escapeHtml(character)}</span>`;
        const visible = revealed.has(letter);
        return `<span class="word-letter${visible ? " is-visible" : ""}" aria-label="${visible ? letter : "Hidden letter"}">${visible ? letter : ""}</span>`;
      }).join("")}
    </span>
  `).join('<span class="word-space" aria-hidden="true"></span>');
}

function renderWordPuzzle() {
  const session = ensureSession("word");
  if (session.complete) {
    renderCompletion("word", session, activePlay?.mode || "for_fun");
    return;
  }
  const answerLetters = wordPuzzle.entry.answer.toUpperCase();
  const guesses = new Set(session.guesses);
  const revealed = new Set([wordPuzzle.initialLetter]);
  session.guesses.forEach((letter) => {
    if (answerLetters.includes(letter)) revealed.add(letter);
  });
  const potentialPoints = calculateWordPoints(session.wrongGuesses);
  const keyboardRows = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
  app.innerHTML = `
    <section class="panel word-puzzle-panel">
      ${renderHeading(
        "Reveal the Zombies answer",
        activePlay?.mode === "official"
          ? "This is your official puzzle. Five incorrect letters end today’s Round."
          : "Playing just for fun. This result will not change your stats.",
        activePlay?.mode === "official" ? "Official puzzle" : "Just for fun",
      )}
      <div class="word-scoreboard" aria-label="Word puzzle score">
        <div><span>Potential score</span><strong>${potentialPoints}</strong></div>
        <div><span>Mistakes</span><strong>${session.wrongGuesses} / 5</strong></div>
      </div>
      <div class="word-answer" aria-label="Partially revealed answer">
        ${renderWordSlots(wordPuzzle.entry.answer, revealed)}
      </div>
      <div class="word-keyboard" aria-label="Letter keyboard">
        ${keyboardRows.map((row) => `
          <div class="word-keyboard-row">
            ${[...row].map((letter) => {
              const used = guesses.has(letter) || letter === wordPuzzle.initialLetter;
              const correct = answerLetters.includes(letter);
              const stateClass = letter === wordPuzzle.initialLetter
                ? " is-revealed"
                : used && correct
                  ? " is-correct"
                  : used
                    ? " is-incorrect"
                    : "";
              const stateLabel = letter === wordPuzzle.initialLetter
                ? "Starting letter"
                : !used
                  ? "Unused"
                  : correct
                    ? "Correct"
                    : "Incorrect";
              return `<button class="word-key${stateClass}" type="button" data-letter="${letter}" aria-label="${letter}: ${stateLabel}" ${used ? "disabled" : ""}>${letter}</button>`;
            }).join("")}
          </div>
        `).join("")}
      </div>
      <p id="word-game-status" class="word-game-status" aria-live="polite">Choose a letter.</p>
    </section>
  `;
  app.querySelectorAll("[data-letter]").forEach((button) => {
    button.addEventListener("click", () => submitLetter(button.dataset.letter));
  });
}

function submitLetter(value) {
  if (activePlay?.type !== "word") return;
  const letter = normalizeLetter(value);
  const session = ensureSession("word");
  if (!letter || session.complete || session.guesses.includes(letter) || letter === wordPuzzle.initialLetter) return;
  session.guesses.push(letter);
  const correct = wordPuzzle.entry.answer.toUpperCase().includes(letter);
  if (!correct) session.wrongGuesses += 1;
  const revealed = [wordPuzzle.initialLetter, ...session.guesses];
  const solved = isWordSolved(wordPuzzle.entry.answer, revealed);
  persist();
  if (solved) {
    finishPuzzle("word", {
      success: true,
      points: calculateWordPoints(session.wrongGuesses),
      summary: {
        label: wordPuzzle.entry.category,
        answer: wordPuzzle.entry.answer,
        detail: `${session.wrongGuesses} ${session.wrongGuesses === 1 ? "mistake" : "mistakes"}`,
      },
    });
    return;
  }
  if (session.wrongGuesses >= 5) {
    finishPuzzle("word", {
      success: false,
      points: 0,
      summary: {
        label: wordPuzzle.entry.category,
        answer: wordPuzzle.entry.answer,
        detail: "Five incorrect letters",
      },
    });
    return;
  }
  renderWordPuzzle();
  const status = app.querySelector("#word-game-status");
  if (status) status.textContent = correct ? `${letter} is in the answer.` : `${letter} is not in the answer. 20 points lost.`;
}

function renderClueCards(session) {
  return easterPuzzle.displayedSteps.map((step, index) => index < session.cluesRevealed
    ? `<article class="clue-card"><p class="clue-number">Clue ${index + 1}</p><p class="clue-text">${escapeHtml(step.hardClue)}</p></article>`
    : `<article class="clue-card is-hidden">Clue ${index + 1} hidden</article>`).join("");
}

function renderEasterPuzzle() {
  const session = ensureSession("easter");
  if (session.complete) {
    renderCompletion("easter", session, activePlay?.mode || "for_fun");
    return;
  }
  if (session.phase === "game") renderEasterGameSelection(session);
  else if (session.phase === "map") renderEasterMapSelection(session);
  else if (session.phase === "bonus") renderEasterBonus(session);
  else renderEasterClues(session);
}

function renderEasterClues(session) {
  app.innerHTML = `
    <section class="panel">
      ${renderHeading(
        "Which Zombies map is it?",
        activePlay?.mode === "official" ? "This is your official puzzle." : "Playing just for fun. This result will not change your stats.",
        activePlay?.mode === "official" ? "Official puzzle" : "Just for fun",
      )}
      <div class="clue-list">${renderClueCards(session)}</div>
      <div class="actions">
        <button id="demo-reveal-clue" class="button" type="button" ${session.cluesRevealed >= 3 ? "disabled" : ""}>${session.cluesRevealed >= 3 ? "All clues revealed" : "Reveal next clue"}</button>
        <button id="demo-select-map" class="button primary" type="button">Select map · ${session.cluesRevealed} ${session.cluesRevealed === 1 ? "clue" : "clues"}</button>
      </div>
    </section>
  `;
  app.querySelector("#demo-reveal-clue")?.addEventListener("click", () => {
    session.cluesRevealed = Math.min(3, session.cluesRevealed + 1);
    persist();
    renderEasterClues(session);
  });
  app.querySelector("#demo-select-map").addEventListener("click", () => {
    session.phase = "game";
    persist();
    renderEasterPuzzle();
  });
}

function renderEasterGameSelection(session) {
  const games = catalog.games.slice().sort((left, right) => left.releaseOrder - right.releaseOrder);
  app.innerHTML = `
    <section class="panel">
      ${renderHeading("Choose the game", `You revealed ${session.cluesRevealed} ${session.cluesRevealed === 1 ? "clue" : "clues"}.`, "Lock in your answer")}
      <ul class="card-grid">
        ${games.map((game) => `<li><button class="card-button" type="button" data-game-id="${escapeHtml(game.id)}"><span class="game-label">Call of Duty</span><span class="card-title">${escapeHtml(game.title)}</span></button></li>`).join("")}
      </ul>
      <div class="actions"><button id="back-to-demo-clues" class="button" type="button">Back to clues</button></div>
    </section>
  `;
  app.querySelector("#back-to-demo-clues").addEventListener("click", () => {
    session.phase = "clues";
    persist();
    renderEasterPuzzle();
  });
  app.querySelectorAll("[data-game-id]").forEach((button) => button.addEventListener("click", () => {
    session.phase = "map";
    session.selectedGameId = button.dataset.gameId;
    session.selectedMapId = null;
    persist();
    renderEasterPuzzle();
  }));
}

function renderEasterMapSelection(session) {
  const game = catalog.games.find((item) => item.id === session.selectedGameId);
  const gameMaps = orderMapsForGame(
    selectableMaps.filter((map) => isMapAvailableOnDate(map, dateKey)),
    session.selectedGameId,
    catalog.mapOrder?.[session.selectedGameId],
  );
  app.innerHTML = `
    <section class="panel">
      ${renderHeading(`Choose a ${game.title} map`, "Tap a map, then confirm your final answer.", "Lock in your answer")}
      <ul class="card-grid">
        ${gameMaps.map((map) => `
          <li><button class="card-button" type="button" data-map-id="${escapeHtml(map.id)}" aria-pressed="${session.selectedMapId === map.id}"><span class="game-label">${escapeHtml(map.questTitle || map.gameTitle)}</span><span class="card-title">${escapeHtml(map.title)}</span></button></li>
        `).join("")}
      </ul>
      <div class="actions">
        <button id="back-to-demo-games" class="button" type="button">Back to games</button>
        <button id="confirm-demo-map" class="button primary" type="button" ${session.selectedMapId ? "" : "disabled"}>Confirm map</button>
      </div>
    </section>
  `;
  app.querySelectorAll("[data-map-id]").forEach((button) => button.addEventListener("click", () => {
    session.selectedMapId = button.dataset.mapId;
    persist();
    renderEasterMapSelection(session);
  }));
  app.querySelector("#back-to-demo-games").addEventListener("click", () => {
    session.phase = "game";
    session.selectedMapId = null;
    persist();
    renderEasterPuzzle();
  });
  app.querySelector("#confirm-demo-map").addEventListener("click", () => submitEasterMap(session));
}

function submitEasterMap(session) {
  const correct = isAcceptedMapSelection(session.selectedMapId, easterPuzzle.map.id, catalog.answerEquivalents);
  if (!correct) {
    finishPuzzle("easter", {
      success: false,
      points: 0,
      summary: { label: "Today’s map", answer: getAnswerDisplayTitle(easterPuzzle.map, catalog.answerEquivalents), detail: "Incorrect map selection" },
    });
    return;
  }
  session.mapPoints = calculateMapPoints(session.cluesRevealed);
  session.phase = "bonus";
  persist();
  renderEasterPuzzle();
}

function renderEasterBonus(session) {
  app.innerHTML = `
    <section class="panel">
      ${renderHeading("Put the steps in order", `You found the map and secured ${session.mapPoints} points. Order the steps to double it.`, "Bonus objective")}
      <p class="selection-progress">Selected: ${session.bonusOrder.length} of 3</p>
      <ul class="order-choice-list">
        ${easterPuzzle.displayedSteps.map((step) => {
          const selectedIndex = session.bonusOrder.indexOf(step.id);
          return `<li><button class="order-choice" type="button" data-step-id="${escapeHtml(step.id)}" aria-pressed="${selectedIndex >= 0}"><span class="order-rank">${selectedIndex >= 0 ? selectedIndex + 1 : "+"}</span><span class="order-text">${escapeHtml(step.clue)}</span></button></li>`;
        }).join("")}
      </ul>
      <div class="actions"><button id="submit-demo-order" class="button primary" type="button" ${session.bonusOrder.length === 3 ? "" : "disabled"}>Submit order · One attempt only</button></div>
    </section>
  `;
  app.querySelectorAll("[data-step-id]").forEach((button) => button.addEventListener("click", () => {
    session.bonusOrder = toggleOrderedSelection(session.bonusOrder, button.dataset.stepId);
    persist();
    renderEasterBonus(session);
  }));
  app.querySelector("#submit-demo-order").addEventListener("click", () => {
    const bonusCorrect = isCorrectOrder(session.bonusOrder, easterPuzzle.chronologicalSteps);
    const bonusPoints = calculateBonusPoints(session.mapPoints, bonusCorrect);
    finishPuzzle("easter", {
      success: true,
      points: session.mapPoints + bonusPoints,
      summary: {
        label: "Today’s map",
        answer: getAnswerDisplayTitle(easterPuzzle.map, catalog.answerEquivalents),
        detail: bonusCorrect ? "Bonus order correct" : "Map correct · Bonus order missed",
      },
    });
  });
}

async function loadData() {
  const [wordResponse, indexResponse] = await Promise.all([
    fetch("./data/word-puzzle-demo.json", { cache: "no-store" }),
    fetch("./data/maps/index.json", { cache: "no-store" }),
  ]);
  if (!wordResponse.ok || !indexResponse.ok) throw new Error("Could not load the demo catalogues.");
  const wordBank = await wordResponse.json();
  catalog = await indexResponse.json();
  wordEntries = Object.entries(wordBank.categories).flatMap(([category, answers]) =>
    answers.map((answer, index) => ({ id: `${slugify(category)}-${index + 1}`, category, answer })),
  );
  maps = await Promise.all(catalog.maps.map(async (filename) => {
    const response = await fetch(`./data/maps/${filename}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load ${filename}.`);
    return response.json();
  }));
  const gameTitles = new Map(catalog.games.map((game) => [game.id, game.title]));
  const selectionOnly = (catalog.selectionOnlyMaps || []).map((map) => ({
    ...map,
    gameTitle: gameTitles.get(map.gameId),
    selectionOnly: true,
  }));
  selectableMaps = [...maps, ...selectionOnly];
}

function advanceDay() {
  const params = new URLSearchParams(window.location.search);
  params.set("date", getFollowingDateKey(dateKey));
  window.location.search = params.toString();
}

function initialiseDialogs() {
  document.querySelectorAll("[data-close-rules]").forEach((button) => button.addEventListener("click", () => rulesDialog.close()));
}

async function initialise() {
  try {
    dateKey = getRequestedDateKey();
    dateLabel.textContent = `${formatDate(dateKey)}${new URLSearchParams(window.location.search).has("date") ? " · Preview" : ""}`;
    profile = loadProfile();
    await loadData();
    easterPuzzle = buildDailyPuzzle(dateKey, maps);
    wordPuzzle = buildDailyWordPuzzle(dateKey, wordEntries);
    dayState = loadDayState();
    initialiseDialogs();
    advanceButton.addEventListener("click", advanceDay);
    document.addEventListener("keydown", (event) => {
      if (activePlay?.type !== "word" || rulesDialog.open) return;
      const letter = normalizeLetter(event.key);
      if (letter) submitLetter(letter);
    });
    updateStats();
    updateCountdown();
    window.setInterval(updateCountdown, 1000);
    renderHub();
  } catch (error) {
    console.error(error);
    app.innerHTML = `<section class="panel error-panel"><h2>The prototype couldn’t load</h2><p>Refresh the staging page and try again.</p></section>`;
  }
}

initialise();
