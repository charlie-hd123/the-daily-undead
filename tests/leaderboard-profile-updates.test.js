import test from "node:test";
import assert from "node:assert/strict";
import { initialiseLeaderboards } from "../js/leaderboards.js";

function element() {
  const listeners = new Map();
  const node = {
    children: [], dataset: {}, attributes: {}, className: "", textContent: "",
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, listener) { listeners.set(name, listener); },
    fire(name) { return listeners.get(name)?.({}); },
    querySelectorAll(selector) {
      const descendants = this.children.flatMap(child => [child, ...child.querySelectorAll("*")]);
      return selector === "*" ? descendants : descendants.filter(child => child.classList.contains(selector.slice(1)));
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    showModal() { this.open = true; },
  };
  node.classList = {
    contains(name) { return node.className.split(/\s+/).includes(name); },
    add(name) { node.className = `${node.className} ${name}`.trim(); },
  };
  return node;
}

function fixture(fetchImpl) {
  const button = element();
  const dialog = element();
  const today = element();
  const allTime = element();
  const dailyPanel = element();
  const allTimePanel = element();
  dailyPanel.dataset.leaderboardPanel = "daily";
  allTimePanel.dataset.leaderboardPanel = "all-time";
  dailyPanel.append(today);
  allTimePanel.append(allTime);
  dialog.append(dailyPanel, allTimePanel);
  const tabs = ["daily", "all-time"].map(name => {
    const tab = element(); tab.dataset.leaderboardTab = name; return tab;
  });
  const selectors = new Map([
    ["[data-leaderboard-status]", element()],
    ["[data-leaderboard-player-count]", element()],
    ["[data-leaderboard-your-rank]", element()],
    ["[data-leaderboard-list='daily-elite']", today],
    ["[data-leaderboard-list='all-time']", allTime],
  ]);
  const query = dialog.querySelector.bind(dialog);
  dialog.querySelector = selector => selectors.get(selector) || query(selector);
  const queryAll = dialog.querySelectorAll.bind(dialog);
  dialog.querySelectorAll = selector => selector === "[data-leaderboard-tab]" ? tabs
    : selector === "[data-leaderboard-panel]" ? [dailyPanel, allTimePanel]
    : queryAll(selector);
  const controller = initialiseLeaderboards({ apiUrl: "https://api.example.test", button, dialog,
    getPuzzleDate: () => "2026-11-04", getCurrentUsername: () => "Alpha", fetchImpl,
    documentObject: { createElement: element, createTextNode: text => ({ ...element(), textContent: text }) } });
  return { button, today, allTime, allTimePanel, tabs, controller };
}

const entries = ["Alpha", "Beta"].map(username => ({ username, themeId: "default", avatarId: "richtofen",
  score: 100, solves: 50, bestRound: 10, points: 100, cluesUsed: 1, bonusCorrect: true }));
const response = (values = entries) => new Response(JSON.stringify({
  today: { playersToday: 2, elite: values }, allTime: values,
}));
const text = node => [node.textContent, ...node.children.map(text)].join(" ");
const avatar = node => node.querySelector(".zombie-avatar").dataset.avatar;

test("a saved profile updates both existing leaderboard tiles without changing ranking, metrics or view", async () => {
  const f = fixture(async () => response());
  await f.button.fire("click");
  f.tabs[1].fire("click");
  f.allTimePanel.scrollTop = 120;
  const original = f.allTime.children[0];
  const originalText = text(original);
  f.controller.updateProfile({ username: "Alpha", themeId: "outbreak", avatarId: "misty" });
  for (const list of [f.today, f.allTime]) {
    assert.equal(list.children[0].dataset.theme, "outbreak");
    assert.equal(avatar(list.children[0]), "misty");
    assert.equal(list.children[1].dataset.theme, "default");
    assert.equal(avatar(list.children[1]), "richtofen");
  }
  assert.equal(f.allTime.children[0], original);
  assert.equal(text(original), originalText);
  assert.equal(f.tabs[1].attributes["aria-selected"], "true");
  assert.equal(f.allTimePanel.scrollTop, 120);
});

test("a pre-save response cannot undo the saved theme, while later opens still accept fresh server data", async () => {
  let finishRequest;
  const f = fixture(() => new Promise(resolve => { finishRequest = resolve; }));
  const opening = f.button.fire("click");
  f.controller.updateProfile({ username: "Alpha", themeId: "outbreak", avatarId: "misty" });
  finishRequest(response());
  await opening;
  assert.equal(f.today.children[0].dataset.theme, "outbreak");
  assert.equal(f.allTime.children[0].dataset.theme, "outbreak");
  assert.equal(avatar(f.allTime.children[0]), "misty");
  const reopening = f.button.fire("click");
  finishRequest(response(entries.map(entry => entry.username === "Alpha"
    ? { ...entry, themeId: "afterlife", avatarId: "takeo" } : entry)));
  await reopening;
  assert.equal(f.allTime.children[0].dataset.theme, "afterlife");
  assert.equal(avatar(f.allTime.children[0]), "takeo");
});
