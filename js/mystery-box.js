// The entire real puzzle emerges from the box; game state and controls stay with the app.
export function createMysteryBox() {
  let wrapper;
  let panel;
  let timers = [];
  const seen = new Set();
  const later = (callback, delay) => timers.push(window.setTimeout(callback, delay));

  function cancel() {
    timers.forEach(window.clearTimeout);
    timers = [];
    if (wrapper?.isConnected && panel) {
      const focused = document.activeElement;
      wrapper.replaceWith(panel);
      if (panel.contains(focused)) focused.focus({ preventScroll: true });
    }
    wrapper = null;
    panel = null;
  }

  function open({ key, type, fresh }) {
    cancel();
    if (!fresh || seen.has(key)) return;
    seen.add(key);
    // Reduced motion keeps the complete puzzle in its normal, accessible layout.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    panel = document.querySelector(type === "word" ? "#app .word-puzzle-panel" : "#app .quest-clue-panel");
    if (!panel) return;
    wrapper = document.createElement("div");
    wrapper.className = "mb-reveal";
    wrapper.dataset.phase = "closed";
    const focused = document.activeElement;
    panel.before(wrapper);
    wrapper.append(panel);
    if (panel.contains(focused)) focused.focus({ preventScroll: true });
    const scene = document.createElement("div");
    scene.className = "mb-scene";
    scene.setAttribute("aria-hidden", "true");
    scene.innerHTML = `
      <div class="mb-glow"></div>
      <div class="mb-beam"></div>
      <div class="mb-white-light"></div>
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
              <div class="mb-lid"><div class="mb-lid-face"><span>?</span><span>?</span><span>?</span><i class="mb-strap mb-strap-left"></i><i class="mb-strap mb-strap-right"></i></div><div class="mb-lid-inner"></div><div class="mb-lid-edge"></div></div>
              <div class="mb-seam"></div>
            </div>
          </div>
`;
    wrapper.append(scene);
    later(() => { if (wrapper) wrapper.dataset.phase = "opening"; }, 350);
    later(() => { if (wrapper) wrapper.dataset.phase = "illuminated"; }, 1150);
    later(() => { if (wrapper) wrapper.dataset.phase = "emerging"; }, 1750);
    later(() => { if (wrapper) wrapper.dataset.phase = "rising"; }, 2250);
    later(() => { if (wrapper) wrapper.dataset.phase = "revealed"; }, 2950);
    later(() => { if (wrapper) wrapper.dataset.phase = "settling"; }, 3350);
    later(cancel, 4000);
  }

  return { open, cancel };
}
