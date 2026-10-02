export function isLocalDevelopmentHostname(hostname) {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
}

export function migrateStoredRoundNumbering(storage, { streakKey, bestRoundKey, versionKey }) {
  try {
    if (storage.getItem(versionKey) === "starts-at-one") return false;

    for (const key of [streakKey, bestRoundKey]) {
      const legacyValue = Number.parseInt(storage.getItem(key), 10);
      if (Number.isInteger(legacyValue) && legacyValue >= 0) {
        storage.setItem(key, String(legacyValue + 1));
      }
    }
    storage.setItem(versionKey, "starts-at-one");
    return true;
  } catch {
    return false;
  }
}

const legacyScoreMigrationVersion = "lifetime-estimate-v1";
// Frozen production totals at the 2 October 2026 progression cutover. Keeping
// the ratio fixed gives legacy browser saves the same basis as account saves.
const launchVerifiedPoints = 13_500;
const launchVerifiedSolves = 161;

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function knownDailyScore(dailyState) {
  if (
    dailyState?.phase !== "result" ||
    dailyState.isCorrect !== true ||
    dailyState.totalRoundsRecorded !== true ||
    dailyState.pointsRecorded !== true
  ) return { score: 0, solves: 0, complete: false };

  const mapPoints = [10, 20, 50].includes(dailyState.mapPoints)
    ? dailyState.mapPoints
    : 0;
  const bonusPoints =
    dailyState.bonusPointsRecorded === true &&
    dailyState.bonusComplete === true &&
    dailyState.bonusPoints === mapPoints
      ? mapPoints
      : 0;
  return {
    score: mapPoints + bonusPoints,
    solves: 1,
    complete: dailyState.bonusPointsRecorded === true,
  };
}

export function migrateLegacyLocalScore(storage, {
  scoreKey,
  legacyPointsKey,
  markerKey,
  currentScore,
  solves,
  dailyState,
}) {
  const unchanged = {
    score: nonNegativeInteger(currentScore),
    migrated: false,
  };

  let legacyPoints;
  try {
    if (storage.getItem(markerKey) === legacyScoreMigrationVersion) return unchanged;
    const storedLegacyPoints = storage.getItem(legacyPointsKey);
    if (storedLegacyPoints == null) return unchanged;
    legacyPoints = nonNegativeInteger(storedLegacyPoints);
  } catch {
    return unchanged;
  }

  const storedSolves = nonNegativeInteger(solves);
  const known = knownDailyScore(dailyState);
  const knownSolves = Math.min(known.solves, storedSolves);
  const legacySolves = storedSolves - knownSolves;
  const launchAverage = launchVerifiedPoints / launchVerifiedSolves;
  const smoothedAverage = known.complete
    ? (known.score + (launchAverage * 5)) / (knownSolves + 5)
    : launchAverage;
  const performanceEstimate =
    known.score + Math.round(legacySolves * smoothedAverage);
  const estimatedScore = Math.round(performanceEstimate / 10) * 10;
  const migratedScore = Math.max(unchanged.score, legacyPoints, estimatedScore);

  let scoreWasSaved = false;
  try {
    storage.setItem(scoreKey, String(migratedScore));
    scoreWasSaved = true;
    storage.setItem(markerKey, legacyScoreMigrationVersion);
  } catch {
    return {
      score: scoreWasSaved ? migratedScore : unchanged.score,
      migrated: scoreWasSaved && migratedScore > unchanged.score,
    };
  }

  return {
    score: migratedScore,
    migrated: migratedScore > unchanged.score,
  };
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

  if (!requiredMissedDates.length || currentRound <= 1) {
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
    currentRound: 1,
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
