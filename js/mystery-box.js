import { BOX_SEQUENCE, ICON_INK, createIconFlight, createBoxActivation, revealHeight, lidOpenness } from './mystery-box-motion.js?v=20261022-4';

import { createDailyBoxHistory } from './mystery-box-history.js?v=20261022-4';

// Presentation only. The real puzzle stays in the DOM and remains playable.
export function createMysteryBox({ beforeOpen, onOpen = () => {}, onCancel = () => {} } = {}) {
  const stage = document.querySelector('#initial-mystery-box .mb-scene');
  const trigger = stage?.querySelector('.mb-open-trigger');
  const caption = document.querySelector('#initial-mystery-box .mb-caption');
  const intro = document.querySelector('#initial-mystery-box .mb-intro-title');
  const copy = document.querySelector('#initial-mystery-box .mb-copy');
  const review = ['localhost', '127.0.0.1'].includes(location.hostname) ? new URLSearchParams(location.search).get('boxReview') : null;
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let visual;
  let wrapper;
  let panel;
  let reward;
  let layout;
  let frame;
  let progress = 0;
  const supported = globalThis.dailyUndeadEntry?.canAnimate
    ?? (typeof WebGL2RenderingContext === 'function' && typeof ResizeObserver === 'function');
  let unavailable = reducedMotion() || review === 'fallback' || !supported;
  let beginReveal;
  let activation = createBoxActivation(() => beginReveal?.());
  let renderingReady;
  let timers = [];
  let history;
  let historyStorage;
  let activeEligibility;
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
    // Touch browsers can retain :hover after a tap; hide the prompt independently of CSS.
    if (caption) caption.hidden = unavailable || activation.requested;
    if (waiting) trigger.setAttribute('aria-busy', 'true'); else trigger.removeAttribute('aria-busy');
  }
  trigger?.addEventListener('click', () => {
    if (unavailable || review) return;
    activation.request(); syncTrigger();
  });
  // Announce the opening control on entry, but draw its focus ring after keyboard interaction.
  trigger?.addEventListener('keydown', () => trigger.removeAttribute('data-auto-focus'));
  trigger?.addEventListener('blur', () => trigger.removeAttribute('data-auto-focus'));
  const triggerObserver = stage && typeof ResizeObserver === 'function' ? new ResizeObserver(positionTrigger) : null;
  triggerObserver?.observe(stage);
  function showVisual() {
    if (!visual || unavailable) return;
    stage.classList.add('is-rendered');
    // Draw in the same frame that exposes the canvas, rather than revealing an old buffer.
    visual.draw(progress); positionTrigger();
  }
  function skipPresentation() {
    unavailable = true;
    if (stage) stage.hidden = true;
    if (caption) caption.hidden = true;
    if (intro) intro.hidden = true;
    if (copy) copy.hidden = true;
    cancel();
  }
  if (unavailable) { if (stage) stage.hidden = true; if (caption) caption.hidden = true; if (intro) intro.hidden = true; }
  stage?.addEventListener('mystery-box-unavailable', skipPresentation);
  // Returning players never import or initialize Three.js. Only a confirmed fresh
  // official puzzle can start it; the matching HTML poster covers that short load.
  function ensureRenderer() {
    if (renderingReady) return renderingReady;
    renderingReady = Promise.all([
      document.fonts.load('900 40px "Barlow Condensed"').then(() => document.fonts.check('900 40px "Barlow Condensed"')).catch(() => false),
      import('./mystery-box-scene.js?v=20261022-4')
        .then(({ createMysteryBoxScene }) => createMysteryBoxScene(stage)),
    ])
      .then(([fontReady, scene]) => {
        if (!fontReady) { scene.dispose(); throw new Error('Branded display font unavailable'); }
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
    return renderingReady;
  }

  function cancel() {
    onCancel();
    activeEligibility = null;
    if (wrapper) {
      activation.cancel(); activation = createBoxActivation(() => beginReveal?.());
    }
    beginReveal = null;
    if (trigger) { trigger.hidden = false; trigger.removeAttribute('data-auto-focus'); syncTrigger(); }
    timers.forEach(window.clearTimeout); timers = [];
    window.cancelAnimationFrame(frame);
    if (reward) {
      const { node, slot, context, style, hidden, inert } = reward;
      slot.replaceWith(node);
      node.classList.remove('mb-icon-face'); node.style.cssText = style; node.inert = inert;
      if (hidden === null) node.removeAttribute('aria-hidden'); else node.setAttribute('aria-hidden', hidden);
      context.remove(); reward = null;
    }
    if (panel) panel.inert = false;
    if (wrapper?.isConnected && panel) {
      const focused = document.activeElement;
      wrapper.replaceWith(panel);
      if (panel.contains(focused)) focused.focus({ preventScroll: true });
    }
    wrapper = panel = layout = null;
  }
  function prepareReward() {
    const node = panel.querySelector('.puzzle-panel-art');
    if (!node) return false;
    const target = node.getBoundingClientRect();
    const origin = wrapper.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    layout = { closedHeight: origin.height, puzzleHeight: panel.getBoundingClientRect().height };
    if (!target.width || !target.height) return false;
    // The native icon is out of flow, so a comment preserves its place without adding layout.
    const slot = document.createComment('Puzzle icon');
    const context = document.createElement('div'); context.className = 'mb-icon-portal';
    context.setAttribute('aria-hidden', 'true'); context.inert = true;
    const traveller = document.createElement('div'); traveller.className = 'mb-icon-traveller';
    const object = document.createElement('div'); object.className = 'mb-icon-object';
    for (let layer = 4; layer >= 1; layer--) {
      const side = node.cloneNode(false); side.className = 'mb-icon-side';
      side.setAttribute('aria-hidden', 'true'); side.style.setProperty('--layer', layer); object.append(side);
    }
    reward = { node, slot, context, traveller, object, target, style: node.style.cssText,
      hidden: node.getAttribute('aria-hidden'), inert: node.inert,
      flight: createIconFlight({ target, mouth: visual.aperture(), stage: stageRect, viewDirection: visual.viewDirection(),
        ink: ICON_INK[panel.classList.contains('word-puzzle-panel') ? 'word' : panel.classList.contains('blood-puzzle-panel') ? 'blood' : 'easter'] }) };
    node.replaceWith(slot); object.append(node); traveller.append(object); context.append(traveller); wrapper.append(context);
    context.style.cssText = `left:${stageRect.left - origin.left}px;top:${stageRect.top - origin.top}px;width:${stageRect.width}px;height:${Math.max(stageRect.height, panel.offsetHeight)}px;`;
    node.classList.add('mb-icon-face'); node.inert = true; node.setAttribute('aria-hidden', 'true');
    Object.assign(traveller.style, { left: `${target.left - stageRect.left}px`, top: `${target.top - stageRect.top}px`,
      width: `${target.width}px`, height: `${target.height}px` });
    return true;
  }
  function positionReward(elapsed) {
    const { traveller, object, context, target, flight } = reward;
    const pose = flight(elapsed);
    traveller.style.transform = `translate3d(${pose.left - target.left}px,${pose.top - target.top}px,0) scale(${pose.scale})`;
    traveller.style.opacity = pose.opacity;
    object.style.transform = `rotateX(${pose.rotateX}deg) rotateY(${pose.rotateY}deg) rotateZ(${pose.rotateZ}deg)`;
    context.style.clipPath = elapsed < BOX_SEQUENCE.settleAt
      ? `polygon(0 0,100% 0,100% ${pose.clipRight}px,0 ${pose.clipLeft}px)` : 'none';
    traveller.style.setProperty('--mb-light', pose.light);
    traveller.style.setProperty('--mb-depth', pose.depth);
  }
  function showSequenceAt(elapsed) {
    intro?.setAttribute('aria-hidden', 'true');
    const lid = lidOpenness(elapsed);
    if (lid !== progress) { progress = lid; visual.draw(progress); }
    if (elapsed >= BOX_SEQUENCE.liftAt) {
      if (!reward && !prepareReward()) { cancel(); return; }
      wrapper.style.height = `${revealHeight(elapsed, layout.closedHeight, layout.puzzleHeight)}px`;
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
  function open({ dateKey, type, fresh, official, storage }) {
    cancel();
    if (!history || historyStorage !== storage) {
      history = createDailyBoxHistory(storage); historyStorage = storage;
    }
    const eligible = review ? official && fresh : history.canOpen({ dateKey, official, fresh });
    if (!stage || !trigger || !caption || unavailable || !eligible || reducedMotion()) {
      activation.cancel(); activation = createBoxActivation(() => beginReveal?.()); syncTrigger();
      return;
    }
    // Remembered accounts start quietly; their first genuine fresh box must also
    // pass the real graphics check before a visible wrapper is inserted.
    if (globalThis.dailyUndeadEntry?.acquireGraphics && !globalThis.dailyUndeadEntry.acquireGraphics()) {
      skipPresentation(); return;
    }
    panel = document.querySelector(type === 'word' ? '#app .word-puzzle-panel' : type === 'blood' ? '#app .blood-puzzle-panel' : '#app .quest-clue-panel');
    if (!panel) return;
    activeEligibility = { dateKey, official, fresh };
    // The official daily reveal starts in view.
    if (window.scrollY) window.scrollTo(0, 0);
    progress = 0;
    wrapper = document.createElement('div'); wrapper.className = 'mb-reveal'; wrapper.dataset.phase = 'closed';
    const focused = document.activeElement;
    panel.before(wrapper); caption.hidden = activation.requested;
    if (intro) { intro.hidden = false; intro.removeAttribute('aria-hidden'); }
    if (copy) copy.hidden = false;
    wrapper.append(panel, stage, ...(copy ? [copy] : [...(intro ? [intro] : []), caption])); visual?.resize(); showVisual();
    const rendererReady = ensureRenderer();
    if (review) trigger.hidden = true;
    // Freeze the real component for local visual QA and its first-frame poster.
    if (review === 'closed' || review === 'open') {
      wrapper.dataset.review = review;
      wrapper.dataset.phase = review === 'open' ? 'illuminated' : 'closed';
      const reviewFrame = new URLSearchParams(location.search).get('boxFrame');
      const frameMs = reviewFrame !== null && Number.isFinite(Number(reviewFrame))
        ? Math.max(0, Math.min(BOX_SEQUENCE.lid, Number(reviewFrame))) : BOX_SEQUENCE.lid;
      progress = review === 'open' ? lidOpenness(frameMs) : 0; visual?.draw(progress);
      if (review === 'open') intro?.setAttribute('aria-hidden', 'true');
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
      const reveal = () => {
        if (wrapper !== currentWrapper || !visual) return;
        // Another tab may have opened this day's box while this one was waiting.
        if (!history.canOpen({ dateKey, official, fresh })) { cancel(); return; }
        if (!history.markOpened(dateKey)) { cancel(); return; }
        trigger.hidden = true;
        wrapper.dataset.phase = 'opening'; syncTrigger();
        onOpen();
        animateSequence(focused);
      };
      beginReveal = () => {
        let preparation;
        try { preparation = beforeOpen?.(); } catch { /* Sound cannot block the puzzle. */ }
        if (preparation && typeof preparation.then === 'function') {
          // Keep the recorded latch and the lid in sync on the first browser tap.
          // Missing/blocked audio has a short ceiling, so the real game still opens.
          const audioDeadline = new Promise(resolve => later(resolve, 750));
          void Promise.race([preparation, audioDeadline]).catch(() => false).then(reveal);
        } else reveal();
      };
    } else trigger.hidden = true;
    // Decode the actual SVG before the reveal; a missing asset goes directly to play.
    const icon = panel.querySelector('.puzzle-panel-art');
    const presentationReady = Promise.all([rendererReady, icon ? icon.decode() : Promise.reject()])
      .then(([scene]) => scene).catch(() => null);
    if (['lift', 'reward', 'landed'].includes(review)) {
      wrapper.dataset.review = review;
      void presentationReady.then((scene) => {
        if (wrapper !== currentWrapper) return;
        if (!scene || !visual) { skipPresentation(); return; }
        progress = 1; visual.draw(1);
        showSequenceAt(review === 'lift' ? 1070 : review === 'reward' ? 1900 : 3100);
      });
      return;
    }
    // Failed or slow 3D goes directly to the ordinary, interactive puzzle.
    const deadline = new Promise((resolve) => later(() => resolve(null), 1800));
    void Promise.race([presentationReady, deadline]).then((scene) => {
      if (wrapper !== currentWrapper || !wrapper?.isConnected) return;
      if (!scene || !visual) { skipPresentation(); return; }
      currentActivation.ready();
    });
  }
  window.addEventListener('pagehide', (event) => { cancel(); if (!event.persisted) { triggerObserver?.disconnect(); visual?.dispose(); } });
  window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', (event) => { if (event.matches) skipPresentation(); });
  window.addEventListener('resize', () => { if (reward) cancel(); });
  window.addEventListener('storage', (event) => {
    if (wrapper?.dataset.phase !== 'closed' || !activeEligibility) return;
    if (event.key === null || event.key?.endsWith(`mystery-box-opened:${activeEligibility.dateKey}`)) {
      if (!history.canOpen(activeEligibility)) cancel();
    }
  });
  return { open, cancel, get isPresenting() { return Boolean(panel?.inert); } };
}
