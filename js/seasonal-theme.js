const root = document.documentElement;
const environment = document.querySelector('meta[name="daily-undead-environment"]')?.content;
const forceDecember = (environment === "local" || environment === "staging")
  && new URLSearchParams(location.search).get("season") === "december";
let previewDateKey;
let timer;

function updateSeason() {
  clearTimeout(timer);
  const now = new Date();
  const month = now.getUTCMonth();
  const isDecember = previewDateKey ? previewDateKey.slice(5, 7) === "12" : month === 11;
  root.toggleAttribute("data-december", forceDecember || isDecember);
  if (forceDecember || previewDateKey) return;

  const nextMidnight = Date.UTC(now.getUTCFullYear(), month, now.getUTCDate() + 1);
  timer = setTimeout(updateSeason, nextMidnight - now.getTime());
}

export function setSeasonalPreviewDate(dateKey) {
  previewDateKey = dateKey;
  updateSeason();
}

updateSeason();
window.addEventListener("pageshow", updateSeason);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) updateSeason();
});
