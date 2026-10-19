// Runs before the body paints, and is also imported by the application modules.
(() => {
  if (globalThis.dailyUndeadEntry) return;
  const memory = new Map();
  let backing = null;
  let persistent = false;
  const canAnimate = typeof globalThis.WebGL2RenderingContext === 'function'
    && typeof globalThis.ResizeObserver === 'function'
    && typeof globalThis.document?.fonts?.load === 'function'
    && typeof globalThis.document?.fonts?.check === 'function'
    && Boolean(globalThis.HTMLElement && 'inert' in globalThis.HTMLElement.prototype);
  const unavailable = () => {
    persistent = false;
    globalThis.document?.documentElement?.setAttribute('data-player-storage', 'memory');
  };
  try {
    backing = globalThis.localStorage;
    const probe = `the-daily-undead:storage-probe:${Math.random().toString(36).slice(2)}`;
    try {
      backing.setItem(probe, '1');
      persistent = backing.getItem(probe) === '1';
    } finally { backing.removeItem(probe); }
  } catch { unavailable(); }
  const storage = {
    get persistent() { return persistent; },
    getItem(key) {
      if (memory.has(key)) return memory.get(key);
      try { return backing?.getItem(key) ?? null; }
      catch { unavailable(); return null; }
    },
    setItem(key, value) {
      value = String(value);
      if (!persistent) { memory.set(key, value); return; }
      try {
        if (!backing) throw new Error('Storage unavailable');
        backing.setItem(key, value);
        if (backing.getItem(key) !== value) throw new Error('Storage write was not retained');
        memory.delete(key);
      } catch { unavailable(); memory.set(key, value); }
    },
    removeItem(key) {
      try {
        if (!backing) throw new Error('Storage unavailable');
        backing.removeItem(key);
        if (persistent) memory.delete(key); else memory.set(key, null);
      } catch { unavailable(); memory.set(key, null); }
    },
    key(index) { return this.keys()[index] ?? null; },
    get length() { return this.keys().length; },
    keys() {
      const keys = new Set(memory.keys());
      try { for (let i = 0; i < backing.length; i++) keys.add(backing.key(i)); }
      catch { unavailable(); }
      return [...keys].filter((key) => key !== null && this.getItem(key) !== null);
    },
  };
  let mode = 'direct';
  try {
    const today = new Date().toISOString().slice(0, 10);
    const params = new URLSearchParams(globalThis.location?.search || '');
    const requested = params.get('date');
    const host = globalThis.location?.hostname || '';
    const previewHost = host === 'daily-undead-staging.pages.dev'
      || /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?)$/.test(host)
      || host.endsWith('.local') || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
    let authorized = false;
    try {
      const auth = JSON.parse(globalThis.sessionStorage.getItem('the-daily-undead:dev-preview'));
      authorized = previewHost && auth?.dateKey === requested && auth?.token === params.get('devPreview');
    } catch { /* No authorized future preview. */ }
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(requested || '')
      && new Date(`${requested}T00:00:00Z`).toISOString().slice(0, 10) === requested;
    const date = validDate && (requested <= today || authorized) ? requested : today;
    const prefix = previewHost && date !== today ? `the-daily-undead:day-preview:${date}:` : '';
    const opened = storage.getItem(`${prefix}the-daily-undead:mystery-box-opened:${date}`) === '1';
    let started = false;
    try {
      const day = JSON.parse(storage.getItem(`${prefix}the-daily-undead:multi-puzzle-day:${date}`));
      if (day?.dateKey === date && day.dayStateVersion === 1) {
        const session = day.sessions?.[day.officialType];
        started = Boolean(day.officialCompleted || session?.complete || session?.pendingResult
          || session?.guesses?.length || session?.cluesRevealed > 1
          || session?.selectedGameId || session?.selectedMapId
          || session?.phase && session.phase !== 'clues');
      }
    } catch { /* Corrupt progress is handled by the application's normal recovery. */ }
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // A remembered account may have newer cloud progress than this device.
    // Wait quietly for normal account loading rather than flash a speculative box.
    const knownAccount = Boolean(storage.getItem('the-daily-undead:account-memory'));
    const review = /^(localhost|127\.0\.0\.1)$/.test(host) && params.has('boxReview');
    mode = review || persistent && !opened && !started && !reduced && !knownAccount && canAnimate ? 'box' : 'direct';
  } catch { /* A safe direct entry if storage or date information is unavailable. */ }
  globalThis.dailyUndeadEntry = Object.freeze({ storage, mode, canAnimate });
  globalThis.document?.documentElement?.setAttribute('data-player-storage', persistent ? 'persistent' : 'memory');
  globalThis.document?.documentElement?.setAttribute('data-player-entry', mode);
})();
