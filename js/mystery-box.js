import { BOX_SEQUENCE, createRewardFlight } from './mystery-box-motion.js?v=20261019-1';

// Presentation only. The real puzzle stays in the DOM and remains playable.
export function createMysteryBox() {
  const stage = document.querySelector('#initial-mystery-box .mb-scene');
  const review = ['localhost', '127.0.0.1'].includes(location.hostname) ? new URLSearchParams(location.search).get('boxReview') : null;
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let visual;
  let wrapper;
  let panel;
  let reward;
  let frame;
  let progress = 0;
  let unavailable = reducedMotion() || review === 'fallback';
  let firstPresentation = true;
  const firstShownAt = performance.now();
  let renderingReady = Promise.resolve(null);
  let timers = [];
  const seen = new Set();
  const later = (callback, delay) => timers.push(window.setTimeout(callback, delay));
  function showVisual() {
    if (!visual || unavailable) return;
    stage.classList.add('is-rendered');
    // Draw in the same frame that exposes the canvas, rather than revealing an old buffer.
    visual.draw(progress);
  }
  function skipPresentation() {
    unavailable = true;
    if (stage) stage.hidden = true;
    cancel();
  }
  if (unavailable && stage) stage.hidden = true;
  stage?.addEventListener('mystery-box-unavailable', skipPresentation);
  // Load the renderer alongside the normal data requests, not before app startup.
  if (stage && !unavailable) {
    renderingReady = import('./mystery-box-scene.js?v=20261019-1')
      .then(({ createMysteryBoxScene }) => createMysteryBoxScene(stage))
      .then((scene) => {
        if (unavailable) { scene.dispose(); return null; }
        visual = scene; showVisual();
        if (review === 'closed') {
          const save = document.createElement('button');
          save.type = 'button'; save.textContent = 'Render poster'; save.className = 'mb-review-export';
          save.addEventListener('click', () => {
            stage.querySelector('.mb-export-image')?.remove();
            const image = document.createElement('img'); image.className = 'mb-export-image'; image.alt = 'Closed chest poster'; image.src = visual.poster(); stage.append(image);
          });
          stage.append(save);
          const compare = document.createElement('button');
          compare.type = 'button'; compare.textContent = 'Show loading image'; compare.className = 'mb-review-compare';
          compare.addEventListener('click', () => {
            stage.querySelector('.mb-export-image')?.remove();
            const live = stage.classList.toggle('is-rendered');
            if (live) visual.draw(progress);
            compare.textContent = live ? 'Show loading image' : 'Show live 3D';
          });
          stage.append(compare);
        }
        return scene;
      })
      .catch((error) => { skipPresentation(); console.warn('Mystery Box renderer unavailable; showing the puzzle directly.', error); return null; });
  }

  function cancel() {
    timers.forEach(window.clearTimeout); timers = [];
    window.cancelAnimationFrame(frame);
    if (reward) {
      const { node, slot, context, style, hidden, inert } = reward;
      slot.replaceWith(node);
      node.classList.remove('mb-reward'); node.style.cssText = style; node.inert = inert;
      if (hidden === null) node.removeAttribute('aria-hidden'); else node.setAttribute('aria-hidden', hidden);
      context.remove(); reward = null;
    }
    if (panel) panel.inert = false;
    if (wrapper?.isConnected && panel) {
      const focused = document.activeElement;
      wrapper.replaceWith(panel);
      if (panel.contains(focused)) focused.focus({ preventScroll: true });
    }
    wrapper = panel = null;
  }
  function prepareReward(type) {
    const node = panel.querySelector(type === 'word' ? '.word-answer' : '.clue-card:not(.is-hidden)');
    if (!node) return false;
    const target = node.getBoundingClientRect();
    const origin = wrapper.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    if (!target.width || !target.height) return false;
    const slot = document.createElement('div'); slot.className = 'mb-reward-slot';
    slot.setAttribute('aria-hidden', 'true');
    slot.style.cssText = `width:${target.width}px;height:${target.height}px;margin:${getComputedStyle(node).margin};max-width:100%;`;
    const context = document.createElement('div');
    context.className = `mb-reward-context ${type === 'word' ? 'word-puzzle-panel' : 'quest-clue-panel'}`;
    context.setAttribute('aria-hidden', 'true'); context.inert = true;
    reward = { node, slot, context, target, style: node.style.cssText,
      hidden: node.getAttribute('aria-hidden'), inert: node.inert,
      flight: createRewardFlight({ target, mouth: visual.aperture(), stage: stageRect }) };
    node.replaceWith(slot); wrapper.append(context); context.append(node);
    node.classList.add('mb-reward'); node.inert = true; node.setAttribute('aria-hidden', 'true');
    Object.assign(node.style, { position: 'absolute', left: `${target.left - origin.left}px`,
      top: `${target.top - origin.top}px`, width: `${target.width}px`, height: `${target.height}px`, margin: '0' });
    return true;
  }
  function positionReward(elapsed) {
    const { node, target, flight } = reward;
    const pose = flight(elapsed);
    node.style.transform = `translate3d(${pose.left - target.left}px,${pose.top - target.top}px,0) scale(${pose.scale})`;
    node.style.clipPath = `polygon(0 0,100% 0,100% ${pose.clipRight}px,0 ${pose.clipLeft}px)`;
    node.style.setProperty('--mb-light', pose.light);
    node.style.setProperty('--mb-surface', pose.surface);
  }
  function showSequenceAt(elapsed, type) {
    const lid = Math.min(1, elapsed / BOX_SEQUENCE.lid);
    if (lid !== progress) { progress = lid; visual.draw(progress); }
    if (elapsed >= BOX_SEQUENCE.liftAt) {
      if (!reward && !prepareReward(type)) { cancel(); return; }
      positionReward(elapsed);
    }
    const phase = elapsed >= BOX_SEQUENCE.assembleAt ? 'assembling'
      : elapsed >= BOX_SEQUENCE.settleAt ? 'settling'
      : elapsed >= BOX_SEQUENCE.liftAt + BOX_SEQUENCE.liftFor ? 'reward'
      : elapsed >= BOX_SEQUENCE.liftAt ? 'lifting' : 'opening';
    if (wrapper.dataset.phase !== phase) wrapper.dataset.phase = phase;
  }
  function animateSequence(type, focused) {
    const started = performance.now();
    function tick(now) {
      if (!wrapper?.isConnected) return;
      const elapsed = now - started;
      showSequenceAt(elapsed, type);
      if (!wrapper) return;
      if (elapsed >= BOX_SEQUENCE.finishAt) {
        const currentPanel = panel; cancel();
        if (document.activeElement === document.body && currentPanel.contains(focused)) focused.focus({ preventScroll: true });
        return;
      }
      frame = window.requestAnimationFrame(tick);
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
    // A new reveal must be in view when entered from a result or the just-for-fun cards.
    if (window.scrollY) window.scrollTo(0, 0);
    progress = 0;
    wrapper = document.createElement('div'); wrapper.className = 'mb-reveal'; wrapper.dataset.phase = 'closed';
    const focused = document.activeElement;
    panel.before(wrapper); wrapper.append(panel, stage); visual?.resize(); showVisual();
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
    if (['lift', 'reward', 'landed'].includes(review)) {
      wrapper.dataset.review = review;
      void renderingReady.then(() => {
        if (wrapper !== currentWrapper || !visual) return;
        progress = 1; visual.draw(1);
        showSequenceAt(review === 'lift' ? 1000 : review === 'reward' ? 1750 : 2850, type);
      });
      return;
    }
    // Failed or slow 3D goes directly to the ordinary, interactive puzzle.
    const deadline = new Promise((resolve) => later(() => resolve(null), 1800));
    void Promise.race([renderingReady, deadline]).then(() => {
      if (wrapper !== currentWrapper || !wrapper?.isConnected) return;
      if (!visual) { skipPresentation(); return; }
      const hold = Math.max(0, 1500 - (performance.now() - shownAt));
      later(() => {
        if (!wrapper) return;
        wrapper.dataset.phase = 'opening';
        animateSequence(type, focused);
      }, hold);
    });
  }
  window.addEventListener('pagehide', (event) => { cancel(); if (!event.persisted) visual?.dispose(); });
  window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', (event) => { if (event.matches) skipPresentation(); });
  window.addEventListener('resize', () => { if (reward) cancel(); });
  return { open, cancel, get isPresenting() { return Boolean(panel?.inert); } };
}
