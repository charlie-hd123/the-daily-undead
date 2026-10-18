// A presentation layer only: opening the box never submits or changes a puzzle.
export function createMysteryBox() {
  let dialog;
  let timers = [];
  let audio;
  let soundEnabled = false;
  let latest;
  let previousFocus;
  const seen = new Set();
  const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const later = (callback, delay) => timers.push(window.setTimeout(callback, delay));

  function stop() {
    timers.forEach(window.clearTimeout);
    timers = [];
    if (audio) void audio.close().catch(() => {});
    audio = null;
  }

  function tone(frequency, start, duration, volume, type = "sine", endFrequency = frequency) {
    if (!audio || !soundEnabled) return;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, audio.currentTime + start);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, audio.currentTime + start + duration);
    gain.gain.setValueAtTime(0, audio.currentTime + start);
    gain.gain.linearRampToValueAtTime(volume, audio.currentTime + start + .035);
    gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + start + duration);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(audio.currentTime + start);
    oscillator.stop(audio.currentTime + start + duration + .02);
  }

  async function startSound() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    try {
      audio ||= new AudioContext();
      await audio.resume();
      if (!dialog.open || !soundEnabled) return;
      tone(55, 0, 2.8, .09, "triangle", 82);
      tone(110, .1, 2.6, .035, "sine", 165);
      [330, 392, 466, 554, 659, 784].forEach((note, index) => tone(note, index * .17, .8, .025));
    } catch { /* The reveal remains usable when audio is unavailable. */ }
  }

  function markSeen() {
    seen.add(latest.key);
    try { window.sessionStorage.setItem(`daily-undead:box:${latest.key}`, "1"); } catch { /* Optional cosmetic preference. */ }
  }

  function finish() {
    stop();
    if (!dialog?.open) return;
    markSeen();
    dialog.close();
    document.documentElement.classList.remove("mystery-box-active");
    const target = previousFocus?.isConnected && previousFocus !== document.body
      ? previousFocus
      : document.querySelector("#app h2");
    if (target) {
      if (!target.matches("button, a, input, [tabindex]")) target.tabIndex = -1;
      target.focus({ preventScroll: true });
    }
  }

  function build() {
    dialog = document.createElement("dialog");
    dialog.className = "mystery-box";
    dialog.id = "mystery-box-dialog";
    dialog.setAttribute("aria-labelledby", "mystery-box-title");
    dialog.innerHTML = `
      <div class="mb-world">
        <div class="mb-fog mb-fog-one" aria-hidden="true"></div>
        <div class="mb-fog mb-fog-two" aria-hidden="true"></div>
        <div class="mb-grain" aria-hidden="true"></div>
        <header class="mb-topbar">
          <span class="mb-brand">The Daily Undead <i></i> <span>Daily transmission</span></span>
          <div class="mb-utilities">
            <button type="button" class="mb-sound" aria-pressed="false">Sound off</button>
            <button type="button" class="mb-skip" autofocus>Skip intro <span aria-hidden="true">↗</span></button>
          </div>
        </header>
        <div class="mb-heading">
          <p class="mb-eyebrow"><span></span> Something survived the night</p>
          <h2 id="mystery-box-title">YOU KNOW <em>THE DRILL.</em></h2>
          <p class="mb-subtitle">One box. A little luck. Today’s clue.</p>
        </div>
        <div class="mb-stage" aria-hidden="true">
          <div class="mb-halo"></div>
          <div class="mb-floor"></div>
          <div class="mb-runes">? <span>?</span> ?</div>
          <div class="mb-beam mb-beam-one"></div><div class="mb-beam mb-beam-two"></div>
          <div class="mb-motes">${Array.from({ length: 24 }, (_, index) => `<i style="--i:${index};--x:${(index * 37) % 100}%;--drift:${(index % 2 ? 1 : -1) * (20 + index * 3)}px"></i>`).join("")}</div>
          <div class="mb-crate-rig">
            <div class="mb-crate">
              <div class="mb-interior"></div>
              <div class="mb-side mb-side-left"><span></span></div>
              <div class="mb-side mb-side-right"><span></span></div>
              <div class="mb-front">
                <div class="mb-stamp">PROPERTY OF<br><strong>THE UNKNOWN</strong><br>HANDLE WITH EXTREME CAUTION</div>
                <span class="mb-question mb-question-left">?</span><span class="mb-question mb-question-right">?</span>
                <i class="mb-strap mb-strap-left"></i><i class="mb-strap mb-strap-right"></i>
                <i class="mb-lock"></i><span class="mb-serial">115 / DU — CLASSIFIED</span>
              </div>
              <div class="mb-lid"><div class="mb-lid-face"><span>?</span><span>?</span><span>?</span><i class="mb-strap mb-strap-left"></i><i class="mb-strap mb-strap-right"></i></div><div class="mb-lid-edge"></div></div>
              <div class="mb-seam"></div>
            </div>
          </div>
          <div class="mb-flare"></div>
          <div class="mb-roulette"><span>115</span></div>
        </div>
        <section class="mb-reward" aria-labelledby="mb-reward-label">
          <p id="mb-reward-label" class="mb-eyebrow"></p>
          <p class="mb-clue"></p>
          <p class="mb-hint"></p>
          <button class="mb-continue" type="button" disabled>Take the clue <span aria-hidden="true">→</span></button>
        </section>
        <footer class="mb-bottom"><span class="mb-status" role="status" aria-live="polite">Locating today’s transmission…</span><span class="mb-date"></span></footer>
      </div>`;
    document.body.append(dialog);
    dialog.querySelector(".mb-skip").addEventListener("click", finish);
    dialog.querySelector(".mb-continue").addEventListener("click", finish);
    dialog.querySelector(".mb-sound").addEventListener("click", () => {
      soundEnabled = !soundEnabled;
      dialog.querySelector(".mb-sound").textContent = soundEnabled ? "Sound on" : "Sound off";
      dialog.querySelector(".mb-sound").setAttribute("aria-pressed", String(soundEnabled));
      if (soundEnabled) void startSound();
      else if (audio) void audio.suspend().catch(() => {});
    });
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(); });
    dialog.addEventListener("close", () => {
      stop();
      document.documentElement.classList.remove("mystery-box-active");
    });
    // Keep the app's document-level letter shortcuts from playing beneath the film.
    dialog.addEventListener("keydown", (event) => event.stopPropagation());
  }

  function reveal() {
    dialog.dataset.phase = "revealed";
    dialog.querySelector(".mb-status").textContent = "Transmission received. Your round is ready.";
    dialog.querySelector(".mb-reward").inert = false;
    dialog.querySelector(".mb-reward").removeAttribute("aria-hidden");
    dialog.querySelector(".mb-continue").disabled = false;
    if (!reducedMotion()) {
      [261.63, 392, 523.25, 659.25].forEach((frequency) => tone(frequency, 0, 1.8, .035));
      tone(65.4, 0, 1.8, .12, "triangle");
    }
    markSeen();
  }

  function open(details, { force = false } = {}) {
    latest = details;
    let previouslySeen = seen.has(details.key);
    try { previouslySeen ||= window.sessionStorage.getItem(`daily-undead:box:${details.key}`) === "1"; } catch { /* Memory fallback. */ }
    if (!force && (previouslySeen || !details.fresh)) return;
    if (!dialog) build();
    if (dialog.open) return;
    stop();
    previousFocus = document.activeElement;
    dialog.dataset.phase = "waiting";
    dialog.classList.toggle("mb-word-reward", details.type === "word");
    dialog.querySelector("#mb-reward-label").textContent = details.label;
    dialog.querySelector(".mb-clue").textContent = details.clue;
    dialog.querySelector(".mb-hint").textContent = details.hint || "";
    dialog.querySelector(".mb-date").textContent = details.date;
    dialog.querySelector(".mb-status").textContent = "Locating today’s transmission…";
    dialog.querySelector(".mb-continue").disabled = true;
    dialog.querySelector(".mb-reward").inert = true;
    dialog.querySelector(".mb-reward").setAttribute("aria-hidden", "true");
    document.documentElement.classList.add("mystery-box-active");
    dialog.showModal();
    if (reducedMotion()) { reveal(); return; }
    if (soundEnabled) void startSound();
    later(() => {
      dialog.dataset.phase = "charging";
      dialog.querySelector(".mb-status").textContent = "An unknown signal is getting stronger…";
    }, 650);
    later(() => {
      dialog.dataset.phase = "opening";
      dialog.querySelector(".mb-status").textContent = "Decoding today’s clue…";
      tone(70, 0, 1.6, .1, "sawtooth", 220);
    }, 2050);
    const fragments = ["115", "? ? ?", "AETHER", "•• — •", "UNDEAD", "?", "SIGNAL FOUND"];
    fragments.forEach((fragment, index) => later(() => {
      const reel = dialog.querySelector(".mb-roulette span");
      reel.textContent = fragment;
      tone(240 + index * 65, 0, .13, .035, "triangle");
    }, 2350 + index * (170 + index * 10)));
    later(reveal, 4350);
  }

  return {
    open,
    replay() { if (latest) open(latest, { force: true }); },
    get isOpen() { return Boolean(dialog?.open); },
  };
}
