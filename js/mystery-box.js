// The entire real puzzle emerges from the box; game state and controls stay with the app.
export function createMysteryBox() {
  const sceneTemplate = document.querySelector("#initial-mystery-box .mb-scene")?.cloneNode(true);
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
    if (!fresh || seen.has(key) || !sceneTemplate) return;
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
    const scene = sceneTemplate.cloneNode(true);
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
