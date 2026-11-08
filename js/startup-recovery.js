const recoveryKey = "the-daily-undead:startup-recovery";

export function recoverFailedStartup(windowObject = window) {
  const { document, location, navigator } = windowObject;
  if (location.protocol !== "https:" && location.protocol !== "http:") return false;

  let storage;
  try {
    storage = windowObject.sessionStorage;
    if (storage.getItem(recoveryKey) !== null) return false;
  } catch {
    // Only reload if the next page can tell a recovery was already attempted.
    return false;
  }

  function recoverWhenReady() {
    if (document.visibilityState !== "visible" || !navigator.onLine) return false;

    document.removeEventListener("visibilitychange", recoverWhenReady);
    windowObject.removeEventListener("online", recoverWhenReady);
    try {
      storage.setItem(recoveryKey, "1");
      location.reload();
      return true;
    } catch {
      return false;
    }
  }

  if (document.visibilityState === "visible" && navigator.onLine) return recoverWhenReady();

  document.addEventListener("visibilitychange", recoverWhenReady);
  windowObject.addEventListener("online", recoverWhenReady);
  return false;
}

export function clearStartupRecovery(windowObject = window) {
  try {
    windowObject.sessionStorage.removeItem(recoveryKey);
  } catch {
    // Storage restrictions should not interrupt a working game.
  }
}
