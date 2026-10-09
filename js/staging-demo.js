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

const profileStorageKey = "daily-undead:multi-puzzle-demo:profile";
const dayStoragePrefix = "daily-undead:multi-puzzle-demo:day:";
const puzzleTypes = {
  easter: {
    name: "Quest Steps",
    shortName: "Quest Steps",
    kicker: "Easter egg puzzle",
    description: "Can you identify the Zombies map from its Easter egg steps?",
    image: "./assets/quest-steps-card.svg",
  },
  word: {
    name: "Last Words",
    shortName: "Last Words",
    kicker: "Letter puzzle",
    description: "Can you identify the Zombies word or phrase by revealing its letters?",
    image: "./assets/dead-letters-card.svg",
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

function punctuateSentenceEnding(value) {
  const text = String(value || "");
  return /[.!?]$/.test(text) ? text : `${text}.`;
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
    version: 3,
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
  if (saved?.version !== 3 || saved?.dateKey !== dateKey) return createDayState();
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
  const formatted = `${hours}:${minutes}:${finalSeconds}`;
  countdownLabel.textContent = formatted;
  const endScreenCountdown = document.querySelector("#end-screen-countdown");
  if (endScreenCountdown) {
    endScreenCountdown.textContent = formatted;
    endScreenCountdown.setAttribute("aria-label", `${seconds} seconds until the next round`);
  }
}

function renderHeading(title, description, kicker = "Today’s puzzle", note = "", hint = "") {
  return `
    <div class="screen-heading">
      <p class="kicker">${escapeHtml(kicker)}</p>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(description)}${hint ? ` <span class="heading-hint">${escapeHtml(hint)}</span>` : ""}</p>
      ${note ? `<p class="puzzle-mode-note">${escapeHtml(note)}</p>` : ""}
    </div>
  `;
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

function createEasterSession() {
  return {
    key: easterPuzzle.key,
    phase: "clues",
    cluesRevealed: 1,
    selectedGameId: null,
    selectedMapId: null,
    mapPoints: 0,
    mapProgressionApplied: false,
    bonusOrder: [],
    bonusComplete: false,
    bonusFailed: false,
    pendingBonusResult: null,
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
    return { label: "Play puzzle", disabled: false, action: "choose" };
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
    return { label: "Puzzle complete", disabled: true, action: null };
  }
  return { label: session ? "Continue just for fun" : "Play just for fun", disabled: false, action: "for_fun" };
}

function getCardStatus(type) {
  const session = dayState.sessions[type];
  if (!dayState.officialType) return "";
  if (dayState.officialType === type) {
    if (!dayState.officialCompleted) return "Your official choice · In progress";
    return "Today’s puzzle is complete";
  }
  if (!dayState.officialCompleted) return "Locked until the official result is complete";
  if (session?.complete) return "Completed just for fun";
  return "Play risk-free. No effect on your stats.";
}

function renderPuzzleCard(type) {
  const puzzle = puzzleTypes[type];
  const action = getCardAction(type);
  const official = dayState.officialType === type;
  const status = getCardStatus(type);
  const isCompleted = Boolean(dayState.sessions[type]?.complete);
  const canSeeResult = isCompleted;
  return `
    <article class="puzzle-choice-card${official ? " is-official" : ""}" data-puzzle-card="${type}">
      <img class="puzzle-choice-art" src="${puzzle.image}" alt="" width="512" height="512">
      <div class="puzzle-choice-copy">
        <p class="kicker">${escapeHtml(puzzle.kicker)}</p>
        <h3>${escapeHtml(puzzle.name)}</h3>
        <p>${escapeHtml(puzzle.description)}</p>
      </div>
      ${status ? `
        <div class="puzzle-choice-status-row">
          <div class="puzzle-choice-status-copy">
            <p class="puzzle-choice-status${isCompleted ? " is-complete" : ""}">${escapeHtml(status)}</p>
          </div>
          ${canSeeResult ? `<button class="puzzle-result-link" type="button" data-see-result="${type}" data-result-mode="${official ? "official" : "for_fun"}">See result</button>` : ""}
        </div>
      ` : ""}
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

function areAllPuzzlesCompleted() {
  return Object.keys(puzzleTypes).every((type) => dayState.sessions[type]?.complete);
}

function renderHub() {
  activePlay = null;
  const allPuzzlesCompleted = areAllPuzzlesCompleted();
  const guidance = !dayState.officialType
    ? "Pick one puzzle for today’s scored round. Play the others afterwards for fun, risk-free."
    : allPuzzlesCompleted
      ? "You have completed all of today’s puzzles."
    : dayState.officialCompleted
      ? "Your official round is complete. Other puzzles are available if you would like to play just for fun."
      : `Finish ${puzzleTypes[dayState.officialType].name} to unlock the other puzzle just for fun.`;
  app.innerHTML = `
    <section class="panel puzzle-hub-panel">
      <div class="puzzle-hub-hero">
        ${renderHeading(
          allPuzzlesCompleted
            ? "Today’s puzzles are complete"
            : dayState.officialCompleted
              ? "Play another puzzle"
              : "Choose your daily puzzle",
          guidance,
          allPuzzlesCompleted
            ? "All puzzles"
            : dayState.officialCompleted
              ? "Just for fun"
              : "Today’s round",
        )}
      </div>
      <div class="puzzle-choice-grid">
        ${renderPuzzleCard("word")}
        ${renderPuzzleCard("easter")}
      </div>
    </section>
    ${dayState.officialCompleted ? renderNextRoundScreen() : ""}
  `;

  if (dayState.officialCompleted) updateCountdown();

  app.querySelectorAll("[data-card-action]").forEach((button) => {
    if (button.disabled) return;
    button.addEventListener("click", () => {
      const type = button.dataset.puzzleType;
      const action = button.dataset.cardAction;
      if (action === "choose") lockOfficialChoice(type);
      else startPuzzle(type, action);
    });
  });
  app.querySelectorAll("[data-see-result]").forEach((button) => {
    button.addEventListener("click", () => startPuzzle(button.dataset.seeResult, button.dataset.resultMode));
  });
}

function applyOfficialEasterMapProgression(session) {
  if (
    dayState.officialType !== "easter"
    || dayState.officialCompleted
    || session.mapProgressionApplied
  ) return false;

  profile.score += session.mapPoints;
  profile.solves += 1;
  profile.round += 1;
  profile.bestRound = Math.max(profile.bestRound, profile.round);
  session.mapProgressionApplied = true;
  dayState.progressionApplied = true;
  return true;
}

function applyOfficialProgression(type, success, points) {
  if (dayState.officialCompleted) return;
  const session = ensureSession(type);
  if (type === "easter" && success && session.mapProgressionApplied) {
    profile.score += Math.max(0, points - session.mapPoints);
  } else if (success) {
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
  session.roundsSurvivedBeforeLoss = profile.round;
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
    const eased = 1 - ((1 - progress) ** 3);
    element.textContent = String(Math.round(total * eased));
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function renderCompletion(type, session, mode) {
  const official = mode === "official";
  const allPuzzlesCompleted = areAllPuzzlesCompleted();
  const answer = session.summary?.answer || "";
  const isEaster = type === "easter";
  const failedBonus = isEaster && session.success && session.bonusFailed;
  const perfectResult = isEaster && session.success && session.bonusComplete;
  const selectedMap = isEaster
    ? selectableMaps.find((map) => map.id === session.selectedMapId)
    : null;
  const clueLabel = session.cluesRevealed === 1 ? "clue" : "clues";
  const answerWithPunctuation = punctuateSentenceEnding(answer);
  const answerMarkup = `<strong class="result-answer-name">${escapeHtml(answer)}</strong>`;
  const answerSentenceMarkup = `<strong class="result-answer-name">${escapeHtml(answerWithPunctuation)}</strong>`;
  const selectedAnswerMarkup = escapeHtml(selectedMap?.title ?? "an unknown map");
  const resultTitle = !official
    ? failedBonus || !session.success ? "Not quite" : "Puzzle Complete!"
    : failedBonus
      ? "Not quite"
      : perfectResult
        ? "Double Points!"
        : session.success
          ? "Round Survived!"
          : "Run ended";
  const officialResultCopy = isEaster
    ? failedBonus
      ? `You identified ${answerMarkup}, but the step order was incorrect.`
      : perfectResult
        ? `You found ${answerMarkup} using ${session.cluesRevealed} ${clueLabel} and got the steps in the correct order.`
        : session.success
          ? `You identified ${answerMarkup} using ${session.cluesRevealed} ${clueLabel}.`
          : `You chose ${selectedAnswerMarkup}. Today’s answer was ${answerSentenceMarkup} Your permanent Score and Solves are safe.`
    : session.success
      ? `You revealed ${answerMarkup} with ${session.wrongGuesses} ${session.wrongGuesses === 1 ? "mistake" : "mistakes"}.`
      : `You did not reveal the answer. Today’s answer was ${answerSentenceMarkup} Your permanent Score and Solves are safe.`;
  const funResultCopy = isEaster
    ? failedBonus
      ? `You identified ${answerMarkup}, but the step order was incorrect.`
      : perfectResult
        ? `You found ${answerMarkup} using ${session.cluesRevealed} ${clueLabel} and got the steps in the correct order.`
        : session.success
          ? `You identified ${answerMarkup} using ${session.cluesRevealed} ${clueLabel}.`
          : `You chose ${selectedAnswerMarkup}. Today’s answer was ${answerSentenceMarkup}`
    : session.success
      ? `You revealed ${answerMarkup} with ${session.wrongGuesses} ${session.wrongGuesses === 1 ? "mistake" : "mistakes"}.`
      : `You did not reveal the answer. Today’s answer was ${answerSentenceMarkup}`;
  const resultCopy = official ? officialResultCopy : `${funResultCopy} This result did not affect your stats.`;
  const resultClass = failedBonus
    ? "partial"
    : perfectResult
      ? "correct"
      : session.success
        ? "correct"
        : "failed";
  const resultDetail = isEaster
    ? session.success
      ? renderEasterBonusResult(session, official)
      : `<h3>Today’s three clues</h3><div class="clue-list">${renderClueCards({ cluesRevealed: 3 })}</div>`
    : `
      <section class="bonus-panel">
        <p class="word-result-category">${escapeHtml(session.summary?.label || "Uncategorised")}</p>
        <h2 class="final-map-name">${escapeHtml(answer)}</h2>
      </section>
    `;
  app.innerHTML = `
    <section class="panel">
      <div class="result-banner ${resultClass} animate${perfectResult && official ? " double-points-result" : ""}${failedBonus ? " bonus-correction-result" : ""}">
        <h2>${resultTitle}</h2>
        <p>${resultCopy}</p>
        ${official && session.success ? `<div class="result-score-total"><span>Round score</span><strong data-count-to="${session.points}">0</strong></div>` : ""}
        ${official && !session.success
          ? Math.max(1, session.roundsSurvivedBeforeLoss || 1) === 1
            ? '<p class="survival-summary">Your Round remains at <strong>Round 1</strong>.</p>'
            : `<p class="survival-summary">Your run ended at <strong>Round ${session.roundsSurvivedBeforeLoss}</strong>. Your next game starts at <strong>Round 1</strong>.</p>`
          : ""}
      </div>
      ${resultDetail}
      <div class="actions share-score-actions">
        ${official ? '<button id="share-demo-score" class="button share-score-button" type="button">Share with your squad</button>' : ""}
        <button id="return-to-puzzle-home" class="button" type="button">${allPuzzlesCompleted ? "View puzzles" : "Play another puzzle"}</button>
      </div>
      ${official ? '<p id="share-demo-score-status" class="share-score-status" aria-live="polite"></p>' : ""}
    </section>
    ${renderNextRoundScreen()}
  `;
  updateCountdown();
  const pointTotal = app.querySelector("[data-count-to]");
  if (pointTotal) animatePointTotal(pointTotal, Number(pointTotal.dataset.countTo));
  app.querySelector("#return-to-puzzle-home")?.addEventListener("click", renderHub);
  app.querySelector("#share-demo-score")?.addEventListener("click", (event) => {
    shareDemoScore(event.currentTarget, app.querySelector("#share-demo-score-status"), type, session);
  });
}

function renderCorrectStepOrder(showTicks = false, correction = false) {
  return `
    <ol class="steps-order${showTicks ? " is-confirmed" : ""}${correction ? " is-correction" : ""}">
      ${easterPuzzle.chronologicalSteps.map((step, index) => `
        <li style="--step-index: ${index}">
          <span class="order-rank">${index + 1}</span>
          <span>${escapeHtml(step.clue)}</span>
          ${showTicks ? `<span class="step-tick" style="--step-index: ${index}" aria-label="Correct">✓</span>` : ""}
        </li>
      `).join("")}
    </ol>
  `;
}

function renderEasterBonusResult(session, official) {
  const answer = getAnswerDisplayTitle(easterPuzzle.map, catalog.answerEquivalents);
  if (session.bonusComplete) {
    return `
      <section class="bonus-panel">
        <p class="kicker">Map</p>
        <h2 class="final-map-name">${escapeHtml(answer)}</h2>
        ${renderCorrectStepOrder(true)}
      </section>
    `;
  }
  return `
    <section class="bonus-panel">
      ${official ? '<h3>Bonus missed</h3><p class="helper-text">The steps were not in the correct order.</p>' : ""}
      <p class="kicker">Map</p>
      <h2 class="final-map-name">${escapeHtml(answer)}</h2>
      ${renderCorrectStepOrder(false, true)}
    </section>
  `;
}

function renderNextRoundScreen() {
  const motivation = dayState.officialCompleted && dayState.officialResult?.success === false
    ? "Return tomorrow to start a new Round."
    : "Return tomorrow to keep your Round alive.";
  return `
    <section class="next-round-screen" aria-labelledby="next-round-screen-title" aria-live="off">
      <p class="kicker">Next round</p>
      <h3 id="next-round-screen-title">New puzzles in</h3>
      <strong id="end-screen-countdown" class="end-screen-countdown" aria-label="Time until the new puzzles">--:--:--</strong>
      <p class="next-round-motivation">${motivation}</p>
    </section>
  `;
}

async function shareDemoScore(button, status, type, session) {
  const text = [
    `🧟 The Daily Undead · ${formatDate(dateKey)}`,
    `${puzzleTypes[type].name} · ${session.points} points`,
    `🔥 Round: ${profile.round}`,
    `⚡ Score: ${profile.score}`,
    `🏆 Solves: ${profile.solves}`,
  ].join("\n");
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ text });
      button.textContent = "Shared!";
      status.textContent = "Your score was shared.";
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "Score copied!";
    status.textContent = "Sharing wasn’t available, so your score was copied instead.";
  } catch {
    status.textContent = "Couldn’t share automatically. Please try again.";
  }
}

function renderWordSlots(answer, revealedLetters, { revealLetter = "", finalReveal = false } = {}) {
  const revealed = new Set(revealedLetters);
  const newlyRevealedLetter = normalizeLetter(revealLetter);
  let revealIndex = 0;
  return answer.split(" ").map((word, wordIndex) => `
    <span class="word-token${finalReveal ? " is-completing" : ""}"${finalReveal ? ` style="--word-index: ${wordIndex}"` : ""}>
      ${[...word].map((character) => {
        const letter = normalizeLetter(character);
        if (!letter) return `<span class="word-literal">${escapeHtml(character)}</span>`;
        const visible = revealed.has(letter);
        const newlyRevealed = visible && letter === newlyRevealedLetter;
        const stagger = newlyRevealed ? ` style="--reveal-index: ${revealIndex++}"` : "";
        return `<span class="word-letter${visible ? " is-visible" : ""}${newlyRevealed ? " is-newly-revealed" : ""}"${stagger} aria-label="${visible ? letter : "Hidden letter"}">${visible ? letter : ""}</span>`;
      }).join("")}
    </span>
  `).join('<span class="word-space" aria-hidden="true"></span>');
}

function getWordCompletionDelay(success) {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return success ? 1000 : 120;
  if (!success) return 850;
  const wordCount = wordPuzzle.entry.answer.trim().split(/\s+/).length;
  return Math.min(2800, 1900 + ((wordCount - 1) * 180));
}

function finishPendingWordResult(session) {
  const pendingResult = session.pendingResult;
  if (!pendingResult || session.complete) return;
  window.setTimeout(() => {
    if (session.complete || session.pendingResult !== pendingResult) return;
    session.pendingResult = null;
    const success = pendingResult === "success";
    finishPuzzle("word", {
      success,
      points: success ? calculateWordPoints(session.wrongGuesses) : 0,
      summary: {
        label: wordPuzzle.entry.category,
        answer: wordPuzzle.entry.answer,
        detail: success
          ? `${session.wrongGuesses} ${session.wrongGuesses === 1 ? "mistake" : "mistakes"}`
          : "Five incorrect letters",
      },
    });
  }, getWordCompletionDelay(pendingResult === "success"));
}

function renderWordPuzzle({
  scoreChanged = false,
  revealLetter = "",
  statusMessage = "",
  statusType = "",
} = {}) {
  const session = ensureSession("word");
  if (session.complete) {
    renderCompletion("word", session, activePlay?.mode || "for_fun");
    return;
  }
  const official = activePlay?.mode === "official";
  const finalReveal = session.pendingResult === "success";
  const resultPending = Boolean(session.pendingResult);
  const answerLetters = wordPuzzle.entry.answer.toUpperCase();
  const guesses = new Set(session.guesses);
  const initialLetters = new Set(wordPuzzle.initialLetters);
  const revealed = new Set(wordPuzzle.initialLetters);
  session.guesses.forEach((letter) => {
    if (answerLetters.includes(letter)) revealed.add(letter);
  });
  const potentialPoints = calculateWordPoints(session.wrongGuesses);
  const displayedStatus = statusMessage || (finalReveal
    ? "Answer revealed!"
    : session.pendingResult === "failure"
      ? "No attempts remaining."
      : "Choose a letter.");
  const displayedStatusType = statusType || (finalReveal ? "complete" : "");
  const animatedLetter = revealLetter || (finalReveal ? session.lastGuess : "");
  const longestWordLength = Math.max(
    ...wordPuzzle.entry.answer.split(/\s+/).map(
      (word) => [...word].filter((character) => /[A-Z]/i.test(character)).length,
    ),
  );
  const keyboardRows = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
  app.innerHTML = `
    <section class="panel word-puzzle-panel">
      ${renderHeading(
        "Which Zombies word is it?",
        "Try to solve the Zombies word or phrase by revealing its letters.",
        official ? "Official puzzle" : "Just for fun",
        official ? "" : "Playing just for fun. This result will not change your stats.",
        `Hint: ${wordPuzzle.entry.category}`,
      )}
      <div class="word-scoreboard${official ? "" : " is-single"}" aria-label="Word puzzle progress">
        <div class="word-mistakes danger-level-${session.wrongGuesses}">
          <span>Mistakes</span>
          <strong>${session.wrongGuesses} / 5</strong>
          <div class="word-danger-meter" aria-hidden="true">
            ${[1, 2, 3, 4, 5].map((stage) => `<i class="${stage <= session.wrongGuesses ? "is-active" : ""}${scoreChanged && stage === session.wrongGuesses ? " is-new" : ""}"></i>`).join("")}
          </div>
        </div>
        ${official ? `<div><span>Potential score</span><strong class="word-score-value${scoreChanged ? " is-changing" : ""}">${potentialPoints}</strong></div>` : ""}
      </div>
      <div class="word-answer${longestWordLength >= 11 ? " has-long-word" : ""}${finalReveal ? " is-final-reveal" : ""}" aria-label="Partially revealed answer">
        ${renderWordSlots(wordPuzzle.entry.answer, revealed, { revealLetter: animatedLetter, finalReveal })}
      </div>
      <div class="word-keyboard" aria-label="Letter keyboard">
        ${keyboardRows.map((row) => `
          <div class="word-keyboard-row">
            ${[...row].map((letter) => {
              const used = guesses.has(letter) || initialLetters.has(letter);
              const correct = answerLetters.includes(letter);
              const stateClass = initialLetters.has(letter)
                ? " is-revealed"
                : used && correct
                  ? " is-correct"
                  : used
                    ? " is-incorrect"
                    : "";
              const stateLabel = initialLetters.has(letter)
                ? "Starting letter"
                : !used
                  ? "Unused"
                  : correct
                    ? "Correct"
                    : "Incorrect";
              return `<button class="word-key${stateClass}" type="button" data-letter="${letter}" aria-label="${letter}: ${stateLabel}" ${used || resultPending ? "disabled" : ""}>${letter}</button>`;
            }).join("")}
          </div>
        `).join("")}
      </div>
      <p id="word-game-status" class="word-game-status${displayedStatusType ? ` is-${displayedStatusType}` : ""}" aria-live="polite">${escapeHtml(displayedStatus)}</p>
    </section>
  `;
  app.querySelectorAll("[data-letter]").forEach((button) => {
    button.addEventListener("click", () => submitLetter(button.dataset.letter));
  });
  if (resultPending) finishPendingWordResult(session);
}

function submitLetter(value) {
  if (activePlay?.type !== "word") return;
  const official = activePlay.mode === "official";
  const letter = normalizeLetter(value);
  const session = ensureSession("word");
  if (!letter || session.complete || session.pendingResult || session.guesses.includes(letter) || wordPuzzle.initialLetters.includes(letter)) return;
  session.guesses.push(letter);
  session.lastGuess = letter;
  const correct = wordPuzzle.entry.answer.toUpperCase().includes(letter);
  if (correct) {
    session.correctStreak = (session.correctStreak || 0) + 1;
  } else {
    session.wrongGuesses += 1;
    session.correctStreak = 0;
  }
  const revealed = [...wordPuzzle.initialLetters, ...session.guesses];
  const solved = isWordSolved(wordPuzzle.entry.answer, revealed);
  if (solved) {
    session.pendingResult = "success";
    persist();
    renderWordPuzzle({ revealLetter: letter, statusMessage: "Answer revealed!", statusType: "complete" });
    return;
  }
  if (session.wrongGuesses >= 5) {
    session.pendingResult = "failure";
    persist();
    renderWordPuzzle({ scoreChanged: true, statusMessage: "No attempts remaining." });
    return;
  }
  persist();
  const streakMessage = session.correctStreak >= 2
    ? `${session.correctStreak} correct letters in a row!`
    : `${letter} is in the answer.`;
  renderWordPuzzle({
    scoreChanged: !correct,
    revealLetter: correct ? letter : "",
    statusMessage: correct
      ? streakMessage
      : official
        ? `${letter} is not in the answer. Potential score is now ${calculateWordPoints(session.wrongGuesses)}.`
        : `${letter} is not in the answer.`,
    statusType: correct && session.correctStreak >= 2 ? "streak" : "",
  });
}

function renderClueCards(session, newlyRevealedIndex = -1) {
  return easterPuzzle.displayedSteps.map((step, index) => index < session.cluesRevealed
    ? `<article class="clue-card${index === newlyRevealedIndex ? " is-newly-revealed" : ""}"><p class="clue-number">Clue ${index + 1}</p><p class="clue-text">${escapeHtml(step.hardClue)}</p></article>`
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

function renderEasterClues(session, { newlyRevealedIndex = -1, scoreChanged = false } = {}) {
  const official = activePlay?.mode === "official";
  const potentialPoints = calculateMapPoints(session.cluesRevealed);
  app.innerHTML = `
    <section class="panel quest-clue-panel">
      ${renderHeading(
        "Which Zombies map is it?",
        official
          ? "Identify the map from its main quest steps. Reveal as few clues as possible to earn more points."
          : "Identify the map from its main quest steps. Reveal another clue if you need it.",
        official ? "Official puzzle" : "Just for fun",
        official ? "" : "Playing just for fun. This result will not change your stats.",
      )}
      <div class="quest-intel-status${official ? "" : " is-single"}" aria-label="Quest puzzle progress">
        <div><span>Clues revealed</span><strong>${session.cluesRevealed} / 3</strong></div>
        ${official ? `<div><span>Potential score</span><strong class="quest-score-value${scoreChanged ? " is-changing" : ""}">${potentialPoints}</strong></div>` : ""}
      </div>
      <div class="clue-list">${renderClueCards(session, newlyRevealedIndex)}</div>
      <div class="actions">
        <button id="demo-reveal-clue" class="button" type="button" ${session.cluesRevealed >= 3 ? "disabled" : ""}>${session.cluesRevealed >= 3 ? "All clues revealed" : "Reveal next clue"}</button>
        <button id="demo-select-map" class="button primary" type="button">Select map</button>
      </div>
    </section>
  `;
  app.querySelector("#demo-reveal-clue")?.addEventListener("click", () => {
    session.cluesRevealed = Math.min(3, session.cluesRevealed + 1);
    persist();
    renderEasterClues(session, { newlyRevealedIndex: session.cluesRevealed - 1, scoreChanged: official });
  });
  app.querySelector("#demo-select-map").addEventListener("click", () => {
    session.phase = "game";
    persist();
    renderEasterPuzzle();
  });
}

function renderEasterGameSelection(session) {
  const games = catalog.games.slice().sort((left, right) => left.releaseOrder - right.releaseOrder);
  const kicker = activePlay?.mode === "official" ? "Lock in your answer" : "Just for fun";
  app.innerHTML = `
    <section class="panel answer-selection-panel">
      ${renderHeading("Choose the game", `You have revealed ${session.cluesRevealed} ${session.cluesRevealed === 1 ? "clue" : "clues"}.`, kicker)}
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
  const kicker = activePlay?.mode === "official" ? "Lock in your answer" : "Just for fun";
  const gameMaps = orderMapsForGame(
    selectableMaps.filter((map) => isMapAvailableOnDate(map, dateKey)),
    session.selectedGameId,
    catalog.mapOrder?.[session.selectedGameId],
  );
  app.innerHTML = `
    <section class="panel answer-selection-panel">
      ${renderHeading(`Choose a ${game.title} map`, "Tap a map, then confirm your final answer.", kicker)}
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
    app.querySelectorAll("[data-map-id]").forEach((candidate) => {
      candidate.setAttribute("aria-pressed", String(candidate === button));
      candidate.classList.remove("is-newly-selected");
    });
    button.classList.add("is-newly-selected");
    const confirmButton = app.querySelector("#confirm-demo-map");
    if (confirmButton) confirmButton.disabled = false;
  }));
  app.querySelector("#back-to-demo-games").addEventListener("click", () => {
    session.phase = "game";
    session.selectedMapId = null;
    persist();
    renderEasterPuzzle();
  });
  app.querySelector("#confirm-demo-map").addEventListener("click", () => {
    submitEasterMap(session);
  });
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
  if (activePlay?.mode === "official") applyOfficialEasterMapProgression(session);
  session.phase = "bonus";
  persist();
  renderEasterPuzzle();
}

function getEasterBonusFeedbackDelay(correct) {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return 120;
  return correct ? 800 : 950;
}

function finishPendingEasterBonus(session) {
  const pendingResult = session.pendingBonusResult;
  if (!pendingResult || session.complete) return;
  window.setTimeout(() => {
    if (session.complete || session.pendingBonusResult !== pendingResult) return;
    const bonusCorrect = pendingResult === "correct";
    const bonusPoints = calculateBonusPoints(session.mapPoints, bonusCorrect);
    session.pendingBonusResult = null;
    finishPuzzle("easter", {
      success: true,
      points: session.mapPoints + bonusPoints,
      summary: {
        label: "Today’s map",
        answer: getAnswerDisplayTitle(easterPuzzle.map, catalog.answerEquivalents),
        detail: bonusCorrect ? "Bonus order correct" : "Map correct · Bonus order missed",
      },
    });
  }, getEasterBonusFeedbackDelay(pendingResult === "correct"));
}

function showPendingEasterBonusFeedback(session) {
  const bonusCorrect = session.pendingBonusResult === "correct";
  const list = app.querySelector(".order-choice-list");
  list?.classList.toggle("is-order-correct", bonusCorrect);
  list?.classList.toggle("is-order-incorrect", !bonusCorrect);
  app.querySelectorAll("[data-step-id]").forEach((button) => {
    button.disabled = true;
  });
  const progress = app.querySelector(".selection-progress");
  if (progress) {
    progress.textContent = bonusCorrect ? "Order correct" : "Order incorrect";
    progress.classList.toggle("is-correct", bonusCorrect);
    progress.classList.toggle("is-incorrect", !bonusCorrect);
  }
  const submitButton = app.querySelector("#submit-demo-order");
  if (submitButton) submitButton.disabled = true;
  finishPendingEasterBonus(session);
}

function updateEasterBonusSelection(session, changedButton = null) {
  const progress = app.querySelector(".selection-progress");
  const ready = session.bonusOrder.length === 3;
  if (progress) {
    progress.textContent = ready ? "Ready to submit" : `Selected: ${session.bonusOrder.length} of 3`;
    progress.classList.toggle("is-ready", ready);
  }
  const chain = app.querySelector(".order-chain");
  chain?.classList.toggle("is-ready", ready);
  chain?.querySelectorAll("i").forEach((segment, index) => {
    segment.classList.toggle("is-active", index < session.bonusOrder.length);
  });
  app.querySelectorAll("[data-step-id]").forEach((button) => {
    const selectedIndex = session.bonusOrder.indexOf(button.dataset.stepId);
    button.setAttribute("aria-pressed", String(selectedIndex >= 0));
    button.classList.remove("is-newly-ranked");
    const rank = button.querySelector(".order-rank");
    if (rank) rank.textContent = selectedIndex >= 0 ? String(selectedIndex + 1) : "+";
  });
  if (changedButton && session.bonusOrder.includes(changedButton.dataset.stepId)) {
    void changedButton.offsetWidth;
    changedButton.classList.add("is-newly-ranked");
  }
  const submitButton = app.querySelector("#submit-demo-order");
  if (submitButton) submitButton.disabled = !ready;
}

function renderEasterBonus(session) {
  const answer = getAnswerDisplayTitle(easterPuzzle.map, catalog.answerEquivalents);
  const clueLabel = session.cluesRevealed === 1 ? "clue" : "clues";
  const official = activePlay?.mode === "official";
  if (official && applyOfficialEasterMapProgression(session)) persist();
  const pendingResult = session.pendingBonusResult;
  const selectedCount = session.bonusOrder.length;
  app.innerHTML = `
    <section class="panel easter-bonus-panel">
      ${official ? "" : '<p class="kicker">Just for fun</p>'}
      <div class="result-banner correct animate map-identification-banner">
        <h2>${official ? "Round Survived!" : "Map Identified!"}</h2>
        <p>${official
          ? `You identified <strong class="identified-map-name">${escapeHtml(answer)}</strong> using ${session.cluesRevealed} ${clueLabel}. You earned ${session.mapPoints} points this round.`
          : `You identified <strong class="identified-map-name">${escapeHtml(answer)}</strong> using ${session.cluesRevealed} ${clueLabel}. Now try the bonus objective.`}</p>
      </div>
      <section class="bonus-panel">
        <h3>Bonus: Put the steps in order</h3>
        <p class="helper-text">${official
          ? "Order the steps to earn Double Points. Tap a selected step to remove it."
          : "Order the steps correctly. Tap a selected step to remove it."}</p>
        <div class="bonus-order-status">
          <p class="selection-progress${selectedCount === 3 ? " is-ready" : ""}" aria-live="polite">${selectedCount === 3 ? "Ready to submit" : `Selected: ${selectedCount} of 3`}</p>
          <div class="order-chain${selectedCount === 3 ? " is-ready" : ""}" aria-hidden="true">
            ${[0, 1, 2].map((index) => `<i class="${index < selectedCount ? "is-active" : ""}"></i>`).join("")}
          </div>
        </div>
        <ul class="order-choice-list${pendingResult === "correct" ? " is-order-correct" : pendingResult === "incorrect" ? " is-order-incorrect" : ""}">
          ${easterPuzzle.displayedSteps.map((step) => {
            const selectedIndex = session.bonusOrder.indexOf(step.id);
            return `<li><button class="order-choice" type="button" data-step-id="${escapeHtml(step.id)}" aria-pressed="${selectedIndex >= 0}" ${pendingResult ? "disabled" : ""}><span class="order-rank">${selectedIndex >= 0 ? selectedIndex + 1 : "+"}</span><span class="order-text">${escapeHtml(step.clue)}</span></button></li>`;
          }).join("")}
        </ul>
        <div class="actions"><button id="submit-demo-order" class="button primary" type="button" ${selectedCount === 3 && !pendingResult ? "" : "disabled"}>Submit order · One attempt only</button></div>
      </section>
    </section>
  `;
  app.querySelectorAll("[data-step-id]").forEach((button) => button.addEventListener("click", () => {
    if (session.pendingBonusResult) return;
    session.bonusOrder = toggleOrderedSelection(session.bonusOrder, button.dataset.stepId);
    persist();
    updateEasterBonusSelection(session, button);
  }));
  app.querySelector("#submit-demo-order").addEventListener("click", () => {
    if (session.pendingBonusResult) return;
    const bonusCorrect = isCorrectOrder(session.bonusOrder, easterPuzzle.chronologicalSteps);
    session.bonusComplete = bonusCorrect;
    session.bonusFailed = !bonusCorrect;
    session.pendingBonusResult = bonusCorrect ? "correct" : "incorrect";
    persist();
    showPendingEasterBonusFeedback(session);
  });
  if (pendingResult) showPendingEasterBonusFeedback(session);
}

async function loadData() {
  const [wordResponse, indexResponse] = await Promise.all([
    fetch("./data/word-puzzle-demo.json", { cache: "no-store" }),
    fetch("./data/maps/index.json", { cache: "no-store" }),
  ]);
  if (!wordResponse.ok || !indexResponse.ok) throw new Error("Could not load the demo catalogues.");
  const wordBank = await wordResponse.json();
  catalog = await indexResponse.json();
  wordEntries = wordBank.words;
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

async function initialise() {
  try {
    dateKey = getRequestedDateKey();
    dateLabel.textContent = `${formatDate(dateKey)}${new URLSearchParams(window.location.search).has("date") ? " · Preview" : ""}`;
    profile = loadProfile();
    await loadData();
    easterPuzzle = buildDailyPuzzle(dateKey, maps);
    wordPuzzle = buildDailyWordPuzzle(dateKey, wordEntries);
    dayState = loadDayState();
    advanceButton.addEventListener("click", advanceDay);
    document.addEventListener("keydown", (event) => {
      if (activePlay?.type !== "word") return;
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
