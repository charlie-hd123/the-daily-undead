const numberFormatter = new Intl.NumberFormat("en-GB");

export function resolveLeaderboardsApiUrl({
  isLocalDevelopment,
  documentObject = globalThis.document,
} = {}) {
  if (isLocalDevelopment) return "http://localhost:8788";

  const configuredUrl = documentObject
    ?.querySelector('meta[name="daily-undead-stats-api"]')
    ?.content
    ?.trim();
  if (!configuredUrl) return null;

  try {
    const url = new URL(configuredUrl);
    return url.protocol === "https:" ? url.href.replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}

export async function fetchLeaderboards({ apiUrl, puzzleDate, fetchImpl = globalThis.fetch }) {
  const url = new URL("/api/leaderboards", apiUrl);
  url.searchParams.set("date", puzzleDate);
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Leaderboard request failed (${response.status}).`);
    return await response.json();
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function compareUsername(left, right) {
  if (left.username === right.username) return 0;
  return left.username < right.username ? -1 : 1;
}

export function sortAllTimeEntries(entries, ranking = "highestRound") {
  const primary = ranking === "totalRounds" ? "totalRounds" : "highestRound";
  const secondary = primary === "highestRound" ? "totalRounds" : "highestRound";

  return [...entries].sort(
    (left, right) =>
      right[primary] - left[primary] ||
      right[secondary] - left[secondary] ||
      right.currentRound - left.currentRound ||
      right.points - left.points ||
      compareUsername(left, right),
  );
}

function makeRank(documentObject, rank) {
  const element = documentObject.createElement("span");
  element.className = "leaderboard-rank";
  element.textContent = rank == null ? "—" : String(rank);
  return element;
}

function makePlayer(
  documentObject,
  username,
  resultLabel = null,
  resultClass = null,
  resultAccent = null,
) {
  const player = documentObject.createElement("span");
  player.className = "leaderboard-player";
  const name = documentObject.createElement("strong");
  name.textContent = username;
  player.append(name);

  if (resultLabel) {
    const result = documentObject.createElement("small");
    result.className = `leaderboard-result is-${resultClass || resultLabel.toLowerCase()}`;
    result.textContent = resultLabel;
    if (resultAccent) {
      result.append(documentObject.createTextNode(" "));
      const accent = documentObject.createElement("span");
      accent.className = "leaderboard-result-accent";
      accent.textContent = resultAccent;
      result.append(accent);
    }
    player.append(result);
  }

  return player;
}

function makePoints(documentObject, points) {
  const score = documentObject.createElement("span");
  score.className = "leaderboard-score";
  const value = documentObject.createElement("strong");
  value.textContent = numberFormatter.format(points);
  const label = documentObject.createElement("small");
  label.textContent = "PTS";
  score.append(value, label);
  score.setAttribute("aria-label", `${numberFormatter.format(points)} points`);
  return score;
}

function markCurrentPlayer(item, username, currentUsername) {
  item.dataset.username = username;
  item.tabIndex = -1;
  if (currentUsername && username === currentUsername) {
    item.classList.add("is-current-player");
    item.setAttribute("aria-label", `${username}, your leaderboard entry`);
  }
}

function renderTodayEntries(list, entries, currentUsername, documentObject) {
  list.replaceChildren();
  if (!entries.length) {
    const empty = documentObject.createElement("li");
    empty.className = "leaderboard-empty";
    empty.textContent = "No correct answers yet today.";
    list.append(empty);
    return;
  }

  entries.forEach((entry) => {
    const item = documentObject.createElement("li");
    item.className = "leaderboard-entry leaderboard-today-entry";
    markCurrentPlayer(item, entry.username, currentUsername);
    const clueLabel = `${entry.cluesUsed} ${entry.cluesUsed === 1 ? "Clue" : "Clues"}`;
    item.append(
      makePlayer(
        documentObject,
        entry.username,
        entry.bonusCorrect ? `${clueLabel} +` : clueLabel,
        "correct",
        entry.bonusCorrect ? "Bonus" : null,
      ),
      makePoints(documentObject, entry.points),
    );
    list.append(item);
  });
}

function makeMetric(documentObject, label, value) {
  const metric = documentObject.createElement("div");
  const term = documentObject.createElement("dt");
  term.textContent = label;
  const description = documentObject.createElement("dd");
  description.textContent = numberFormatter.format(value);
  metric.append(term, description);
  return metric;
}

function renderAllTimeEntries(
  list,
  entries,
  ranking,
  currentUsername,
  documentObject,
) {
  list.replaceChildren();
  const sortedEntries = sortAllTimeEntries(entries, ranking);
  if (!sortedEntries.length) {
    const empty = documentObject.createElement("li");
    empty.className = "leaderboard-empty";
    empty.textContent = "No accounts yet.";
    list.append(empty);
    return;
  }

  sortedEntries.forEach((entry, index) => {
    const item = documentObject.createElement("li");
    item.className = "leaderboard-entry leaderboard-all-time-entry";
    markCurrentPlayer(item, entry.username, currentUsername);

    const player = makePlayer(documentObject, entry.username);
    const supportingMetrics = documentObject.createElement("dl");
    supportingMetrics.className = "leaderboard-supporting-metrics";
    supportingMetrics.append(
      makeMetric(documentObject, "Current round", entry.currentRound),
      makeMetric(documentObject, "Points balance", entry.points),
    );
    player.append(supportingMetrics);

    const rankingMetric = documentObject.createElement("dl");
    rankingMetric.className = "leaderboard-primary-metric";
    rankingMetric.append(
      makeMetric(
        documentObject,
        ranking === "totalRounds" ? "Total rounds" : "Highest round",
        ranking === "totalRounds" ? entry.totalRounds : entry.highestRound,
      ),
    );

    item.append(
      makeRank(documentObject, index + 1),
      player,
      rankingMetric,
    );
    list.append(item);
  });
}

export function initialiseLeaderboards({
  apiUrl,
  button,
  dialog,
  getPuzzleDate,
  getCurrentUsername = () => null,
  documentObject = globalThis.document,
  fetchImpl = globalThis.fetch,
}) {
  if (!button || !dialog) return;

  const status = dialog.querySelector("[data-leaderboard-status]");
  const eliteList = dialog.querySelector("[data-leaderboard-list='daily-elite']");
  const playerCount = dialog.querySelector("[data-leaderboard-player-count]");
  const allTimeList = dialog.querySelector("[data-leaderboard-list='all-time']");
  const tabs = [...dialog.querySelectorAll("[data-leaderboard-tab]")];
  const panels = [...dialog.querySelectorAll("[data-leaderboard-panel]")];
  const rankingButtons = [...dialog.querySelectorAll("[data-all-time-ranking]")];
  const findButtons = [...dialog.querySelectorAll("[data-leaderboard-find]")];
  let allTimeEntries = [];
  let currentUsername = null;
  let ranking = "highestRound";

  function updateFindButtons() {
    findButtons.forEach((findButton) => {
      const panel = dialog.querySelector(
        `[data-leaderboard-panel='${findButton.dataset.leaderboardFind}']`,
      );
      findButton.hidden = !panel?.querySelector(".is-current-player");
    });
  }

  function selectTab(tabName) {
    tabs.forEach((tab) => {
      const selected = tab.dataset.leaderboardTab === tabName;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.leaderboardPanel !== tabName;
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => selectTab(tab.dataset.leaderboardTab));
  });

  rankingButtons.forEach((rankingButton) => {
    rankingButton.addEventListener("click", () => {
      ranking = rankingButton.dataset.allTimeRanking;
      rankingButtons.forEach((candidate) => {
        candidate.setAttribute("aria-pressed", String(candidate === rankingButton));
      });
      renderAllTimeEntries(
        allTimeList,
        allTimeEntries,
        ranking,
        currentUsername,
        documentObject,
      );
      updateFindButtons();
    });
  });

  findButtons.forEach((findButton) => {
    findButton.addEventListener("click", () => {
      const panel = dialog.querySelector(
        `[data-leaderboard-panel='${findButton.dataset.leaderboardFind}']`,
      );
      const currentEntry = panel?.querySelector(".is-current-player");
      currentEntry?.scrollIntoView({ block: "center", behavior: "smooth" });
      currentEntry?.focus({ preventScroll: true });
    });
  });

  dialog.querySelector("[data-close-leaderboards-dialog]")?.addEventListener("click", () => {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  });

  button.addEventListener("click", async () => {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");

    status.textContent = "Loading current scores…";
    status.dataset.state = "loading";
    if (!apiUrl) {
      status.textContent = "Leaderboards are not configured.";
      status.dataset.state = "error";
      return;
    }

    try {
      const result = await fetchLeaderboards({
        apiUrl,
        puzzleDate: getPuzzleDate(),
        fetchImpl,
      });
      currentUsername = getCurrentUsername();
      allTimeEntries = result.allTime || [];
      playerCount.textContent = numberFormatter.format(result.today?.playersToday || 0);
      renderTodayEntries(
        eliteList,
        result.today?.elite || [],
        currentUsername,
        documentObject,
      );
      renderAllTimeEntries(
        allTimeList,
        allTimeEntries,
        ranking,
        currentUsername,
        documentObject,
      );
      updateFindButtons();
      status.textContent = "See where you rank today and among the all-time leaders.";
      status.dataset.state = "ready";
    } catch {
      status.textContent = "Live scores couldn’t be loaded. Start the local leaderboard preview and try again.";
      status.dataset.state = "error";
    }
  });
}
