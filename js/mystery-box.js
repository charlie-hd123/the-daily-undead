// Presentation only. The real puzzle stays in the DOM and remains playable.
export function createMysteryBox() {
  const stage = document.querySelector('#initial-mystery-box .mb-scene');
  const review = ['localhost', '127.0.0.1'].includes(location.hostname) ? new URLSearchParams(location.search).get('boxReview') : null;
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let visual;
  let wrapper;
  let panel;
  let frame;
  let progress = 0;
  let unavailable = reducedMotion() || review === 'fallback';
  let firstPresentation = true;
  const firstShownAt = performance.now();
  let renderingReady = Promise.resolve(null);
  let timers = [];
  const seen = new Set();
  const later = (callback, delay) => timers.push(window.setTimeout(callback, delay));
  function skipPresentation() {
    unavailable = true;
    if (stage) stage.hidden = true;
    cancel();
  }
  if (unavailable && stage) stage.hidden = true;
  stage?.addEventListener('mystery-box-unavailable', skipPresentation);
  // Load the renderer alongside the normal data requests, not before app startup.
  if (stage && !unavailable) {
    renderingReady = import('./mystery-box-scene.js?v=20261018-8')
      .then(({ createMysteryBoxScene }) => createMysteryBoxScene(stage))
      .then((scene) => {
        if (unavailable) { scene.dispose(); return null; }
        visual = scene; visual.draw(progress);
        stage.classList.add('is-rendered');
        if (review === 'closed') {
          const save = document.createElement('button');
          save.type = 'button'; save.textContent = 'Render poster'; save.className = 'mb-review-export';
          save.addEventListener('click', () => {
            stage.querySelector('.mb-export-image')?.remove();
            const image = document.createElement('img'); image.className = 'mb-export-image'; image.alt = 'Closed chest poster'; image.src = visual.poster(); stage.append(image);
          });
          stage.append(save);
        }
        return scene;
      })
      .catch((error) => { skipPresentation(); console.warn('Mystery Box renderer unavailable; showing the puzzle directly.', error); return null; });
  }

  function cancel() {
    timers.forEach(window.clearTimeout); timers = [];
    window.cancelAnimationFrame(frame);
    if (panel) panel.inert = false;
    if (wrapper?.isConnected && panel) {
      const focused = document.activeElement;
      wrapper.replaceWith(panel);
      if (panel.contains(focused)) focused.focus({ preventScroll: true });
    }
    wrapper = panel = null;
  }
  function animateLid() {
    const started = performance.now();
    function tick(now) {
      progress = Math.min(1, (now - started) / 850);
      visual?.draw(progress);
      if (progress < 1 && wrapper?.isConnected) frame = window.requestAnimationFrame(tick);
    }
    frame = window.requestAnimationFrame(tick);
  }
  function open({ key, type, fresh }) {
    cancel();
    const shownAt = firstPresentation ? firstShownAt : performance.now();
    firstPresentation = false;
    if (!stage || unavailable || !fresh || seen.has(key) || reducedMotion()) return;
    seen.add(key);
    panel = document.querySelector(type === 'word' ? '#app .word-puzzle-panel' : '#app .quest-clue-panel');
    if (!panel) return;
    progress = 0; visual?.draw(0);
    if (visual) stage.classList.add('is-rendered');
    wrapper = document.createElement('div'); wrapper.className = 'mb-reveal'; wrapper.dataset.phase = 'closed';
    const focused = document.activeElement;
    panel.before(wrapper); wrapper.append(panel, stage); visual?.resize();
    if (panel.contains(focused)) focused.focus({ preventScroll: true });
    // Freeze the real component for local visual QA and its first-frame poster.
    if (review === 'closed' || review === 'open') {
      wrapper.dataset.review = review;
      wrapper.dataset.phase = review === 'open' ? 'illuminated' : 'closed';
      progress = review === 'open' ? 1 : 0; visual?.draw(progress);
      return;
    }
    panel.inert = true;
    const currentWrapper = wrapper;
    // Failed or slow 3D goes directly to the ordinary, interactive puzzle.
    const deadline = new Promise((resolve) => later(() => resolve(null), 1800));
    void Promise.race([renderingReady, deadline]).then(() => {
      if (wrapper !== currentWrapper || !wrapper?.isConnected) return;
      if (!visual) { skipPresentation(); return; }
      const hold = Math.max(0, 1500 - (performance.now() - shownAt));
      later(() => {
        if (!wrapper) return;
        wrapper.dataset.phase = 'opening';
        animateLid();
      }, hold);
      later(() => { if (wrapper) wrapper.dataset.phase = 'illuminated'; }, hold + 850);
      later(() => {
        if (!wrapper) return;
        wrapper.dataset.phase = 'emerging'; panel.inert = false;
        if (document.activeElement === document.body && panel.contains(focused)) focused.focus({ preventScroll: true });
      }, hold + 1300);
      later(() => { if (wrapper) wrapper.dataset.phase = 'rising'; }, hold + 1650);
      later(() => { if (wrapper) wrapper.dataset.phase = 'revealed'; }, hold + 2200);
      later(cancel, hold + 2850);
    });
  }
  window.addEventListener('pagehide', (event) => { cancel(); if (!event.persisted) visual?.dispose(); });
  window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', (event) => { if (event.matches) skipPresentation(); });
  return { open, cancel, get isPresenting() { return Boolean(panel?.inert); } };
}
