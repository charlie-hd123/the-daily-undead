import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const source = app.slice(app.indexOf('function initialiseProfileScrollbars() {'), app.indexOf('\nfunction createInitialState()'));

function fixture({ viewport = 200, content = 1000, trackWidth = 200 } = {}) {
  const handlers = {}, attributes = {}, classes = new Set(), captured = new Set();
  const picker = {
    clientWidth: viewport, scrollWidth: content, scrollLeft: 0,
    style: { scrollSnapType: '' },
    firstElementChild: { getBoundingClientRect: () => ({ width: 80 }) },
    addEventListener(name, handler) { this[name] = handler; },
  };
  const thumb = { style: {}, getBoundingClientRect: () => ({ left: 10 + picker.scrollLeft / (content - viewport) * (trackWidth - parseFloat(thumb.style.width)) }) };
  const track = {
    clientWidth: trackWidth, previousElementSibling: picker, firstElementChild: thumb,
    setAttribute(name, value) { attributes[name] = value; },
    addEventListener(name, handler) { handlers[name] = handler; },
    getBoundingClientRect: () => ({ left: 10 }),
    classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
    focus() {},
    setPointerCapture: id => captured.add(id),
    hasPointerCapture: id => captured.has(id),
    releasePointerCapture: id => captured.delete(id),
  };
  vm.runInNewContext(source + '\ninitialiseProfileScrollbars();', {
    document: { querySelectorAll: () => [track] },
    ResizeObserver: class { observe() {} }, MutationObserver: class { observe() {} },
    getComputedStyle: () => ({ columnGap: '10px' }),
  });
  function fire(name, values = {}) {
    const event = { isPrimary: true, button: 0, pointerId: 1, clientX: 30, target: thumb,
      preventDefault() { this.prevented = true; }, ...values };
    handlers[name](event);
    return event;
  }
  return { picker, track, thumb, attributes, classes, captured, fire };
}

test('dragging the thumb preserves its grab point, moves the picker and clamps at both ends', () => {
  const f = fixture();
  f.picker.scrollLeft = 200;
  f.picker.scroll();
  f.fire('pointerdown', { clientX: 60 });
  assert.equal(f.picker.scrollLeft, 200);
  assert.equal(f.picker.style.scrollSnapType, 'none');
  assert.ok(f.captured.has(1));
  f.fire('pointermove', { clientX: 100 });
  assert.equal(f.picker.scrollLeft, 400);
  assert.equal(f.attributes['aria-valuenow'], '50');
  f.fire('pointermove', { clientX: 900 });
  assert.equal(f.picker.scrollLeft, 800);
  f.fire('pointermove', { clientX: -100 });
  assert.equal(f.picker.scrollLeft, 0);
  f.fire('pointerup');
  assert.equal(f.picker.style.scrollSnapType, '');
  assert.equal(f.captured.size, 0);
  assert.equal(f.classes.size, 0);
});

test('clicking the track centres the thumb at the pointer', () => {
  const f = fixture();
  f.fire('pointerdown', { target: f.track, clientX: 110 });
  assert.equal(f.picker.scrollLeft, 400);
  f.fire('pointerup');
  assert.equal(f.attributes['aria-valuenow'], '50');
});

test('pointer cancellation or lost capture restores snapping and ends the drag', () => {
  for (const event of ['pointercancel', 'lostpointercapture']) {
    const f = fixture();
    f.picker.style.scrollSnapType = 'inline proximity';
    f.fire('pointerdown');
    f.fire(event);
    f.fire('pointermove', { clientX: 100 });
    assert.equal(f.picker.scrollLeft, 0);
    assert.equal(f.picker.style.scrollSnapType, 'inline proximity');
    assert.equal(f.captured.size, 0);
  }
});

test('keyboard controls scroll a choice, a page, or to either end without selecting a profile option', () => {
  const f = fixture();
  assert.equal(f.fire('keydown', { key: 'ArrowRight' }).prevented, true);
  assert.equal(f.picker.scrollLeft, 90);
  f.fire('keydown', { key: 'ArrowLeft' });
  assert.equal(f.picker.scrollLeft, 0);
  f.fire('keydown', { key: 'PageDown' });
  assert.equal(f.picker.scrollLeft, 200);
  f.fire('keydown', { key: 'End' });
  assert.equal(f.picker.scrollLeft, 800);
  f.fire('keydown', { key: 'PageUp' });
  assert.equal(f.picker.scrollLeft, 600);
  f.fire('keydown', { key: 'Home' });
  assert.equal(f.picker.scrollLeft, 0);
  assert.equal(f.fire('keydown', { key: 'Tab' }).prevented, undefined);
});

test('non-primary pointers and right clicks do not start dragging; non-overflowing pickers are inert', () => {
  const f = fixture();
  f.fire('pointerdown', { button: 2 });
  f.fire('pointerdown', { isPrimary: false });
  assert.equal(f.captured.size, 0);
  const fitting = fixture({ content: 200 });
  assert.equal(fitting.attributes['aria-disabled'], 'true');
  assert.equal(fitting.track.tabIndex, -1);
  fitting.fire('pointerdown');
  fitting.fire('keydown', { key: 'End' });
  assert.equal(fitting.picker.scrollLeft, 0);
  assert.equal(fitting.captured.size, 0);
});
