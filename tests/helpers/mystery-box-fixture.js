import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as motion from '../../js/mystery-box-motion.js';
import { createDailyBoxHistory } from '../../js/mystery-box-history.js';

// Component lifecycle fixture: the actual controller runs with a controlled loader,
// clock, storage and small DOM. Geometry/pixels are reviewed in the real browser.
export function boxFixture(options = {}) {
  const events = new Map(), timers = new Map(), frames = new Map();
  let sequence = 0, loads = 0, draws = 0, disposed = 0, settleLoader;
  let document;
  class Node {
    constructor(name = '') {
      this.className = name; this.children = []; this.parentElement = null;
      this.attrs = new Map(); this.events = new Map(); this.dataset = {}; this.inert = false;
      this.style = { cssText: '', setProperty(k, v) { this[k] = v; } };
      this.classList = { contains: (v) => this.className.split(' ').includes(v),
        add: (v) => { this.className += ` ${v}`; }, remove: (v) => { this.className = this.className.split(' ').filter((n) => n !== v).join(' '); } };
    }
    get isConnected() { return this === body || Boolean(this.parentElement?.isConnected); }
    append(...nodes) { for (const node of nodes) { node.remove(); this.children.push(node); node.parentElement = this; } }
    before(node) { const p = this.parentElement, index = p.children.indexOf(this); node.remove(); p.children.splice(index, 0, node); node.parentElement = p; }
    replaceWith(node) { const p = this.parentElement; if (!p) return; const index = p.children.indexOf(this); node.remove(); p.children.splice(index, 1, node); node.parentElement = p; this.parentElement = null; }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((n) => n !== this); this.parentElement = null; }
    contains(node) { return node === this || this.children.some((c) => c.contains(node)); }
    setAttribute(k, v) { this.attrs.set(k, String(v)); }
    getAttribute(k) { return this.attrs.get(k) ?? null; }
    removeAttribute(k) { this.attrs.delete(k); }
    addEventListener(k, v) { this.events.set(k, v); }
    click() { this.events.get('click')?.({}); }
    focus() { document.activeElement = this; }
    getBoundingClientRect() { return this === icon ? { left: 900, top: 170, width: 88, height: 88 } : { left: 20, top: 150, width: 1056, height: 480 }; }
    get offsetHeight() { return 480; }
    cloneNode() { const node = new Node(this.className); node.decode = () => Promise.resolve(); return node; }
    querySelector(s) { return this === stage && s === '.mb-open-trigger' ? trigger : this === panel && s === '.puzzle-panel-art' ? icon : null; }
  }
  const body = new Node('body'), app = new Node('app'), initial = new Node('initial'); body.append(app); app.append(initial);
  const stage = new Node('mb-scene'), trigger = new Node('mb-open-trigger'), caption = new Node('mb-caption'), intro = new Node('mb-intro-title'), copy = new Node('mb-copy');
  initial.append(stage, copy); copy.append(intro, caption); stage.append(trigger);
  const panel = new Node('panel word-puzzle-panel'), icon = new Node('puzzle-panel-art');
  icon.setAttribute('src', './assets/dead-letters-card.svg');
  icon.decode = () => options.iconFails ? Promise.reject(new Error('icon unavailable')) : Promise.resolve(); panel.append(icon); app.append(panel);
  document = { body, activeElement: panel, fonts: { load: () => Promise.resolve(), check: () => !options.fontFails },
    createElement: () => new Node(), createComment: () => new Node(),
    querySelector(s) { return s.endsWith('.mb-scene') ? stage : s.endsWith('.mb-copy') ? copy : s.endsWith('.mb-caption') ? caption : s.endsWith('.mb-intro-title') ? intro : s.includes('#app .') ? panel : null; } };
  const values = new Map();
  const storage = options.storage || { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)) };
  const visual = { draw() { draws++; }, resize() {}, dispose() { disposed++; },
    closedBounds: () => ({ left: 250, top: 220, width: 500, height: 230 }),
    aperture: () => ({ left: { x: 250, y: 400 }, right: { x: 750, y: 440 }, center: { x: 500, y: 410 } }),
    viewDirection: () => ({ x: -.47, y: -.24, z: -.85 }) };
  const media = { matches: Boolean(options.reduced), addEventListener: (name, fn) => events.set(`media-${name}`, fn) };
  const window = { matchMedia: () => media, addEventListener: (name, fn) => events.set(name, fn),
    setTimeout(fn, delay) { const id = ++sequence; timers.set(id, { fn, delay }); return id; }, clearTimeout: (id) => timers.delete(id),
    requestAnimationFrame(fn) { const id = ++sequence; frames.set(id, fn); return id; }, cancelAnimationFrame: (id) => frames.delete(id), scrollTo() {} };
  const context = { ...motion, createDailyBoxHistory, document, window, location: { hostname: 'example.com', search: '' },
    ResizeObserver: options.resize === false ? undefined : class { observe() {} disconnect() {} }, dailyUndeadEntry: options.entry, performance: { now: () => 0 }, WebGL2RenderingContext: options.webgl === false ? undefined : class {},
    beforeBoxOpen: options.beforeOpen, onBoxOpen: options.onOpen, onBoxCancel: options.onCancel,
    URL, console: { warn() {} }, loadScene() { loads++; if (options.sceneFails) return Promise.reject(new Error('renderer unavailable'));
      if (options.slow) return new Promise((resolve) => { settleLoader = () => resolve({ createMysteryBoxScene: async () => visual }); });
      return Promise.resolve({ createMysteryBoxScene: async () => visual }); } };
  const source = readFileSync(new URL('../../js/mystery-box.js', import.meta.url), 'utf8')
    .replace(/^import[^\n]+\n/gm, '').replace('export function createMysteryBox', 'function createMysteryBox')
    .replaceAll('import.meta.url', JSON.stringify(new URL('../../js/mystery-box.js', import.meta.url).href))
    .replace(/import\('\.\/mystery-box-scene\.js\?v=[^']+'\)/g, 'loadScene()');
  vm.runInNewContext(source + '\nglobalThis.controller = createMysteryBox({ beforeOpen: beforeBoxOpen, onOpen: onBoxOpen, onCancel: onBoxCancel });', context);
  return { controller: context.controller, panel, stage, trigger, caption, intro, copy, icon, storage, values,
    get loads() { return loads; }, get draws() { return draws; }, get disposed() { return disposed; },
    open(extra = {}) { context.controller.open({ dateKey: '2026-10-19', type: 'word', official: true, fresh: true, storage, ...extra }); },
    flush: () => new Promise((resolve) => setImmediate(resolve)),
    ready() { settleLoader?.(); }, timeout(target = 1800) { for (const { fn, delay } of [...timers.values()]) if (delay === target) fn(); },
    frame(now) { const pending = [...frames.values()]; frames.clear(); for (const fn of pending) fn(now); },
    event(name, data = {}) { events.get(name)?.(data); }, loseContext() { stage.events.get('mystery-box-unavailable')?.({}); },
    get frameCount() { return frames.size; } };
}
