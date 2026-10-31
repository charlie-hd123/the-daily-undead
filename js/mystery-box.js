import { BOX_SEQUENCE, ICON_INK, boxRewardAt, createIconFlight, createBoxActivation, revealHeight, lidOpenness } from './mystery-box-motion.js?v=20261031-2';

import { createDailyBoxHistory } from './mystery-box-history.js?v=20261031-2';

// Presentation only. The real puzzle stays in the DOM and remains playable.
export function createMysteryBox({ beforeOpen, onOpen = () => {}, onSkip = () => {}, onCancel = () => {} } = {}) {
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
  let iconShadowReady = Promise.resolve();
  let timers = [];
  let history;
  let historyStorage;
  let activeEligibility;
  let rewardTypes = [];
  let puzzleType;
  let skipPending = false;
  let settleRequested = false;
  let skipToReward;
  let skipAudioWait;
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
    trigger.disabled = settleRequested;
    trigger.setAttribute('aria-label', activation.requested ? 'Skip roll and reveal today’s icon' : 'Open box to reveal today’s puzzle');
    const waiting = activation.requested && (!wrapper || wrapper.dataset.phase === 'closed');
    // Touch browsers can retain :hover after a tap; hide the prompt independently of CSS.
    if (caption) caption.hidden = unavailable || activation.requested;
    if (waiting) trigger.setAttribute('aria-busy', 'true'); else trigger.removeAttribute('aria-busy');
  }
  trigger?.addEventListener('click', () => {
    if (unavailable || review) return;
    if (activation.requested) {
      if (!wrapper) {
        if (!skipPending) { skipPending = true; onSkip(); }
        return;
      }
      if (settleRequested) return;
      settleRequested = true;
      trigger.hidden = true;
      if (copy) copy.hidden = true;
      onCancel(); onSkip(); skipAudioWait?.(); skipToReward?.();
      return;
    }
    activation.request(); syncTrigger();
  });
  // Announce the opening control on entry, but show its focus cue after keyboard interaction.
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
      import('./mystery-box-scene.js?v=20261031-2')
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
    settleRequested = false;
    skipToReward = skipAudioWait = null;
    activeEligibility = null;
    if (wrapper) {
      activation.cancel(); activation = createBoxActivation(() => beginReveal?.());
    }
    beginReveal = null;
    if (trigger) { trigger.hidden = false; trigger.removeAttribute('data-auto-focus'); syncTrigger(); }
    timers.forEach(window.clearTimeout); timers = [];
    window.cancelAnimationFrame(frame);
    visual?.clearIconShadow?.();
    if (reward) {
      const { node, slot, context, style, hidden, inert, source } = reward;
      node.setAttribute('src', source);
      slot.replaceWith(node);
      node.classList.remove('mb-icon-face'); node.style.cssText = style; node.inert = inert;
      if (hidden === null) node.removeAttribute('aria-hidden'); else node.setAttribute('aria-hidden', hidden);
      context.remove(); reward = null;
    }
    if (trigger) {
      trigger.classList.remove('is-skipping'); trigger.style.cssText = '';
      stage.append(trigger);
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
    const original = { source: node.getAttribute('src'), style: node.style.cssText,
      hidden: node.getAttribute('aria-hidden'), inert: node.inert };
    const layers = rewardTypes.map(type => {
      const traveller = document.createElement('div'); traveller.className = 'mb-icon-traveller';
      traveller.dataset.icon = type;
      const object = document.createElement('div'); object.className = 'mb-icon-object';
      const rolling = document.createElement('div'); rolling.className = 'mb-icon-roll';
      const face = type === puzzleType ? node : node.cloneNode(false);
      face.setAttribute('src', type === puzzleType ? node.getAttribute('src') : iconSource(type));
      for (let layer = 4; layer >= 1; layer--) {
        const side = face.cloneNode(false); side.className = 'mb-icon-side';
        side.setAttribute('aria-hidden', 'true'); side.style.setProperty('--layer', layer); rolling.append(side);
      }
      if (type === puzzleType) node.replaceWith(slot);
      face.classList.add('mb-icon-face'); face.inert = true; face.setAttribute('aria-hidden', 'true');
      rolling.append(face); object.append(rolling); traveller.append(object); context.append(traveller);
      Object.assign(traveller.style, { left: `${target.left - stageRect.left}px`, top: `${target.top - stageRect.top}px`,
        width: `${target.width}px`, height: `${target.height}px`, opacity: '0' });
      return { type, traveller, object, rolling,
        flight: createIconFlight({ target, mouth: visual.aperture(), stage: stageRect, viewDirection: visual.viewDirection(), ink: ICON_INK[type] }) };
    });
    reward = { node, slot, context, target, stageRect, layers, ...original };
    wrapper.append(context);
    context.style.cssText = `left:${stageRect.left - origin.left}px;top:${stageRect.top - origin.top}px;width:${stageRect.width}px;height:${Math.max(stageRect.height, panel.offsetHeight)}px;`;
    return true;
  }
  function positionReward(elapsed) {
    const { context, target, stageRect, layers } = reward;
    const current = boxRewardAt(elapsed, puzzleType, rewardTypes, layers[0].flight(elapsed));
    let shadowChanged = false;
    context.dataset.reward = current.type;
    let activePose;
    for (const { type, traveller, object, rolling, flight } of layers) {
      const exchanging = !current.locked && current.fromType !== current.toType;
      const visibleType = current.type;
      const weight = type === visibleType ? 1 : 0;
      traveller.hidden = !weight;
      if (!weight) { traveller.style.opacity = '0'; continue; }
      const pose = flight(elapsed);
      activePose = pose;
      // Exchange the silhouettes only while edge-on. One visible object avoids
      // a ghosted double outline; predecoded faces never change source in flight.
      const roll = exchanging ? current.rollX : 0;
      traveller.style.transform = `translate3d(${pose.left - target.left}px,${pose.top - target.top}px,0) scale(${pose.scale})`;
      traveller.style.opacity = pose.opacity * weight;
      object.style.transform = `rotateX(${pose.rotateX}deg) rotateY(${pose.rotateY}deg) rotateZ(0deg)`;
      rolling.style.transform = `rotateX(${roll}deg)`;
      traveller.style.setProperty('--mb-confirm', weight ? current.glow : 0);
      traveller.style.setProperty('--mb-light', pose.light);
      traveller.style.setProperty('--mb-depth', pose.depth);
      if (weight) shadowChanged = visual.positionIconShadow?.({ type, pose, target, stage: stageRect, roll, elapsed, openness: progress }) || false;
    }
    const pose = activePose;
    context.style.clipPath = elapsed < BOX_SEQUENCE.settleAt
      ? `polygon(0 0,100% 0,100% ${pose.clipRight}px,0 ${pose.clipLeft}px)` : 'none';
    return shadowChanged;
  }
  function showSequenceAt(elapsed) {
    intro?.setAttribute('aria-hidden', 'true');
    if (settleRequested && copy) copy.hidden = true;
    const lid = lidOpenness(elapsed);
    const lidChanged = lid !== progress;
    progress = lid;
    let shadowChanged = false;
    if (elapsed >= BOX_SEQUENCE.liftAt) {
      if (!reward && !prepareReward()) { cancel(); return; }
      wrapper.style.height = `${revealHeight(elapsed, layout.closedHeight, layout.puzzleHeight)}px`;
      shadowChanged = positionReward(elapsed);
    }
    if (lidChanged || shadowChanged) visual.draw(progress);
    const phase = elapsed >= BOX_SEQUENCE.assembleAt ? 'assembling'
      : elapsed >= BOX_SEQUENCE.settleAt ? 'settling'
      : elapsed >= BOX_SEQUENCE.liftAt + BOX_SEQUENCE.liftFor ? 'reward'
      : elapsed >= BOX_SEQUENCE.liftAt ? 'lifting' : 'opening';
    if (wrapper.dataset.phase !== phase) wrapper.dataset.phase = phase;
  }
  function animateSequence(focused) {
    const started = performance.now();
    const holdAt = BOX_SEQUENCE.cycleAt + BOX_SEQUENCE.cycleFor;
    let offset = settleRequested ? holdAt : 0;
    let lastElapsed = offset;
    skipToReward = () => {
      const elapsed = Math.max(lastElapsed, performance.now() - started + offset);
      // A late tap must never rewind an icon already travelling to its corner.
      if (elapsed >= holdAt) return;
      offset += holdAt - elapsed;
      lastElapsed = holdAt;
      showSequenceAt(holdAt);
    };
    if (settleRequested) showSequenceAt(holdAt);
    function tick(now) {
      if (!wrapper?.isConnected) return;
      const elapsed = Math.max(lastElapsed, now - started + offset);
      lastElapsed = elapsed;
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
  const iconSource = (type) => new URL(`../assets/${{ word: 'dead-letters', easter: 'quest-steps', blood: 'blood-ties' }[type]}-card.svg`, import.meta.url).href;
  function open({ dateKey, type, fresh, official, storage, availableTypes = ['word', 'easter'] }) {
    const earlySettle = skipPending;
    cancel();
    skipPending = false;
    settleRequested = earlySettle;
    if (!history || historyStorage !== storage) {
      history = createDailyBoxHistory(storage); historyStorage = storage;
    }
    const eligible = review ? official && fresh : history.canOpen({ dateKey, official, fresh });
    if (!stage || !trigger || !caption || unavailable || !eligible || reducedMotion()) {
      activation.cancel(); activation = createBoxActivation(() => beginReveal?.()); syncTrigger();
      return;
    }
    puzzleType = type;
    rewardTypes = [...new Set([...availableTypes, type])].filter(type => ICON_INK[type]);
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
        // Keep a real, keyboard-accessible control above the whole reveal so a
        // second tap works even while the chest fades or the icon travels.
        wrapper.append(trigger); trigger.classList.add('is-skipping');
        Object.assign(trigger.style, { left: '0', top: '0', width: '100%', height: '100%' });
        trigger.hidden = settleRequested;
        wrapper.dataset.phase = 'opening'; syncTrigger();
        if (!settleRequested) onOpen();
        animateSequence(focused);
      };
      beginReveal = () => {
        if (settleRequested) { reveal(); return; }
        let preparation;
        try { preparation = beforeOpen?.(); } catch { /* Sound cannot block the puzzle. */ }
        if (preparation && typeof preparation.then === 'function') {
          // Keep the recorded latch and the lid in sync on the first browser tap.
          // Missing/blocked audio has a short ceiling, so the real game still opens.
          const audioDeadline = new Promise(resolve => later(resolve, 750));
          const skipAudio = new Promise(resolve => { skipAudioWait = resolve; });
          void Promise.race([preparation, audioDeadline, skipAudio]).catch(() => false).then(reveal);
        } else reveal();
      };
    } else trigger.hidden = true;
    // Decode the actual SVG before the reveal; a missing asset goes directly to play.
    const icon = panel.querySelector('.puzzle-panel-art');
    const previews = icon ? rewardTypes.filter(type => type !== puzzleType).map(type => {
      const image = icon.cloneNode(false); image.setAttribute('src', iconSource(type)); return image.decode();
    }) : [];
    const presentationReady = Promise.all([rendererReady, icon ? icon.decode() : Promise.reject(), ...previews])
      .then(([scene]) => {
        // Shadow preparation is decorative and may never block the real puzzle.
        iconShadowReady = scene?.prepareIconShadows?.(rewardTypes.map(type => ({ type, source: iconSource(type) }))) ?? Promise.resolve();
        void iconShadowReady.catch(() => {});
        return scene;
      }).catch(() => null);
    if (['lift', 'reward', 'landed', 'timeline'].includes(review)) {
      wrapper.dataset.review = review;
      void presentationReady.then(async (scene) => {
        if (review === 'timeline') await iconShadowReady.catch(() => {});
        if (wrapper !== currentWrapper) return;
        if (!scene || !visual) { skipPresentation(); return; }
        if (review === 'timeline') {
          // Local-only frame stepping drives the real component and renderer.
          const controls = document.createElement('label'); controls.className = 'mb-frame-review';
          controls.textContent = 'Animation frame (ms) ';
          const input = document.createElement('input');
          input.type = 'number'; input.min = '0'; input.max = String(BOX_SEQUENCE.finishAt);
          input.step = 'any'; input.value = '0'; input.setAttribute('aria-label', 'Animation frame (ms)');
          const seek = () => {
            const elapsed = Math.max(0, Math.min(BOX_SEQUENCE.finishAt, Number(input.value) || 0));
            if (reward) {
              reward.context.hidden = elapsed < BOX_SEQUENCE.liftAt;
              if (elapsed < BOX_SEQUENCE.liftAt) {
                visual.clearIconShadow?.(); wrapper.style.height = `${layout.closedHeight}px`;
              }
            }
            showSequenceAt(elapsed); wrapper.dataset.reviewTime = elapsed.toFixed(3);
            // Seek the browser's real CSS transitions too, so frame captures
            // include fades and assembly delays rather than only geometry.
            for (const animation of wrapper.getAnimations({ subtree: true })) {
              if (!('transitionProperty' in animation)) continue;
              const target = animation.effect?.target;
              if (!target || controls.contains(target)) continue;
              const invitation = target === copy || copy?.contains(target);
              const start = target === stage ? BOX_SEQUENCE.settleAt : invitation ? 0 : BOX_SEQUENCE.assembleAt;
              const timing = animation.effect.getTiming();
              animation.pause();
              animation.currentTime = !invitation && target !== stage && elapsed < BOX_SEQUENCE.assembleAt
                ? Number(timing.delay) + Number(timing.duration) : Math.max(0, elapsed - start);
            }
          };
          input.addEventListener('input', seek); controls.append(input); wrapper.append(controls);
          progress = 0; visual.draw(0);
          if (copy) void getComputedStyle(copy).opacity;
          seek();
          return;
        }
        progress = 1; visual.draw(1);
        const requestedFrame = new URLSearchParams(location.search).get('boxFrame');
        const elapsed = requestedFrame !== null && Number.isFinite(Number(requestedFrame))
          ? Math.max(BOX_SEQUENCE.liftAt, Math.min(BOX_SEQUENCE.finishAt, Number(requestedFrame)))
          : review === 'lift' ? 1400 : review === 'reward' ? BOX_SEQUENCE.settleAt - 100 : BOX_SEQUENCE.finishAt - 200;
        showSequenceAt(elapsed);
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
