(() => {
  const root = document.documentElement;
  const environment = document.querySelector('meta[name="daily-undead-environment"]')?.content;
  const preview = (environment === "local" || environment === "staging")
    && new URLSearchParams(location.search).get("season") === "december";
  let timer;

  function updateSeason() {
    clearTimeout(timer);
    const now = new Date();
    const month = now.getUTCMonth();
    root.toggleAttribute("data-december", preview || month === 11);
    if (preview) return;

    const nextMidnight = Date.UTC(now.getUTCFullYear(), month, now.getUTCDate() + 1);
    timer = setTimeout(updateSeason, nextMidnight - now.getTime());
  }

  updateSeason();
  window.addEventListener("pageshow", updateSeason);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) updateSeason();
  });
})();
