// Local, optional presentation audio. Failure must never affect play or saves.
export const SOUND_PREFERENCE_KEY = 'the-daily-undead:sound-enabled';
export const SOUND_CUES = {
  "mystery-box-a": {
    "files": [
      "mystery-box-a-d84479db4b.wav",
      "mystery-box-a-78fc03ec37.m4a"
    ],
    "gain": 0.86
  },
  "letter-correct": {
    "files": [
      "letter-correct-19fdeea99f.wav",
      "letter-correct-d57b1e87d4.m4a"
    ],
    "gain": 0.8
  },
  "letter-streak-2": {
    "files": [
      "letter-streak-2-827025c99f.wav",
      "letter-streak-2-1f21154242.m4a"
    ],
    "gain": 0.8
  },
  "letter-streak-3": {
    "files": [
      "letter-streak-3-e83498e014.wav",
      "letter-streak-3-7d55815666.m4a"
    ],
    "gain": 0.8
  },
  "letter-streak-4": {
    "files": [
      "letter-streak-4-7d5006da14.wav",
      "letter-streak-4-9ef455cc56.m4a"
    ],
    "gain": 0.8
  },
  "letter-wrong": {
    "files": [
      "letter-wrong-83dee964da.wav",
      "letter-wrong-2ddee7c899.m4a"
    ],
    "gain": 0.83
  },
  "quest-clue-reveal": {
    "files": [
      "quest-clue-reveal-7f98745761.wav",
      "quest-clue-reveal-4b5ee4d55c.m4a"
    ],
    "gain": 0.8
  },
  "map-select": {
    "files": [
      "map-select-ed526ca1bc.wav",
      "map-select-aa4c70ee42.m4a"
    ],
    "gain": 0.78
  },
  "answer-lock": {
    "files": [
      "answer-lock-8c89979dc5.wav",
      "answer-lock-4e84ac3354.m4a"
    ],
    "gain": 0.8
  },
  "puzzle-solved-a": {
    "files": [
      "puzzle-solved-a-02cac0d6cd.wav",
      "puzzle-solved-a-8776b7939b.m4a"
    ],
    "gain": 0.96
  },
  "bonus-step-1": {
    "files": [
      "bonus-step-1-028f3c51b1.wav",
      "bonus-step-1-851e543788.m4a"
    ],
    "gain": 0.8
  },
  "bonus-step-2": {
    "files": [
      "bonus-step-2-9bf4607021.wav",
      "bonus-step-2-f7f72af383.m4a"
    ],
    "gain": 0.8
  },
  "bonus-step-3": {
    "files": [
      "bonus-step-3-00ac7098f1.wav",
      "bonus-step-3-8abe5f9abb.m4a"
    ],
    "gain": 0.8
  },
  "double-points-a": {
    "files": [
      "double-points-a-5a90318aa7.wav",
      "double-points-a-2873664362.m4a"
    ],
    "gain": 1.0
  },
  "points-tick": {
    "files": [
      "points-tick-978fd27506.wav",
      "points-tick-ea7acf22fe.m4a"
    ],
    "gain": 0.88
  },
  "points-finish": {
    "files": [
      "points-finish-6b552b26b6.wav",
      "points-finish-e27ca46a01.m4a"
    ],
    "gain": 0.9,
    "duration": 0.66
  },
  "run-ended": {
    "files": [
      "run-ended-a7e5b00d23.wav",
      "run-ended-af85216adc.m4a"
    ],
    "gain": 0.93
  }
};

export function letterSound({ correct, solved, streak = 0 }) {
  if (solved) return 'puzzle-solved-a';
  return correct ? streak >= 2 ? `letter-streak-${Math.min(4, streak)}` : 'letter-correct' : 'letter-wrong';
}

export function bloodConnectionSound({ correct, complete }) {
  return correct ? 'answer-lock' : complete ? 'run-ended' : 'letter-wrong';
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
  loadTimeoutMs = 6000,
  retryDelayMs = 1000,
} = {}) {
  let enabled = true;
  try { enabled = storage?.getItem(SOUND_PREFERENCE_KEY) !== 'false'; } catch { /* session-only preference */ }
  let context, output, unlocked = false, generation = 0;
  let resumeReady = Promise.resolve(false);
  let preparing, prepared, preloadGeneration = 0;
  const preloadOrder = [...new Set(['mystery-box-a', 'map-select', 'letter-correct', 'letter-wrong', 'quest-clue-reveal', ...Object.keys(SOUND_CUES)])];
  const buffers = new Map(), decoded = new Map(), retryAfter = new Map(), sources = new Set(), cueGenerations = new Map();
  const supported = typeof AudioContext === 'function' && typeof fetchAudio === 'function';

  function getContext() {
    if (!supported) return null;
    try {
      if (context?.state === 'closed') {
        // Decoded AudioBuffers can be reused by the replacement context.
        stopAll(); buffers.clear(); retryAfter.clear();
        preloadGeneration++; preparing = null;
        context = null; unlocked = false; resumeReady = Promise.resolve(false);
      }
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
  async function loadFile(audio, filename) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timer;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetchAudio(new URL(`../assets/audio/${filename}`, import.meta.url), { signal: controller?.signal });
          if (!response.ok) throw new Error('Audio unavailable');
          return await audio.decodeAudioData(await response.arrayBuffer());
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(() => { controller?.abort(); reject(new Error('Audio load timed out')); }, loadTimeoutMs);
        }),
      ]);
    } finally { clearTimeout(timer); }
  }
  function load(cue) {
    const audio = getContext();
    if (!audio) return Promise.resolve(null);
    if (decoded.has(cue)) return Promise.resolve(decoded.get(cue));
    if (buffers.has(cue)) return buffers.get(cue);
    if (now() < (retryAfter.get(cue) || 0)) return Promise.resolve(null);
    const loading = (async () => {
      // Much smaller transfers, with the full-quality WAV retained as fallback.
      const files = [...SOUND_CUES[cue].files].sort((a, b) => Number(b.endsWith('.m4a')) - Number(a.endsWith('.m4a')));
      for (const filename of files) {
        try {
          const buffer = await loadFile(audio, filename);
          if (audio !== context || audio.state === 'closed') return null;
          decoded.set(cue, buffer); retryAfter.delete(cue);
          return buffer;
        } catch { /* Try the alternate format, or continue silently on failure. */ }
      }
      if (audio === context) retryAfter.set(cue, now() + retryDelayMs);
      return null;
    })().finally(() => { if (buffers.get(cue) === loading) buffers.delete(cue); });
    buffers.set(cue, loading);
    return loading;
  }
  function prepare() {
    if (!enabled || !supported) return Promise.resolve([]);
    if (!getContext()) return Promise.resolve([]);
    if (decoded.size === preloadOrder.length) return prepared ||= Promise.resolve(preloadOrder.map(cue => decoded.get(cue)));
    if (preparing) return preparing;
    const pending = preloadOrder.filter(cue => !decoded.has(cue) && now() >= (retryAfter.get(cue) || 0));
    if (!pending.length) return Promise.resolve(preloadOrder.map(cue => decoded.get(cue) || null));
    const epoch = preloadGeneration;
    let next = 0;
    const worker = async () => {
      while (enabled && epoch === preloadGeneration && next < pending.length) await load(pending[next++]);
    };
    // Keep background fetch/decode work from arriving in one large burst on a
    // phone. ready()/play() load an urgently needed cue directly, without waiting
    // for a background slot. All requests for the same cue still coalesce.
    const batch = Promise.all(Array.from({ length: Math.min(4, pending.length) }, worker))
      .then(() => preloadOrder.map(cue => decoded.get(cue) || null))
      .finally(() => { if (preparing === batch) preparing = null; });
    preparing = batch;
    return batch;
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
  function recover({ online = false } = {}) {
    if (!enabled || !supported || isHidden()) return;
    if (online) retryAfter.clear();
    if (unlocked) unlock(); else void prepare();
  }
  function start(cue, buffer, intendedAt, delay) {
    const late = now() - intendedAt;
    // Drop stale network-loaded cues, especially old ticks, instead of bunching
    // them up. Every accepted cue starts at its attack, never partway through it.
    if (late > (delay > 0 ? 50 : 180)) return false;
    try {
      if (sources.size >= 24) stopSource(sources.values().next().value);
      const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = buffer;
      gain.gain.value = SOUND_CUES[cue].gain;
      source.connect(gain); gain.connect(output);
      const entry = { source, gain, cue };
      sources.add(entry);
      source.onended = () => { sources.delete(entry); source.disconnect(); gain.disconnect(); };
      source.start(context.currentTime + Math.max(0, -late / 1000), 0);
      return true;
    } catch { return false; }
  }
  async function play(cue, { delay = 0 } = {}) {
    if (!SOUND_CUES[cue] || !enabled || !unlocked || isHidden()) return false;
    const epoch = generation, cueEpoch = cueGenerations.get(cue) || 0;
    const intendedAt = now() + delay;
    // Schedule warmed feedback before a synchronous puzzle render can block the
    // main thread. Even an already-resolved await used to delay or discard it.
    if (decoded.has(cue) && context?.state === 'running') return start(cue, decoded.get(cue), intendedAt, delay);
    const [buffer, running] = await Promise.all([load(cue), resumeReady]);
    if (!buffer || !running || epoch !== generation || cueEpoch !== (cueGenerations.get(cue) || 0) || !enabled || isHidden() || context.state !== 'running') return false;
    return start(cue, buffer, intendedAt, delay);
  }
  function countPoints(duration = 720, { delay = 0, reward: rewardCue } = {}) {
    stopCue('points-tick'); stopCue('points-finish');
    if (duration > 0) for (let i = 0; i < 7; i++) void play('points-tick', { delay: delay + i * duration / 8 });
    void play('points-finish', { delay: delay + duration });
    // Let the current finishing ping settle before the reward flourish begins.
    // A future flourish must not cancel the solve sting playing right now.
    if (rewardCue) {
      stopCue(rewardCue);
      const finishWait = Math.max(500, Math.ceil(SOUND_CUES['points-finish'].duration * 1000) + 70);
      void play(rewardCue, { delay: delay + duration + finishWait });
    }
  }
  function reward(cue, options) {
    for (const other of ['puzzle-solved-a', 'double-points-a']) stopCue(other);
    return play(cue, options);
  }
  return { supported, get enabled() { return enabled; }, prepare, ready, unlock, play, reward, countPoints, stopCue, stopAll, setEnabled, recover };
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
  document.addEventListener('visibilitychange', () => { if (document.hidden) audio.stopAll(); else audio.recover(); });
  window.addEventListener('pagehide', () => audio.stopAll());
  window.addEventListener('pageshow', () => audio.recover());
  window.addEventListener('online', () => audio.recover({ online: true }));
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
