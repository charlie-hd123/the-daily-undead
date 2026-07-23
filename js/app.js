import {
  buildDailyPuzzle,
  getAnswerDisplayTitle,
  getLocalDateKey,
  isAcceptedMapSelection,
  isCorrectOrder,
  isValidDateKey,
  orderMapsForGame,
  toggleOrderedSelection,
} from "./game-core.js?v=20260722-5";

const app = document.querySelector("#app");
const dateLabel = document.querySelector("#puzzle-date");
const clueTemplate = document.querySelector("#clue-template");

let catalog;
let maps;
let selectableMaps;
let puzzle;
let state;
let replayIndex = 0;
let lastResultClass = null;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getDateKey() {
  const previewDate = new URLSearchParams(window.location.search).get("date");
  return previewDate && isValidDateKey(previewDate) ? previewDate : getLocalDateKey();
}

function formatDate(dateKey) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${dateKey}T12:00:00`));
}

function validateMap(map, source) {
  const requiredStrings = ["id", "gameId", "gameTitle", "title"];
  const missingField = requiredStrings.find((field) => typeof map[field] !== "string" || !map[field]);

  if (missingField || !Array.isArray(map.steps) || map.steps.length < 3) {
    throw new Error(`Invalid map data in ${source}.`);
  }

  const stepIds = new Set();
  for (const step of map.steps) {
    if (
      typeof step.id !== "string" ||
      !step.id ||
      typeof step.order !== "number" ||
      typeof step.clue !== "string" ||
      !step.clue ||
      stepIds.has(step.id)
    ) {
      throw new Error(`Invalid step data in ${source}.`);
    }
    stepIds.add(step.id);
  }

  return map;
}

async function loadData() {
  const indexResponse = await fetch("./data/maps/index.json", { cache: "no-store" });
  if (!indexResponse.ok) {
    throw new Error("Could not load the map index.");
  }

  catalog = await indexResponse.json();
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

  const gameTitles = new Map(catalog.games.map((game) => [game.id, game.title]));
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
    stateVersion: 2,
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
  };
}

function storageKey() {
  return `dead-drop:${puzzle.dateKey}`;
}

function replayStorageKey(dateKey) {
  return `dead-drop:${dateKey}:replay-index`;
}

function loadReplayIndex(dateKey) {
  try {
    const savedIndex = Number.parseInt(localStorage.getItem(replayStorageKey(dateKey)), 10);
    return Number.isInteger(savedIndex) && savedIndex >= 0 ? savedIndex : 0;
  } catch {
    return 0;
  }
}

function saveReplayIndex(dateKey) {
  try {
    localStorage.setItem(replayStorageKey(dateKey), String(replayIndex));
  } catch {
    // Replays still rotate maps during this session when storage is disabled.
  }
}

function buildNextReplayPuzzle(dateKey) {
  const currentMapId = puzzle.map.id;
  let candidate = puzzle;

  for (let attempt = 0; attempt < maps.length; attempt += 1) {
    replayIndex += 1;
    candidate = buildDailyPuzzle(dateKey, maps, replayIndex);

    if (candidate.map.id !== currentMapId || maps.length === 1) {
      break;
    }
  }

  saveReplayIndex(dateKey);
  return candidate;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey()));
    if (saved?.stateVersion === 2 && saved?.puzzleKey === puzzle.key) {
      return { ...createInitialState(), ...saved };
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

function setState(update) {
  state = { ...state, ...update };
  saveState();
  render();
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
      const hidden = document.createElement("li");
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
        "Identify the map from its main quest steps. Reveal as few clues as possible before locking in.",
      )}
      <div id="clue-list" class="clue-list"></div>
      <div class="actions">
        <button id="reveal-clue" class="button" type="button" ${state.cluesRevealed >= 3 ? "disabled" : ""}>
          ${state.cluesRevealed >= 3 ? "All clues revealed" : "Reveal next clue"}
        </button>
        <button id="lock-answer" class="button primary" type="button">
          Lock in your answer · ${state.cluesRevealed} ${state.cluesRevealed === 1 ? "clue" : "clues"}
        </button>
      </div>
    </section>
  `;

  renderClueCards(app.querySelector("#clue-list"), state.cluesRevealed, true);
  app.querySelector("#reveal-clue")?.addEventListener("click", () => {
    setState({ cluesRevealed: Math.min(3, state.cluesRevealed + 1) });
  });
  app.querySelector("#lock-answer").addEventListener("click", () => {
    setState({ phase: "game", lockedClues: state.cluesRevealed });
  });
}

function renderGameSelection() {
  const games = [...catalog.games].sort((left, right) => left.releaseOrder - right.releaseOrder);

  app.innerHTML = `
    <section class="panel">
      ${renderHeading("Choose the game", `Your score is locked at ${state.lockedClues} ${state.lockedClues === 1 ? "clue" : "clues"}.`, "Lock in your answer")}
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
    </section>
  `;

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

  app.querySelectorAll("[data-map-id]").forEach((button) => {
    button.addEventListener("click", () => setState({ selectedMapId: button.dataset.mapId }));
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
    setState({ phase: "result", isCorrect, cluesRevealed: isCorrect ? 3 : state.cluesRevealed });
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
      <h3>Bonus Challenge: Put the steps in order</h3>
      <p class="helper-text">Select the steps in the order they occur. Tap a selected step again to remove it and revise your order.</p>
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

function renderResult() {
  const selectedMap = selectableMaps.find((map) => map.id === state.selectedMapId);
  const answerTitle = getPuzzleAnswerTitle();
  const failedBonus = state.isCorrect && state.bonusFailed;
  const perfectResult = state.isCorrect && state.bonusComplete;
  const clueLabel = state.lockedClues === 1 ? "clue" : "clues";
  const resultTitle = failedBonus
    ? "Not quite"
    : perfectResult
      ? "Perfect!"
      : state.isCorrect
        ? "Correct!"
        : "Not this time";
  const resultCopy = failedBonus
    ? `You identified ${answerTitle}, but the step order was incorrect.`
    : perfectResult
      ? `You found ${answerTitle} using ${state.lockedClues} ${clueLabel} and got the steps in the correct order.`
      : state.isCorrect
        ? `You identified ${answerTitle} in ${state.lockedClues} ${clueLabel}.`
        : `You chose ${selectedMap?.title ?? "an unknown map"}. Today’s answer was ${answerTitle}.`;
  const resultClass = failedBonus ? "failed" : perfectResult ? "perfect" : state.isCorrect ? "correct" : "failed";
  const animateResult = resultClass !== lastResultClass;
  lastResultClass = resultClass;
  const showReplay = !state.isCorrect || state.bonusComplete || state.bonusFailed;

  app.innerHTML = `
    <section class="panel">
      <div class="result-banner ${resultClass}${animateResult ? " animate" : ""}">
        <h2>${resultTitle}</h2>
        <p>${escapeHtml(resultCopy)}</p>
      </div>
      ${state.isCorrect ? renderBonus() : '<h3>Today’s three clues</h3><div id="clue-list" class="clue-list"></div>'}
      ${
        showReplay
          ? `<div class="actions">
              <button id="replay-puzzle" class="button" type="button">Replay with a different map · Development</button>
            </div>`
          : ""
      }
    </section>
  `;

  if (!state.isCorrect) {
    renderClueCards(app.querySelector("#clue-list"), 3);
  }
  if (showReplay) {
    app.querySelector("#replay-puzzle").addEventListener("click", () => {
      const dateKey = puzzle.dateKey;

      try {
        localStorage.removeItem(storageKey());
      } catch {
        // Reset the in-memory state even when storage is disabled.
      }

      puzzle = buildNextReplayPuzzle(dateKey);
      state = createInitialState();
      saveState();
      render();
    });
  }

  if (!state.isCorrect || state.bonusComplete || state.bonusFailed) return;

  app.querySelectorAll("[data-bonus-step-id]").forEach((button) => {
    button.addEventListener("click", () => {
      setState({
        bonusOrder: toggleOrderedSelection(state.bonusOrder, button.dataset.bonusStepId),
      });
    });
  });
  app.querySelector("#submit-order").addEventListener("click", () => {
    if (isCorrectOrder(state.bonusOrder, puzzle.chronologicalSteps)) {
      setState({ bonusComplete: true });
      return;
    }

    setState({ bonusFailed: true });
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
    await loadData();
    const dateKey = getDateKey();
    replayIndex = loadReplayIndex(dateKey);
    puzzle = buildDailyPuzzle(dateKey, maps, replayIndex);
    state = loadState();
    dateLabel.textContent = `${formatDate(dateKey)}${new URLSearchParams(window.location.search).has("date") ? " · Preview" : ""}`;
    render();
  } catch (error) {
    console.error(error);
    app.innerHTML = `
      <section class="panel error-panel">
        <h2>The puzzle could not load</h2>
        <p>${escapeHtml(error.message)}</p>
        <p>If you opened <code>index.html</code> directly, start a local web server and open the supplied local URL instead.</p>
      </section>
    `;
  }
}

initialise();
