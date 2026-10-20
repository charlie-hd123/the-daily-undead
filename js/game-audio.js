// Local, optional presentation audio. Failure must never affect play or saves.
export const SOUND_PREFERENCE_KEY = 'the-daily-undead:sound-enabled';
export const SOUND_CUES = {
  "mystery-box-a": {
    "files": [
      "mystery-box-a-73eea105ab.m4a",
      "mystery-box-a-f65373c6d3.wav"
    ],
    "gain": 0.82
  },
  "letter-correct": {
    "files": [
      "letter-correct-9997a6ad45.m4a",
      "letter-correct-71f6ba1071.wav"
    ],
    "gain": 0.56
  },
  "letter-streak-2": {
    "files": [
      "letter-streak-2-6778bd3f67.m4a",
      "letter-streak-2-86996ef9a6.wav"
    ],
    "gain": 0.57
  },
  "letter-streak-3": {
    "files": [
      "letter-streak-3-11ff77d735.m4a",
      "letter-streak-3-22aca68b74.wav"
    ],
    "gain": 0.57
  },
  "letter-streak-4": {
    "files": [
      "letter-streak-4-8d1b5cbd18.m4a",
      "letter-streak-4-30be92596b.wav"
    ],
    "gain": 0.57
  },
  "letter-wrong": {
    "files": [
      "letter-wrong-1934c75474.m4a",
      "letter-wrong-e27aaf210a.wav"
    ],
    "gain": 0.57
  },
  "last-miss-warning": {
    "files": [
      "last-miss-warning-f86cdb31c6.m4a",
      "last-miss-warning-476ec272cd.wav"
    ],
    "gain": 0.54
  },
  "quest-clue-reveal": {
    "files": [
      "quest-clue-reveal-69927ac3d7.m4a",
      "quest-clue-reveal-2854103a2b.wav"
    ],
    "gain": 0.59
  },
  "map-select": {
    "files": [
      "map-select-e3b227f116.m4a",
      "map-select-04723e43e4.wav"
    ],
    "gain": 0.5
  },
  "answer-lock": {
    "files": [
      "answer-lock-6dc008b8f4.m4a",
      "answer-lock-2697dcc555.wav"
    ],
    "gain": 0.66
  },
  "puzzle-solved-a": {
    "files": [
      "puzzle-solved-a-790620ac70.m4a",
      "puzzle-solved-a-7c2b8cd881.wav"
    ],
    "gain": 0.78
  },
  "bonus-step-1": {
    "files": [
      "bonus-step-1-74f7f6214d.m4a",
      "bonus-step-1-90929389a9.wav"
    ],
    "gain": 0.54
  },
  "bonus-step-2": {
    "files": [
      "bonus-step-2-3e28995d55.m4a",
      "bonus-step-2-aae221d901.wav"
    ],
    "gain": 0.54
  },
  "bonus-step-3": {
    "files": [
      "bonus-step-3-0f72da27bb.m4a",
      "bonus-step-3-b26fc82e75.wav"
    ],
    "gain": 0.54
  },
  "double-points-a": {
    "files": [
      "double-points-a-1e9a3df6bb.m4a",
      "double-points-a-1b2f1749f4.wav"
    ],
    "gain": 0.88
  },
  "points-tick": {
    "files": [
      "points-tick-fb36a914c2.m4a",
      "points-tick-b3b5953397.wav"
    ],
    "gain": 0.32
  },
  "points-finish": {
    "files": [
      "points-finish-302ddcd4cf.m4a",
      "points-finish-8640407817.wav"
    ],
    "gain": 0.51
  },
  "highest-round": {
    "files": [
      "highest-round-ce207ba1d7.m4a",
      "highest-round-410d45646f.wav"
    ],
    "gain": 0.76
  },
  "run-ended": {
    "files": [
      "run-ended-27dc8906f0.m4a",
      "run-ended-bbf0f3138d.wav"
    ],
    "gain": 0.72
  }
};

export function letterSound({ correct, solved, streak = 0 }) {
  if (solved) return 'puzzle-solved-a';
  return correct ? streak >= 2 ? `letter-streak-${Math.min(4, streak)}` : 'letter-correct' : 'letter-wrong';
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
  let context, unlocked = false, generation = 0;
  const buffers = new Map(), sources = new Set(), cueGenerations = new Map();
  const supported = typeof AudioContext === 'function' && typeof fetchAudio === 'function';

  function getContext() {
    if (!supported) return null;
    try { context ||= new AudioContext({ latencyHint: 'interactive' }); } catch { return null; }
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
        } catch { /* Decode unsupported AAC as WAV, or continue silently on failure. */ }
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
    try { Promise.resolve(audio.resume()).catch(() => { unlocked = false; }); } catch { unlocked = false; }
    void prepare();
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
    const buffer = await load(cue);
    if (!buffer || epoch !== generation || cueEpoch !== (cueGenerations.get(cue) || 0) || !enabled || isHidden() || context.state !== 'running') return false;
    const late = now() - intendedAt;
    // Never queue feedback to play much later than its actual action on a slow connection.
    if (late > 180 || late / 1000 >= buffer.duration) return false;
    try {
      if (sources.size >= 24) stopSource(sources.values().next().value);
      const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = buffer;
      gain.gain.value = SOUND_CUES[cue].gain * .7;
      source.connect(gain); gain.connect(context.destination);
      const entry = { source, gain, cue };
      sources.add(entry);
      source.onended = () => { sources.delete(entry); source.disconnect(); gain.disconnect(); };
      source.start(context.currentTime + Math.max(0, -late / 1000), Math.max(0, late / 1000));
      return true;
    } catch { return false; }
  }
  function countPoints(duration = 720) {
    stopCue('points-tick'); stopCue('points-finish');
    if (duration > 0) for (let i = 0; i < 7; i++) void play('points-tick', { delay: i * duration / 8 });
    void play('points-finish', { delay: duration });
  }
  function reward(cue, options) {
    for (const other of ['puzzle-solved-a', 'double-points-a', 'highest-round']) stopCue(other);
    return play(cue, options);
  }
  return { supported, get enabled() { return enabled; }, prepare, unlock, play, reward, countPoints, stopCue, stopAll, setEnabled };
}

export function initialiseGameAudio(storage, document = globalThis.document, window = globalThis.window) {
  const audio = createGameAudio({ storage });
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
  for (const event of ['pointerdown', 'keydown']) document.addEventListener(event, (event) => { if (event.isTrusted) audio.unlock(); }, { capture: true, passive: true });
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
  // Decode while suspended so the first genuine box tap already has its latch ready.
  void audio.prepare();
  return audio;
}
