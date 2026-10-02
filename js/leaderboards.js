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

export function sortAllTimeEntries(entries) {
  return [...entries].sort(
    (left, right) =>
      right.score - left.score ||
      right.solves - left.solves ||
      right.bestRound - left.bestRound ||
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
  avatarId = "unselected",
) {
  const player = documentObject.createElement("span");
  player.className = "leaderboard-player";
  const identity = documentObject.createElement("span");
  identity.className = "leaderboard-player-identity";
  const avatar = documentObject.createElement("span");
  avatar.className = "zombie-avatar zombie-avatar-small";
  avatar.dataset.avatar = avatarId;
  avatar.setAttribute("aria-hidden", "true");
  const name = documentObject.createElement("button");
  name.type = "button";
  name.className = "leaderboard-player-name";
  name.dataset.viewProfile = username;
  name.textContent = username;
  identity.append(avatar, name);
  player.append(identity);

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
    empty.textContent = "No signed-in players have solved today’s map yet.";
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
        entry.avatarId,
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
  currentUsername,
  documentObject,
) {
  list.replaceChildren();
  const sortedEntries = sortAllTimeEntries(entries);
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

    const player = makePlayer(documentObject, entry.username, null, null, null, entry.avatarId);
    const supportingMetrics = documentObject.createElement("dl");
    supportingMetrics.className = "leaderboard-supporting-metrics";
    supportingMetrics.append(
      makeMetric(documentObject, "Puzzle Solves", entry.solves),
      makeMetric(documentObject, "Highest Round", entry.bestRound),
    );
    player.append(supportingMetrics);

    const rankingMetric = documentObject.createElement("dl");
    rankingMetric.className = "leaderboard-primary-metric";
    rankingMetric.append(
      makeMetric(documentObject, "Score", entry.score),
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
  onSelectPlayer = () => {},
}) {
  if (!button || !dialog) return;

  const status = dialog.querySelector("[data-leaderboard-status]");
  const eliteList = dialog.querySelector("[data-leaderboard-list='daily-elite']");
  const playerCount = dialog.querySelector("[data-leaderboard-player-count]");
  const allTimeList = dialog.querySelector("[data-leaderboard-list='all-time']");
  const tabs = [...dialog.querySelectorAll("[data-leaderboard-tab]")];
  const panels = [...dialog.querySelectorAll("[data-leaderboard-panel]")];
  const findButtons = [...dialog.querySelectorAll("[data-leaderboard-find]")];
  const panelToolbars = [...dialog.querySelectorAll(".leaderboard-panel-tools")];
  const yourRank = dialog.querySelector("[data-leaderboard-your-rank]");
  let allTimeEntries = [];
  let currentUsername = null;

  function updateFindButtons() {
    findButtons.forEach((findButton) => {
      const panel = dialog.querySelector(
        `[data-leaderboard-panel='${findButton.dataset.leaderboardFind}']`,
      );
      findButton.hidden = !panel?.querySelector(".is-current-player");
    });
  }

  function updatePanelToolbars() {
    panelToolbars.forEach((toolbar) => {
      toolbar.hidden = ![...toolbar.children].some((child) => !child.hidden);
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

  updatePanelToolbars();

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

  dialog.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-view-profile]");
    if (trigger) onSelectPlayer(trigger.dataset.viewProfile);
  });

  button.addEventListener("click", async () => {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");

    status.textContent = "Loading current scores…";
    status.dataset.state = "loading";
    if (!apiUrl) {
      status.textContent = "Leaderboards are temporarily unavailable.";
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
        currentUsername,
        documentObject,
      );
      const rankedEntries = sortAllTimeEntries(allTimeEntries);
      const ownIndex = rankedEntries.findIndex((entry) => entry.username === currentUsername);
      if (yourRank) {
        yourRank.hidden = ownIndex < 0;
        yourRank.textContent = ownIndex < 0 ? "" : `Your Rank: #${ownIndex + 1}`;
      }
      updateFindButtons();
      updatePanelToolbars();
      status.textContent = "See today’s correct players and the all-time leaders.";
      status.dataset.state = "ready";
    } catch {
      status.textContent = "Leaderboards couldn’t be loaded. Please try again.";
      status.dataset.state = "error";
    }
  });
}
