const reviveCosts = [100, 250, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000];

function getSafeReviveCount(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

export function calculateReviveCost(revivesUsed) {
  const safeRevivesUsed = getSafeReviveCount(revivesUsed);
  return reviveCosts[Math.min(safeRevivesUsed, reviveCosts.length - 1)];
}

export function incrementReviveCount(revivesUsed) {
  return getSafeReviveCount(revivesUsed) + 1;
}

export function resetReviveCount() {
  return 0;
}

export function isLocalDevelopmentHostname(hostname) {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
}

export function shouldResetReviveCycle({
  missedDayState,
  phase,
  currentRound,
  points,
}) {
  return !missedDayState && phase !== "result" && currentRound === 0 && points === 0;
}

export function getElapsedUtcDays(fromDateKey, toDateKey) {
  if (!fromDateKey || !toDateKey) return 0;

  const fromTime = Date.parse(`${fromDateKey}T00:00:00Z`);
  const toTime = Date.parse(`${toDateKey}T00:00:00Z`);
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) return 0;

  return Math.floor((toTime - fromTime) / 86400000);
}

export function prepareMissedDayProgress({
  savedState,
  lastPlayedDate,
  dateKey,
  currentRound,
  points,
}) {
  const unchanged = {
    currentRound,
    points,
    shouldSaveState: false,
    progressReset: false,
  };

  if (savedState?.dateKey === dateKey) {
    return { ...unchanged, missedDayState: savedState };
  }

  const elapsedDays = getElapsedUtcDays(lastPlayedDate, dateKey);

  if (savedState && !savedState.resolved && elapsedDays > 1) {
    return {
      ...unchanged,
      missedDayState: {
        ...savedState,
        dateKey,
        missedDays: elapsedDays - 1,
      },
      shouldSaveState: true,
    };
  }

  if (elapsedDays <= 1 || (currentRound === 0 && points === 0)) {
    return { ...unchanged, missedDayState: null };
  }

  return {
    missedDayState: {
      dateKey,
      missedDays: elapsedDays - 1,
      roundsBeforeLoss: currentRound,
      pointsBeforeLoss: points,
      revived: false,
      resolved: false,
    },
    currentRound: 0,
    points: 0,
    shouldSaveState: true,
    progressReset: true,
  };
}

export function purchaseMissedDayRevive(missedDayState, reviveCost) {
  if (
    !missedDayState ||
    missedDayState.revived ||
    missedDayState.resolved ||
    !Number.isInteger(reviveCost) ||
    reviveCost <= 0 ||
    missedDayState.pointsBeforeLoss < reviveCost
  ) {
    return null;
  }

  return {
    missedDayState: {
      ...missedDayState,
      revived: true,
      resolved: true,
      reviveCostPaid: reviveCost,
    },
    currentRound: missedDayState.roundsBeforeLoss,
    points: missedDayState.pointsBeforeLoss - reviveCost,
  };
}

export function canUseRequestedPreviewDate(requestedDateKey, currentDateKey, isAuthorized) {
  return requestedDateKey <= currentDateKey || isAuthorized;
}
