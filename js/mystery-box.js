// Animate the existing clue in place; puzzle state and controls stay with the app.
export function createMysteryBox() {
  let wrapper;
  let clue;
  let timers = [];
  const seen = new Set();
  const later = (callback, delay) => timers.push(window.setTimeout(callback, delay));

  function cancel() {
    timers.forEach(window.clearTimeout);
    timers = [];
    if (wrapper?.isConnected && clue) wrapper.replaceWith(clue);
    wrapper = null;
    clue = null;
  }

  function open({ key, type, fresh }) {
    cancel();
    if (!fresh || seen.has(key)) return;
    seen.add(key);
    // The accessible, static clue is already in its final position for reduced motion.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    clue = document.querySelector(type === "word" ? "#app .word-answer" : "#clue-list .clue-card:not(.is-hidden)");
    if (!clue) return;
    wrapper = document.createElement("div");
    wrapper.className = "mb-reveal";
    wrapper.dataset.phase = "closed";
    clue.before(wrapper);
    wrapper.append(clue);
    const scene = document.createElement("div");
    scene.className = "mb-scene";
    scene.setAttribute("aria-hidden", "true");
    scene.innerHTML = `
      <div class="mb-glow"></div>
      <div class="mb-beam"></div>
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
`;
    wrapper.append(scene);
    later(() => { if (wrapper) wrapper.dataset.phase = "opening"; }, 250);
    later(() => { if (wrapper) wrapper.dataset.phase = "rising"; }, 850);
    later(() => { if (wrapper) wrapper.dataset.phase = "revealed"; }, 1550);
    later(() => { if (wrapper) wrapper.dataset.phase = "settling"; }, 2300);
    later(cancel, 3000);
  }

  return { open, cancel };
}
