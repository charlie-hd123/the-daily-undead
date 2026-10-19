import { BOX_SEQUENCE, createTitleFlight, createBoxActivation } from './mystery-box-motion.js?v=20261019-3';

// Presentation only. The real puzzle stays in the DOM and remains playable.
export function createMysteryBox() {
  const stage = document.querySelector('#initial-mystery-box .mb-scene');
  const trigger = stage?.querySelector('.mb-open-trigger');
  const review = ['localhost', '127.0.0.1'].includes(location.hostname) ? new URLSearchParams(location.search).get('boxReview') : null;
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let visual;
  let wrapper;
  let panel;
  let reward;
  let frame;
  let progress = 0;
  let unavailable = reducedMotion() || review === 'fallback';
  let beginReveal;
  let activation = createBoxActivation(() => beginReveal?.());
  let renderingReady = Promise.resolve(null);
  let timers = [];
  const seen = new Set();
  const later = (callback, delay) => timers.push(window.setTimeout(callback, delay));
  function positionTrigger() {
    if (!visual || !trigger || progress) return;
    visual.resize();
    const rect = stage.getBoundingClientRect();
    const bounds = visual.closedBounds();
    Object.assign(trigger.style, { left: `${bounds.left - rect.left - 8}px`, top: `${bounds.top - rect.top - 8}px`,
      width: `${bounds.width + 16}px`, height: `${bounds.height + 16}px` });
  }
  function syncTrigger() {
    if (!trigger) return;
    trigger.disabled = activation.requested;
    const waiting = activation.requested && !trigger.hidden;
    stage.classList.toggle('is-requested', waiting);
    if (waiting) trigger.setAttribute('aria-busy', 'true'); else trigger.removeAttribute('aria-busy');
  }
  trigger?.addEventListener('click', () => {
    if (unavailable || review) return;
    activation.request(); syncTrigger();
  });
  // Announce the opening control on entry, but draw its focus ring after keyboard interaction.
  trigger?.addEventListener('keydown', () => trigger.removeAttribute('data-auto-focus'));
  trigger?.addEventListener('blur', () => trigger.removeAttribute('data-auto-focus'));
  const triggerObserver = stage && new ResizeObserver(positionTrigger);
  if (stage) triggerObserver.observe(stage);
  function showVisual() {
    if (!visual || unavailable) return;
    stage.classList.add('is-rendered');
    // Draw in the same frame that exposes the canvas, rather than revealing an old buffer.
    visual.draw(progress); positionTrigger();
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
    renderingReady = Promise.all([
      document.fonts.load('900 40px "Barlow Condensed"').then(() => document.fonts.check('900 40px "Barlow Condensed"')).catch(() => false),
      import('./mystery-box-scene.js?v=20261019-3')
        .then(({ createMysteryBoxScene }) => createMysteryBoxScene(stage)),
    ])
      .then(([fontReady, scene]) => {
        if (!fontReady) { scene.dispose(); throw new Error('Branded title font unavailable'); }
        return scene;
      })
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
    if (wrapper) {
      activation.cancel(); activation = createBoxActivation(() => beginReveal?.());
    }
    beginReveal = null;
    if (trigger) { trigger.hidden = false; trigger.removeAttribute('data-auto-focus'); syncTrigger(); }
    timers.forEach(window.clearTimeout); timers = [];
    window.cancelAnimationFrame(frame);
    if (reward) {
      const { node, slot, context, style, hidden, inert, content } = reward;
      slot.replaceWith(node);
      node.classList.remove('mb-title-traveller'); node.replaceChildren(...content); node.style.cssText = style; node.inert = inert;
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
  function prepareReward() {
    const node = panel.querySelector('.puzzle-title');
    if (!node) return false;
    const target = node.getBoundingClientRect();
    const origin = wrapper.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    if (!target.width || !target.height) return false;
    const slot = document.createElement('span'); slot.className = 'mb-title-slot';
    slot.setAttribute('aria-hidden', 'true');
    slot.style.cssText = `width:${target.width}px;height:${target.height}px;`;
    const context = document.createElement('div'); context.className = 'mb-title-portal';
    context.setAttribute('aria-hidden', 'true'); context.inert = true;
    const content = [...node.childNodes];
    const object = document.createElement('span'); object.className = 'mb-title-object';
    // Shallow, real CSS 3D layers use the exact same font metrics as the final heading.
    for (let layer = 8; layer >= 1; layer--) {
      const side = document.createElement('span'); side.className = 'mb-title-side';
      side.textContent = node.textContent; side.setAttribute('aria-hidden', 'true');
      side.style.setProperty('--layer', layer); object.append(side);
    }
    const face = document.createElement('span'); face.className = 'mb-title-face';
    face.append(...content); object.append(face);
    reward = { node, slot, context, object, content, target, style: node.style.cssText,
      hidden: node.getAttribute('aria-hidden'), inert: node.inert,
      flight: createTitleFlight({ target, mouth: visual.aperture(), stage: stageRect }) };
    node.replaceChildren(object); node.replaceWith(slot); wrapper.append(context); context.append(node);
    context.style.cssText = `left:${stageRect.left - origin.left}px;top:${stageRect.top - origin.top}px;width:${stageRect.width}px;height:${Math.max(stageRect.height, panel.offsetHeight)}px;`;
    node.classList.add('mb-title-traveller'); node.inert = true; node.setAttribute('aria-hidden', 'true');
    Object.assign(node.style, { position: 'absolute', left: `${target.left - stageRect.left}px`,
      top: `${target.top - stageRect.top}px`, width: `${target.width}px`, height: `${target.height}px`, margin: '0' });
    return true;
  }
  function positionReward(elapsed) {
    const { node, object, context, target, flight } = reward;
    const pose = flight(elapsed);
    node.style.transform = `translate3d(${pose.left - target.left}px,${pose.top - target.top}px,0) scale(${pose.scale})`;
    object.style.transform = `rotateX(${pose.rotateX}deg) rotateY(${pose.rotateY}deg) rotateZ(${pose.rotateZ}deg)`;
    context.style.clipPath = elapsed < BOX_SEQUENCE.settleAt
      ? `polygon(0 0,100% 0,100% ${pose.clipRight}px,0 ${pose.clipLeft}px)` : 'none';
    node.style.setProperty('--mb-light', pose.light);
    node.style.setProperty('--mb-depth', pose.depth);
  }
  function showSequenceAt(elapsed) {
    const lid = Math.min(1, elapsed / BOX_SEQUENCE.lid);
    if (lid !== progress) { progress = lid; visual.draw(progress); }
    if (elapsed >= BOX_SEQUENCE.liftAt) {
      if (!reward && !prepareReward()) { cancel(); return; }
      positionReward(elapsed);
    }
    const phase = elapsed >= BOX_SEQUENCE.assembleAt ? 'assembling'
      : elapsed >= BOX_SEQUENCE.settleAt ? 'settling'
      : elapsed >= BOX_SEQUENCE.liftAt + BOX_SEQUENCE.liftFor ? 'reward'
      : elapsed >= BOX_SEQUENCE.liftAt ? 'lifting' : 'opening';
    if (wrapper.dataset.phase !== phase) wrapper.dataset.phase = phase;
  }
  function animateSequence(focused) {
    const started = performance.now();
    function tick(now) {
      if (!wrapper?.isConnected) return;
      const elapsed = now - started;
      showSequenceAt(elapsed);
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
    if (!stage || !trigger || unavailable || !fresh || seen.has(key) || reducedMotion()) {
      activation.cancel(); activation = createBoxActivation(() => beginReveal?.()); syncTrigger();
      return;
    }
    panel = document.querySelector(type === 'word' ? '#app .word-puzzle-panel' : '#app .quest-clue-panel');
    if (!panel) return;
    // A new reveal must be in view when entered from a result or the just-for-fun cards.
    if (window.scrollY) window.scrollTo(0, 0);
    progress = 0;
    wrapper = document.createElement('div'); wrapper.className = 'mb-reveal'; wrapper.dataset.phase = 'closed';
    const focused = document.activeElement;
    panel.before(wrapper); wrapper.append(panel, stage); visual?.resize(); showVisual();
    if (review) trigger.hidden = true;
    // Freeze the real component for local visual QA and its first-frame poster.
    if (review === 'closed' || review === 'open') {
      wrapper.dataset.review = review;
      wrapper.dataset.phase = review === 'open' ? 'illuminated' : 'closed';
      progress = review === 'open' ? 1 : 0; visual?.draw(progress);
      return;
    }
    panel.inert = true;
    const currentWrapper = wrapper;
    const currentActivation = activation;
    if (!review) {
      syncTrigger();
      if (panel.contains(focused) && !activation.requested) {
        trigger.setAttribute('data-auto-focus', ''); trigger.focus({ preventScroll: true });
      }
      beginReveal = () => {
        if (wrapper !== currentWrapper || !visual) return;
        seen.add(key); trigger.hidden = true;
        wrapper.dataset.phase = 'opening'; syncTrigger();
        animateSequence(focused);
      };
    } else trigger.hidden = true;
    if (['lift', 'reward', 'landed'].includes(review)) {
      wrapper.dataset.review = review;
      void renderingReady.then(() => {
        if (wrapper !== currentWrapper || !visual) return;
        progress = 1; visual.draw(1);
        showSequenceAt(review === 'lift' ? 1070 : review === 'reward' ? 1900 : 3100);
      });
      return;
    }
    // Failed or slow 3D goes directly to the ordinary, interactive puzzle.
    const deadline = new Promise((resolve) => later(() => resolve(null), 1800));
    void Promise.race([renderingReady, deadline]).then(() => {
      if (wrapper !== currentWrapper || !wrapper?.isConnected) return;
      if (!visual) { skipPresentation(); return; }
      currentActivation.ready();
    });
  }
  window.addEventListener('pagehide', (event) => { cancel(); if (!event.persisted) { triggerObserver?.disconnect(); visual?.dispose(); } });
  window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', (event) => { if (event.matches) skipPresentation(); });
  window.addEventListener('resize', () => { if (reward) cancel(); });
  return { open, cancel, get isPresenting() { return Boolean(panel?.inert); } };
}
