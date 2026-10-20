import { isPuzzleSessionComplete } from './daily-challenge-core.js?v=20261020-2';

const key = (date) => `the-daily-undead:play-destination:${date}`;

export function rememberPlayDestination(storage, date, destination) {
  try { storage.setItem(key(date), JSON.stringify(destination)); } catch { /* Navigation still works. */ }
}

export function restorePlayDestination(storage, date, day) {
  try {
    const value = JSON.parse(storage.getItem(key(date)));
    // Existing saves predate the navigation marker. Recover genuine unfinished
    // fun progress, but never mistake the legacy empty Easter session for play.
    if (!value && day.officialCompleted) {
      const type = day.officialType === 'word' ? 'easter' : 'word';
      const session = day.sessions?.[type];
      const progressed = type === 'word'
        ? session?.guesses?.length > 0 || Boolean(session?.pendingResult)
        : session?.cluesRevealed > 1 || Boolean(session?.selectedGameId || session?.selectedMapId)
          || Boolean(session?.phase && session.phase !== 'clues');
      if (progressed && !isPuzzleSessionComplete(type, session)) return { type, mode: 'for_fun' };
    }
    if (value?.screen === 'hub' && day.officialCompleted) return { screen: 'hub' };
    if (!['word', 'easter'].includes(value?.type)) return null;
    const official = value.type === day.officialType;
    if (value.mode === 'official' && official) return { type: value.type, mode: 'official' };
    if (value.mode === 'for_fun' && !official && day.officialCompleted && day.sessions?.[value.type]) {
      return { type: value.type, mode: 'for_fun' };
    }
  } catch { /* Missing or corrupt destination returns to the official puzzle. */ }
  return null;
}
