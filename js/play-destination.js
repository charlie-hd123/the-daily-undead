const key = (date) => `the-daily-undead:play-destination:${date}`;

export function rememberPlayDestination(storage, date, destination) {
  try { storage.setItem(key(date), JSON.stringify(destination)); } catch { /* Navigation still works. */ }
}

export function restorePlayDestination(_storage, date, day) {
  // A refresh opens the official puzzle's saved play or ending page. Extra
  // sessions stay saved for Continue in the hub; old navigation markers lose
  // their priority without clearing any puzzle progress.
  if (day?.dateKey && day.dateKey !== date) return null;
  return ['word', 'easter', 'blood'].includes(day?.officialType)
    ? { type: day.officialType, mode: 'official' }
    : null;
}
