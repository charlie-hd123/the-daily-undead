export function isLocalDevelopmentHostname(hostname) {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
}

export function getElapsedUtcDays(fromDateKey, toDateKey) {
  if (!fromDateKey || !toDateKey) return 0;

  const fromTime = Date.parse(`${fromDateKey}T00:00:00Z`);
  const toTime = Date.parse(`${toDateKey}T00:00:00Z`);
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) return 0;

  return Math.floor((toTime - fromTime) / 86400000);
}

export function getRequiredMissedDates(fromDateKey, toDateKey, protectedDates = []) {
  const elapsedDays = getElapsedUtcDays(fromDateKey, toDateKey);
  if (elapsedDays <= 1) return [];

  const protectedSet = new Set(protectedDates);
  const dates = [];
  const cursor = new Date(`${fromDateKey}T00:00:00Z`);
  for (let offset = 1; offset < elapsedDays; offset += 1) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const dateKey = cursor.toISOString().slice(0, 10);
    if (!protectedSet.has(dateKey)) dates.push(dateKey);
  }
  return dates;
}

export function prepareMissedDayProgress({
  savedState,
  lastPlayedDate,
  dateKey,
  currentRound,
  score,
  protectedDates = [],
}) {
  const unchanged = {
    currentRound,
    score,
    shouldSaveState: false,
    progressReset: false,
  };

  const requiredMissedDates = getRequiredMissedDates(lastPlayedDate, dateKey, protectedDates);
  if (savedState?.dateKey === dateKey) {
    if (!requiredMissedDates.length && !savedState.resolved) {
      return {
        ...unchanged,
        currentRound: Math.max(currentRound, savedState.roundsBeforeLoss || 0),
        missedDayState: null,
        shouldSaveState: true,
        progressReset: true,
      };
    }
    return { ...unchanged, missedDayState: savedState };
  }

  if (!requiredMissedDates.length || currentRound === 0) {
    return { ...unchanged, missedDayState: null };
  }

  return {
    missedDayState: {
      dateKey,
      missedDays: requiredMissedDates.length,
      missedDates: requiredMissedDates,
      roundsBeforeLoss: currentRound,
      resolved: false,
    },
    currentRound: 0,
    score,
    shouldSaveState: true,
    progressReset: true,
  };
}

export function canUseRequestedPreviewDate(requestedDateKey, currentDateKey, isAuthorized) {
  return requestedDateKey <= currentDateKey || isAuthorized;
}

export const progressionUpdateAutoWindowMs = 2 * 24 * 60 * 60 * 1000;
export const progressionUpdateReminderWindowMs = 4 * 24 * 60 * 60 * 1000;

export function getProgressionUpdateVisibility({ launchAt, now, autoShown = false }) {
  if (!Number.isFinite(launchAt) || !Number.isFinite(now)) {
    return { showReminder: false, autoOpen: false };
  }
  const timeSinceLaunch = now - launchAt;
  const showReminder =
    timeSinceLaunch >= 0 && timeSinceLaunch < progressionUpdateReminderWindowMs;
  return {
    showReminder,
    autoOpen:
      showReminder && timeSinceLaunch < progressionUpdateAutoWindowMs && !autoShown,
  };
}
