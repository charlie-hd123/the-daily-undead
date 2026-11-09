export function canPreviewDays(hostname, environment, isLocalPreview) {
  return isLocalPreview || environment === "staging" && hostname === "daily-undead-staging.pages.dev";
}

export function createDayPreviewStorage(storage, dateKey, enabled, run = '', progressKeys = new Set()) {
  if (!enabled) return storage;
  const safeRun = /^[a-zA-Z0-9-]{1,80}$/.test(run) ? `${run}:` : '';
  const dayPrefix = `the-daily-undead:day-preview:${dateKey}:${safeRun}`;
  const runPrefix = `the-daily-undead:day-preview:progress:${safeRun}`;
  const storageKey = (key) => `${safeRun && progressKeys.has(key) ? runPrefix : dayPrefix}${key}`;
  return {
    get persistent() { return storage.persistent; },
    getItem: (key) => storage.getItem(storageKey(key)),
    setItem: (key, value) => storage.setItem(storageKey(key), value),
    removeItem: (key) => storage.removeItem(storageKey(key)),
  };
}
