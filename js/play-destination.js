// Cached app bundles may still import these names during a release.
// The official puzzle is selected from day state, so the old marker needs no write.
export function rememberPlayDestination() {}

export function restorePlayDestination(_storage, date, day) {
  // A refresh opens the official puzzle's saved play or ending page. Extra
  // sessions stay saved for Continue in the hub; old navigation markers lose
  // their priority without clearing any puzzle progress.
  if (day?.dateKey && day.dateKey !== date) return null;
  return ['word', 'easter', 'blood'].includes(day?.officialType)
    ? { type: day.officialType, mode: 'official' }
    : null;
}
