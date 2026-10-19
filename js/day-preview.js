export function canPreviewDays(hostname, environment, isLocalPreview) {
  return isLocalPreview || environment === "staging" && hostname === "daily-undead-staging.pages.dev";
}

export function createDayPreviewStorage(storage, dateKey, enabled) {
  if (!enabled) return storage;
  const prefix = `the-daily-undead:day-preview:${dateKey}:`;
  return {
    get persistent() { return storage.persistent; },
    getItem: (key) => storage.getItem(`${prefix}${key}`),
    setItem: (key, value) => storage.setItem(`${prefix}${key}`, value),
    removeItem: (key) => storage.removeItem(`${prefix}${key}`),
  };
}
