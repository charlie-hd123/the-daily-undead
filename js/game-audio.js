// Local, optional presentation audio. Failure must never affect play or saves.
export const SOUND_PREFERENCE_KEY = 'the-daily-undead:sound-enabled';
export const SOUND_CUES = {
  "mystery-box-a": {
    "files": [
      "mystery-box-a-f45d738cd5.wav",
      "mystery-box-a-e03d5ba5af.m4a"
    ],
    "gain": 0.86
  },
  "letter-correct": {
    "files": [
      "letter-correct-f1039ca387.wav",
      "letter-correct-531e622746.m4a"
    ],
    "gain": 0.8
  },
  "letter-streak-2": {
    "files": [
      "letter-streak-2-2560dc380d.wav",
      "letter-streak-2-6ed93ee869.m4a"
    ],
    "gain": 0.8
  },
  "letter-streak-3": {
    "files": [
      "letter-streak-3-535a030e0d.wav",
      "letter-streak-3-d51fc142e5.m4a"
    ],
    "gain": 0.8
  },
  "letter-streak-4": {
    "files": [
      "letter-streak-4-85a5275467.wav",
      "letter-streak-4-54a031aeeb.m4a"
    ],
    "gain": 0.8
  },
  "letter-wrong": {
    "files": [
      "letter-wrong-4e3d88f213.wav",
      "letter-wrong-dfd4364d52.m4a"
    ],
    "gain": 0.83
  },
  "quest-clue-reveal": {
    "files": [
      "quest-clue-reveal-0f65106f58.wav",
      "quest-clue-reveal-29bcb335dd.m4a"
    ],
    "gain": 0.8
  },
  "map-select": {
    "files": [
      "map-select-80c02bff55.wav",
      "map-select-5642da90e3.m4a"
    ],
    "gain": 0.78
  },
  "answer-lock": {
    "files": [
      "answer-lock-1aff394e01.wav",
      "answer-lock-3db4981896.m4a"
    ],
    "gain": 0.8
  },
  "puzzle-solved-a": {
    "files": [
      "puzzle-solved-a-fd5b93632a.wav",
      "puzzle-solved-a-b3075927a0.m4a"
    ],
    "gain": 0.96
  },
  "bonus-step-1": {
    "files": [
      "bonus-step-1-30b7ada146.wav",
      "bonus-step-1-ddef9d1d7e.m4a"
    ],
    "gain": 0.8
  },
  "bonus-step-2": {
    "files": [
      "bonus-step-2-8e93d9e974.wav",
      "bonus-step-2-1bf0c08ef0.m4a"
    ],
    "gain": 0.8
  },
  "bonus-step-3": {
    "files": [
      "bonus-step-3-de776e1933.wav",
      "bonus-step-3-182cfe85a5.m4a"
    ],
    "gain": 0.8
  },
  "double-points-a": {
    "files": [
      "double-points-a-750be695ce.wav",
      "double-points-a-cba765026d.m4a"
    ],
    "gain": 1.0
  },
  "points-tick": {
    "files": [
      "points-tick-93b6bdcdb4.wav",
      "points-tick-ac4cb1680d.m4a"
    ],
    "gain": 0.88
  },
  "points-finish": {
    "files": [
      "points-finish-b3c9d11bdf.wav",
      "points-finish-328bc199b5.m4a"
    ],
    "gain": 0.9
  },
  "run-ended": {
    "files": [
      "run-ended-fc45b8974f.wav",
      "run-ended-4cbf95aa7d.m4a"
    ],
    "gain": 0.93
  }
};

export function letterSound({ correct, solved, streak = 0 }) {
  if (solved) return 'puzzle-solved-a';
  return correct ? streak >= 2 ? `letter-streak-${Math.min(4, streak)}` : 'letter-correct' : 'letter-wrong';
}

// Only puzzle navigation opts into the low click. Dedicated puzzle handlers
// supply their own cues; account, sharing and surrounding site controls stay quiet.
export function buttonSound(button) {
  if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return null;
  return button.matches('[data-card-action], [data-see-result], [data-game-id], [data-map-id], #lock-answer, #back-to-clues, #back-to-games, #return-to-puzzle-home, #continue-after-missed-day, #blood-shuffle, #blood-clear') ? 'map-select' : null;
}

export function createGameAudio({
  storage,
  AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext,
  fetchAudio = globalThis.fetch?.bind(globalThis),
  now = () => performance.now(),
  isHidden = () => globalThis.document?.hidden,
} = {}) {
  let enabled = true;
  try { enabled = storage?.getItem(SOUND_PREFERENCE_KEY) !== 'false'; } catch { /* session-only preference */ }
  let context, output, unlocked = false, generation = 0;
  let resumeReady = Promise.resolve(false);
  const buffers = new Map(), sources = new Set(), cueGenerations = new Map();
  const supported = typeof AudioContext === 'function' && typeof fetchAudio === 'function';

  function getContext() {
    if (!supported) return null;
    try {
      if (!context) {
        context = new AudioContext({ latencyHint: 'interactive' });
        output = context.destination;
        // Leave normal cues untouched; catch peaks when reward/count/clicks overlap.
        if (typeof context.createDynamicsCompressor === 'function') {
          const limiter = context.createDynamicsCompressor();
          limiter.threshold.value = -3;
          limiter.knee.value = 0;
          limiter.ratio.value = 20;
          limiter.attack.value = .001;
          limiter.release.value = .08;
          limiter.connect(context.destination);
          output = limiter;
        }
      }
    } catch { return null; }
    return context;
  }
  function load(cue) {
    if (buffers.has(cue)) return buffers.get(cue);
    const loading = (async () => {
      const audio = getContext();
      if (!audio) return null;
      for (const filename of SOUND_CUES[cue].files) {
        try {
          const response = await fetchAudio(new URL(`../assets/audio/${filename}`, import.meta.url));
          if (!response.ok) continue;
          return await audio.decodeAudioData(await response.arrayBuffer());
        } catch { /* Try the alternate format, or continue silently on failure. */ }
      }
      return null;
    })();
    buffers.set(cue, loading);
    return loading;
  }
  function prepare() {
    if (!enabled || !supported) return Promise.resolve([]);
    return Promise.all(Object.keys(SOUND_CUES).map(load));
  }
  function unlock() {
    if (!enabled || !supported || isHidden()) return;
    const audio = getContext();
    if (!audio) return;
    unlocked = true;
    // Call resume inside the trusted pointer/key event, before any awaits.
    try {
      resumeReady = Promise.resolve(audio.state === 'running' ? undefined : audio.resume())
        .then(() => audio.state === 'running', () => false);
    } catch { resumeReady = Promise.resolve(false); }
    void prepare();
  }
  async function ready(cue) {
    if (!SOUND_CUES[cue] || !enabled || !unlocked || isHidden()) return false;
    const [buffer, running] = await Promise.all([load(cue), resumeReady]);
    return Boolean(buffer && running && enabled && !isHidden() && context.state === 'running');
  }
  function stopSource(entry) {
    try {
      const at = context.currentTime;
      entry.gain.gain.cancelScheduledValues(at);
      entry.gain.gain.setValueAtTime(entry.gain.gain.value, at);
      entry.gain.gain.linearRampToValueAtTime(0, at + .012);
      entry.source.stop(at + .015);
    } catch { /* already ended */ }
    sources.delete(entry);
  }
  function stopCue(cue) {
    cueGenerations.set(cue, (cueGenerations.get(cue) || 0) + 1);
    for (const entry of sources) if (entry.cue === cue) stopSource(entry);
  }
  function stopAll() {
    generation++;
    for (const entry of sources) stopSource(entry);
  }
  function setEnabled(value, { persist = true } = {}) {
    enabled = Boolean(value);
    if (!enabled) stopAll();
    if (persist) try { storage?.setItem(SOUND_PREFERENCE_KEY, String(enabled)); } catch { /* session-only */ }
    if (enabled) unlock();
  }
  async function play(cue, { delay = 0 } = {}) {
    if (!SOUND_CUES[cue] || !enabled || !unlocked || isHidden()) return false;
    const epoch = generation, cueEpoch = cueGenerations.get(cue) || 0;
    const intendedAt = now() + delay;
    const [buffer, running] = await Promise.all([load(cue), resumeReady]);
    if (!buffer || !running || epoch !== generation || cueEpoch !== (cueGenerations.get(cue) || 0) || !enabled || isHidden() || context.state !== 'running') return false;
    const late = now() - intendedAt;
    // Never queue feedback to play much later than its actual action on a slow connection.
    if (late > 180 || late / 1000 >= buffer.duration) return false;
    try {
      if (sources.size >= 24) stopSource(sources.values().next().value);
      const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = buffer;
      gain.gain.value = SOUND_CUES[cue].gain;
      source.connect(gain); gain.connect(output);
      const entry = { source, gain, cue };
      sources.add(entry);
      source.onended = () => { sources.delete(entry); source.disconnect(); gain.disconnect(); };
      source.start(context.currentTime + Math.max(0, -late / 1000), Math.max(0, late / 1000));
      return true;
    } catch { return false; }
  }
  function countPoints(duration = 720, { delay = 0, reward: rewardCue } = {}) {
    stopCue('points-tick'); stopCue('points-finish');
    if (duration > 0) for (let i = 0; i < 7; i++) void play('points-tick', { delay: delay + i * duration / 8 });
    void play('points-finish', { delay: delay + duration });
    // Let the 430ms finishing ping settle before the reward flourish begins.
    // A future flourish must not cancel the solve sting playing right now.
    if (rewardCue) {
      stopCue(rewardCue);
      void play(rewardCue, { delay: delay + duration + 500 });
    }
  }
  function reward(cue, options) {
    for (const other of ['puzzle-solved-a', 'double-points-a']) stopCue(other);
    return play(cue, options);
  }
  return { supported, get enabled() { return enabled; }, prepare, ready, unlock, play, reward, countPoints, stopCue, stopAll, setEnabled };
}

export function initialiseGameAudio(storage, document = globalThis.document, window = globalThis.window, platform = {}) {
  const audio = createGameAudio({ ...platform, storage });
  const button = document.querySelector('#sound-toggle');
  const update = () => {
    if (!button) return;
    button.hidden = !audio.supported;
    button.setAttribute('aria-pressed', String(audio.enabled));
    button.setAttribute('aria-label', audio.enabled ? 'Sound on. Mute sound effects' : 'Sound off. Enable sound effects');
    button.title = audio.enabled ? 'Mute sound effects' : 'Enable sound effects';
    button.querySelector('span').textContent = audio.enabled ? 'Sound on' : 'Sound off';
  };
  button?.addEventListener('click', () => { audio.setEnabled(!audio.enabled); update(); });
  // Touch browsers may grant activation only at touchend/click, not pointerdown.
  // Capture click before the box/button handler requests its very first cue.
  for (const event of ['pointerdown', 'touchend', 'click', 'keydown']) document.addEventListener(event, (event) => {
    if (!event.isTrusted) return;
    audio.unlock();
    if (event.type !== 'click') return;
    const cue = buttonSound(event.target?.closest?.('button, [role="button"], [role="tab"]'));
    // Puzzle navigation cancels the previous screen's audio synchronously.
    // Start the new click afterwards so that cleanup doesn't swallow it.
    if (cue) queueMicrotask(() => { void audio.play(cue); });
  }, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) audio.stopAll(); });
  window.addEventListener('pagehide', () => audio.stopAll());
  window.addEventListener('storage', (event) => {
    if (event.key === SOUND_PREFERENCE_KEY || event.key === null) {
      let value = true;
      try { value = storage?.getItem(SOUND_PREFERENCE_KEY) !== 'false'; } catch { /* session-only */ }
      audio.setEnabled(value, { persist: false }); update();
    }
  });
  update();
  // Decode while suspended so the first genuine box tap already has its jingle ready.
  void audio.prepare();
  return audio;
}
