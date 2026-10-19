const storagePrefix = 'the-daily-undead:mystery-box-opened:';

// A presentation receipt only; gameplay and account progress are never changed.
export function createDailyBoxHistory(storage) {
  const opened = new Set();
  return {
    canOpen({ dateKey, official, fresh }) {
      if (!official || !fresh || !dateKey || opened.has(dateKey) || storage?.persistent === false) return false;
      try { return storage.getItem(`${storagePrefix}${dateKey}`) !== '1'; }
      catch { return false; }
    },
    markOpened(dateKey) {
      opened.add(dateKey);
      try {
        storage.setItem(`${storagePrefix}${dateKey}`, '1');
        return storage.persistent !== false && storage.getItem(`${storagePrefix}${dateKey}`) === '1';
      } catch { return false; }
    },
  };
}
