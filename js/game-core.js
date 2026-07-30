export function hashString(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function createRng(seed) {
  let value = seed >>> 0;

  return function random() {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(items, random) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

function getThreeStepCombinations(steps) {
  const combinations = [];

  for (let first = 0; first < steps.length - 2; first += 1) {
    for (let second = first + 1; second < steps.length - 1; second += 1) {
      for (let third = second + 1; third < steps.length; third += 1) {
        combinations.push([steps[first], steps[second], steps[third]]);
      }
    }
  }

  return combinations;
}

export function getUtcDateKey(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && getUtcDateKey(date) === value;
}

export function getMillisecondsUntilNextUtcDay(date = new Date()) {
  const nextUtcMidnight = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1,
  );

  return Math.max(0, nextUtcMidnight - date.getTime());
}

function getUtcDayNumber(dateKey) {
  return Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86400000);
}

export function buildDailyPuzzle(dateKey, maps, rotationIndex = 0) {
  if (!isValidDateKey(dateKey) || !Array.isArray(maps)) {
    throw new Error("A valid UTC date and map list are required.");
  }

  const eligibleMaps = maps
    .filter(
      (map) =>
        Array.isArray(map.steps) &&
        map.steps.length >= 3 &&
        isValidDateKey(map.availableFrom) &&
        map.availableFrom <= dateKey,
    )
    .sort((left, right) => left.id.localeCompare(right.id));

  if (eligibleMaps.length === 0) {
    throw new Error("No eligible maps are available for this date.");
  }

  const replayIndex = Math.max(0, Math.floor(rotationIndex));
  const dayNumber = getUtcDayNumber(dateKey);
  const mapCycle = Math.floor(dayNumber / eligibleMaps.length);
  const mapPosition = ((dayNumber % eligibleMaps.length) + eligibleMaps.length) % eligibleMaps.length;
  const mapRandom = createRng(hashString(`${mapCycle}:map-order`));
  const mapOrder = shuffle(eligibleMaps, mapRandom);
  const safeRotationIndex = (mapPosition + replayIndex) % mapOrder.length;
  const map = mapOrder[safeRotationIndex];
  const mapOccurrence = mapCycle + Math.floor((mapPosition + replayIndex) / mapOrder.length);
  const combinationRandom = createRng(hashString(`${map.id}:clue-combinations`));
  const combinations = shuffle(getThreeStepCombinations(map.steps), combinationRandom);
  const combinationIndex =
    ((mapOccurrence % combinations.length) + combinations.length) % combinations.length;
  const selectedSteps = combinations[combinationIndex];
  const chronologicalSteps = [...selectedSteps].sort((left, right) => left.order - right.order);
  const displayRandom = createRng(hashString(`${dateKey}:${map.id}:${replayIndex}:display-order`));
  let displayedSteps = shuffle(selectedSteps, displayRandom);

  const alreadyChronological = displayedSteps.every(
    (step, index) => step.id === chronologicalSteps[index].id,
  );

  if (alreadyChronological) {
    displayedSteps = [displayedSteps[1], displayedSteps[2], displayedSteps[0]];
  }

  return {
    dateKey,
    map,
    displayedSteps,
    chronologicalSteps,
    key: `${dateKey}:${map.id}:${displayedSteps.map((step) => step.id).join(",")}`,
  };
}

export function isCorrectOrder(candidateIds, chronologicalSteps) {
  return (
    candidateIds.length === chronologicalSteps.length &&
    candidateIds.every((id, index) => id === chronologicalSteps[index].id)
  );
}

export function toggleOrderedSelection(selectedIds, id, limit = 3) {
  if (selectedIds.includes(id)) {
    return selectedIds.filter((selectedId) => selectedId !== id);
  }

  if (selectedIds.length >= limit) {
    return [...selectedIds];
  }

  return [...selectedIds, id];
}

export function calculateNextStreak(currentStreak, isCorrect) {
  const safeCurrentStreak =
    Number.isInteger(currentStreak) && currentStreak >= 0 ? currentStreak : 0;

  return isCorrect ? safeCurrentStreak + 1 : 0;
}

export function calculateMapPoints(cluesRevealed) {
  const pointsByClueCount = {
    1: 50,
    2: 20,
    3: 10,
  };

  return pointsByClueCount[cluesRevealed] ?? 0;
}

export function calculateBonusPoints(mapPoints, isCorrectOrder) {
  const safeMapPoints = Number.isInteger(mapPoints) && mapPoints >= 0 ? mapPoints : 0;
  return isCorrectOrder ? safeMapPoints : 0;
}

export function calculateNextPoints(currentPoints, pointsEarned, isCorrect) {
  const safeCurrentPoints =
    Number.isInteger(currentPoints) && currentPoints >= 0 ? currentPoints : 0;
  const safePointsEarned =
    Number.isInteger(pointsEarned) && pointsEarned >= 0 ? pointsEarned : 0;

  return isCorrect ? safeCurrentPoints + safePointsEarned : 0;
}

export function orderMapsForGame(maps, gameId, orderedIds = []) {
  const positions = new Map(orderedIds.map((id, index) => [id, index]));

  return maps
    .filter((map) => map.gameId === gameId)
    .sort((left, right) => {
      const leftPosition = positions.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightPosition = positions.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      return leftPosition - rightPosition || left.title.localeCompare(right.title);
    });
}

export function isAcceptedMapSelection(selectedMapId, answerMapId, equivalents = []) {
  if (selectedMapId === answerMapId) return true;

  const rule = equivalents.find((item) => item.answerMapId === answerMapId);
  return rule?.acceptedMapIds.includes(selectedMapId) ?? false;
}

export function getAnswerDisplayTitle(answerMap, equivalents = []) {
  const rule = equivalents.find((item) => item.answerMapId === answerMap.id);
  return rule?.displayTitle || answerMap.title;
}
