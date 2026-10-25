import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createGameAudio, initialiseGameAudio, letterSound, bloodConnectionSound, SOUND_CUES, SOUND_PREFERENCE_KEY } from '../js/game-audio.js';

function fixture({ muted = false, unavailable = false, fetchAudio, decode, loadTimeoutMs } = {}) {
  let time = 0, hidden = false;
  const values = new Map(muted ? [[SOUND_PREFERENCE_KEY, 'false']] : []), starts = [], stopped = [];
  const context = {
    state: 'suspended', currentTime: 10, destination: {},
    resume() { this.state = 'running'; return Promise.resolve(); },
    decodeAudioData: decode || (async () => ({ duration: 3.5 })),
    createBufferSource() {
      return { connect() {}, disconnect() {}, start(at, offset) { starts.push({ at, offset, buffer: this.buffer }); },
        stop(at) { stopped.push(at); this.onended?.(); } };
    },
    createGain() { return { gain: { value: 1, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} }; },
  };
  const calls = [];
  const platform = {
    storage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) },
    AudioContext: unavailable ? null : class { constructor() { return context; } },
    fetchAudio: fetchAudio || (async url => { calls.push(String(url)); return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) }; }),
    now: () => time, isHidden: () => hidden,
    ...(loadTimeoutMs === undefined ? {} : { loadTimeoutMs }),
  };
  const audio = createGameAudio(platform);
  return { audio, platform, context, calls, starts, stopped, values, advance: value => { time += value; }, hide: value => { hidden = value; } };
}

test('no autoplay; accepted interaction unlocks warmed audio and schedules at the requested cue', async () => {
  const f = fixture(); await f.audio.prepare();
  assert.equal(await f.audio.play('mystery-box-a'), false);
  assert.equal(f.starts.length, 0);
  f.audio.unlock();
  assert.equal(await f.audio.play('mystery-box-a'), true);
  assert.equal(await f.audio.play('double-points-a', { delay: 1450 }), true);
  assert.equal(f.starts[0].at, 10);
  assert.equal(f.starts[1].at, 11.45);
});

test('the first box cue waits for an asynchronous browser audio resume', async () => {
  const f = fixture(); await f.audio.prepare();
  let resume;
  f.context.resume = () => new Promise(resolve => {
    resume = () => { f.context.state = 'running'; resolve(); };
  });
  f.audio.unlock();
  const firstTap = f.audio.play('mystery-box-a');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.starts.length, 0);
  resume();
  assert.equal(await firstTap, true);
  assert.equal(f.starts.length, 1);
});

test('touch-end and click can unlock first-tap audio when pointerdown is denied', async () => {
  for (const gesture of ['touchend', 'click']) {
    const f = fixture();
    let allowed = false;
    f.context.resume = () => {
      if (!allowed) return Promise.reject(new Error('gesture not accepted'));
      f.context.state = 'running'; return Promise.resolve();
    };
    const handlers = new Map();
    const document = { querySelector: () => null, addEventListener: (name, fn, options) => handlers.set(name, { fn, options }) };
    const audio = initialiseGameAudio(f.platform.storage, document, { addEventListener() {} }, f.platform);
    await audio.prepare();
    handlers.get('pointerdown').fn({ isTrusted: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(await audio.ready('mystery-box-a'), false);
    allowed = true;
    assert.equal(handlers.get(gesture).options.capture, true);
    handlers.get(gesture).fn({ isTrusted: true });
    assert.equal(await audio.ready('mystery-box-a'), true);
    assert.equal(await audio.play('mystery-box-a'), true);
  }
});

test('muting during an asynchronous resume still cancels the first pending cue', async () => {
  const f = fixture(); await f.audio.prepare();
  let resume;
  f.context.resume = () => new Promise(resolve => { resume = () => { f.context.state = 'running'; resolve(); }; });
  f.audio.unlock(); const pending = f.audio.play('mystery-box-a');
  f.audio.setEnabled(false); resume();
  assert.equal(await pending, false); assert.equal(f.starts.length, 0);
});

test('muting cancels active/future sounds and persists across instances', async () => {
  const f = fixture(); f.audio.unlock(); await f.audio.prepare();
  await f.audio.play('double-points-a', { delay: 1100 });
  f.audio.setEnabled(false);
  assert.equal(f.stopped.length, 1);
  assert.equal(f.values.get(SOUND_PREFERENCE_KEY), 'false');
  assert.equal(await f.audio.play('letter-correct'), false);
  const muted = fixture({ muted: true }); await muted.audio.prepare();
  assert.equal(muted.calls.length, 0);
  muted.audio.unlock(); assert.equal(muted.context.state, 'suspended');
});

test('in-flight loading cannot resurrect a muted or navigated-away cue', async () => {
  for (const cancel of [audio => audio.setEnabled(false), audio => audio.stopAll(), audio => audio.stopCue('mystery-box-a')]) {
    let ready;
    const gate = new Promise(resolve => { ready = resolve; });
    const f = fixture({ fetchAudio: async () => { await gate; return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) }; } });
    f.audio.unlock();
    const pending = f.audio.play('mystery-box-a');
    cancel(f.audio); ready();
    assert.equal(await pending, false);
    assert.equal(f.starts.length, 0);
  }
});

test('background tabs, unavailable audio, bad assets and stale downloads stay silent without throwing', async () => {
  const unsupported = fixture({ unavailable: true }); unsupported.audio.unlock();
  assert.deepEqual(await unsupported.audio.prepare(), []);
  assert.equal(await unsupported.audio.play('letter-correct'), false);
  const missing = fixture({ fetchAudio: async () => { throw new Error('offline'); } });
  missing.audio.unlock(); await missing.audio.prepare();
  assert.equal(await missing.audio.play('letter-correct'), false);
  const f = fixture(); f.audio.unlock(); await f.audio.prepare(); f.hide(true);
  assert.equal(await f.audio.play('letter-correct'), false);
  let ready; const gate = new Promise(resolve => { ready = resolve; });
  const slow = fixture({ fetchAudio: async () => { await gate; return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) }; } });
  slow.audio.unlock(); const pending = slow.audio.play('letter-correct'); slow.advance(400); ready();
  assert.equal(await pending, false);
});

test('small AAC transfers are primary, with WAV fallback if that format fails', async () => {
  const requested = [];
  const f = fixture({ fetchAudio: async url => ({ ok: true, arrayBuffer: async () => ({ filename: String(url) }) }),
    decode: async bytes => { requested.push(bytes.filename); if (bytes.filename.endsWith('.m4a')) throw new Error('AAC unavailable'); return { duration: .5 }; } });
  f.audio.unlock(); await f.audio.prepare();
  assert.equal(await f.audio.play('letter-correct'), true);
  const correct = requested.filter(name => name.includes('/letter-correct-'));
  assert.equal(correct.length, 2);
  assert.ok(correct[0].endsWith('.m4a')); assert.ok(correct[1].endsWith('.wav'));
});

test('warmed sounds start synchronously before a slow puzzle render can delay or discard them', async () => {
  const f = fixture(); f.audio.unlock(); await f.audio.prepare();
  const pending = f.audio.play('letter-correct');
  assert.equal(f.starts.length, 1, 'source is scheduled within the event handler');
  f.advance(400); // A synchronous render after play() blocks the next microtask.
  assert.equal(await pending, true);
  assert.equal(f.starts[0].offset, 0);
});

test('a short cold cue keeps its attack rather than being truncated after a brief download wait', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = fixture({ fetchAudio: async () => { await gate; return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) }; },
    decode: async () => ({ duration: .075 }) });
  f.audio.unlock(); const pending = f.audio.play('points-tick');
  f.advance(120); release();
  assert.equal(await pending, true);
  assert.equal(f.starts.length, 1); assert.equal(f.starts[0].offset, 0);
});

test('temporary failures retry on a later interaction without hammering the network', async () => {
  let online = false, requests = 0;
  const f = fixture({ fetchAudio: async () => { requests++; if (!online) throw new Error('offline'); return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) }; } });
  f.audio.unlock(); await f.audio.prepare();
  const failedRequests = requests;
  online = true;
  assert.equal(await f.audio.play('letter-correct'), false);
  assert.equal(requests, failedRequests);
  f.advance(1001); f.audio.unlock();
  assert.equal(await f.audio.play('letter-correct'), true);
  assert.ok(requests > failedRequests);
});

test('stalled requests time out, abort and allow a later successful retry', async () => {
  let stalled = true;
  const signals = [];
  const f = fixture({ loadTimeoutMs: 10, fetchAudio: async (_url, { signal }) => {
    signals.push(signal);
    if (stalled) return new Promise(() => {});
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
  } });
  f.audio.unlock(); await f.audio.prepare();
  assert.ok(signals.length > 0 && signals.every(signal => signal.aborted));
  stalled = false; f.advance(1001);
  assert.equal(await f.audio.play('map-select'), true);
});

test('cold count ticks that have missed their slot do not bunch up on a slow connection', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = fixture({ fetchAudio: async () => { await gate; return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) }; } });
  f.audio.unlock(); f.audio.countPoints(720);
  f.advance(600); release(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.starts.length, 1, 'only the finishing ping is still ahead of its intended time');
  assert.equal(f.starts[0].at, 10.12);
});

test('resuming an interrupted context and replacing a closed context both restore playback', async () => {
  const f = fixture(); f.audio.unlock(); await f.audio.prepare();
  f.context.state = 'interrupted'; f.audio.unlock();
  assert.equal(await f.audio.play('letter-correct'), true);
  const downloads = f.calls.length;
  f.context.state = 'closed'; f.audio.unlock();
  assert.equal(await f.audio.play('letter-correct'), true);
  assert.equal(f.starts.length, 2);
  assert.equal(f.calls.length, downloads, 'context recovery reuses decoded buffers without another download');
});

test('returning online retries failed audio immediately and visible-page recovery resumes warmed audio', async () => {
  let online = false;
  const f = fixture({ fetchAudio: async () => { if (!online) throw new Error('offline'); return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) }; } });
  f.audio.unlock(); await f.audio.prepare();
  online = true; f.audio.recover({ online: true }); await f.audio.prepare();
  assert.equal(await f.audio.play('map-select'), true);
  f.context.state = 'suspended'; f.audio.recover();
  assert.equal(await f.audio.play('letter-correct'), true);
  f.audio.setEnabled(false); f.audio.recover({ online: true });
  assert.equal(await f.audio.play('letter-correct'), false);
});

test('visibility and page restoration recover Safari audio without replaying background cues', async () => {
  const f = fixture(), handlers = new Map(), windowHandlers = new Map();
  const document = { hidden: false, querySelector: () => null, addEventListener: (name, fn) => handlers.set(name, fn) };
  const audio = initialiseGameAudio(f.platform.storage, document, { addEventListener: (name, fn) => windowHandlers.set(name, fn) }, f.platform);
  await audio.prepare(); audio.unlock(); await audio.play('points-finish', { delay: 720 });
  document.hidden = true; handlers.get('visibilitychange')();
  assert.equal(f.stopped.length, 1);
  f.context.state = 'interrupted'; document.hidden = false; handlers.get('visibilitychange')();
  assert.equal(await audio.play('letter-correct'), true);
  assert.equal(f.starts.length, 2, 'the old finishing cue is not replayed');
  f.context.state = 'closed'; windowHandlers.get('pageshow')();
  assert.equal(await audio.play('map-select'), true);
  assert.equal(f.starts.length, 3);
  audio.setEnabled(false); windowHandlers.get('online')();
  assert.equal(await audio.play('map-select'), false);
});

test('puzzle navigation gets one click; dedicated cues, site controls and disabled controls stay silent', async () => {
  const f = fixture(), handlers = new Map();
  const document = { querySelector: () => null, addEventListener: (name, fn) => handlers.set(name, fn) };
  const audio = initialiseGameAudio(f.platform.storage, document, { addEventListener() {} }, f.platform);
  await audio.prepare();
  const click = (selector, { disabled = false, trusted = true } = {}) => {
    const button = { disabled, getAttribute: () => null,
      matches: selectors => selectors.split(',').map(s => s.trim()).includes(selector) };
    handlers.get('click')({ isTrusted: trusted, type: 'click', target: { closest: () => button } });
  };
  click('#back-to-clues'); audio.stopAll(); // The real navigation cleanup happens in the target handler.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.starts.length, 1);
  click('#lock-answer'); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.starts.length, 2);
  for (const selector of ['[data-letter]', '[data-bonus-step-id]', '[data-blood-tile]', '#blood-submit', '#mb-open-trigger', '#sound-toggle', '#reveal-clue', '#confirm-map', '#submit-order',
    '#account-button', '#leaderboards-button', '[role="tab"]', '[data-stat-explainer]', '#share-score', '#result-account-action', '.dialog-close', '[data-account-action]', '[data-close-account-dialog]', '[data-leaderboard-find]', 'button']) click(selector);
  click('#back-to-clues', { disabled: true }); click('#back-to-clues', { trusted: false });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.starts.length, 2);
  for (const selector of ['[data-card-action]', '[data-see-result]', '[data-game-id]', '[data-map-id]', '#back-to-games', '#return-to-puzzle-home', '#continue-after-missed-day', '#blood-shuffle', '#blood-clear']) click(selector);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.starts.length, 11);
});

test('removed heartbeat and highest-round cues cannot be scheduled', async () => {
  const f = fixture(); f.audio.unlock(); await f.audio.prepare();
  assert.equal(await f.audio.play('last-miss-warning'), false);
  assert.equal(await f.audio.play('highest-round'), false);
  assert.equal(f.starts.length, 0);
});

test('score ticks are bounded to the 720ms animation, with one final ping; reduced motion uses only the ping', async () => {
  const f = fixture(); f.audio.unlock(); await f.audio.prepare();
  f.audio.countPoints(720); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.starts.length, 8);
  assert.deepEqual(f.starts.map(s => s.at), [10,10.09,10.18,10.27,10.36,10.45,10.54,10.72]);
  f.audio.stopAll(); assert.equal(f.stopped.length, 8);
  f.audio.countPoints(0); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.starts.length, 9);
});

test('letter progression caps its motif and a completed answer gets a single solve cue', () => {
  assert.equal(letterSound({ correct: false }), 'letter-wrong');
  assert.equal(letterSound({ correct: true, streak: 1 }), 'letter-correct');
  assert.equal(letterSound({ correct: true, streak: 2 }), 'letter-streak-2');
  assert.equal(letterSound({ correct: true, streak: 12 }), 'letter-streak-4');
  assert.equal(letterSound({ correct: true, solved: true, streak: 3 }), 'puzzle-solved-a');
});

test('Blood Ties gives the fourth correct connection the same cue and keeps failure feedback', async () => {
  const f = fixture(); f.audio.unlock(); await f.audio.prepare();
  for (let connection = 1; connection <= 4; connection++) {
    const cue = bloodConnectionSound({ correct: true, complete: connection === 4 });
    assert.equal(cue, 'answer-lock');
    assert.equal(await f.audio.play(cue), true);
  }
  assert.equal(f.starts.length, 4);
  f.audio.countPoints(720, { reward: 'double-points-a' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.starts.length, 13);
  assert.equal(f.stopped.length, 0); // The result count must preserve the final connection cue.
  assert.equal(bloodConnectionSound({ correct: false, complete: false }), 'letter-wrong');
  assert.equal(bloodConnectionSound({ correct: false, complete: true }), 'run-ended');
});

test('bonus flourish follows the settled points and finishing ping, including reduced motion', async () => {
  for (const duration of [720, 0]) {
    const f = fixture({
      fetchAudio: async url => ({ ok: true, arrayBuffer: async () => ({ filename: String(url) }) }),
      decode: async bytes => ({ duration: SOUND_CUES['points-finish'].duration, filename: bytes.filename }),
    });
    f.audio.unlock(); await f.audio.prepare();
    f.audio.countPoints(duration, { reward: 'double-points-a' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.starts.length, duration ? 9 : 2);
    const ping = f.starts.at(-2), flourish = f.starts.at(-1);
    assert.ok(ping.buffer.filename.includes('/points-finish-'));
    assert.ok(flourish.buffer.filename.includes('/double-points-a-'));
    assert.ok(flourish.at > ping.at + ping.buffer.duration);
    assert.ok(flourish.at >= 10 + duration / 1000);
    f.audio.setEnabled(false);
    assert.equal(f.stopped.length, f.starts.length);
  }
});

test('delayed word-result counts align with the result and are cancelled by navigation or mute', async () => {
  for (const cancel of [audio => audio.stopAll(), audio => audio.setEnabled(false)]) {
    const f = fixture(); f.audio.unlock(); await f.audio.prepare();
    f.audio.countPoints(720, { delay: 1900 });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.starts.length, 8);
    assert.ok(Math.abs(f.starts[0].at - 11.9) < .0001);
    assert.ok(Math.abs(f.starts[7].at - 12.62) < .0001);
    cancel(f.audio); assert.equal(f.stopped.length, 8);
  }
});

test('the delayed maximum-score flourish preserves the immediate solve sting and replaces only duplicate count feedback', async () => {
  const f = fixture(); f.audio.unlock(); await f.audio.prepare();
  await f.audio.reward('puzzle-solved-a');
  f.audio.countPoints(720, { delay: 1900, reward: 'double-points-a' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.starts.length, 10);
  assert.equal(f.stopped.length, 0);
  const finishWait = Math.max(500, Math.ceil(SOUND_CUES['points-finish'].duration * 1000) + 70);
  assert.ok(Math.abs(f.starts.at(-1).at - (12.62 + finishWait / 1000)) < .000001);
  f.audio.countPoints(720, { delay: 1900, reward: 'double-points-a' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.stopped.length, 9); // Seven ticks, finishing ping and old flourish.
  f.audio.stopAll();
  assert.equal(f.stopped.length, 19);
});

test('every deployed cue has content-matching lossless WAV and AAC exports matching the review manifest', async () => {
  assert.equal(Object.keys(SOUND_CUES).length, 17);
  const manifest = JSON.parse(await readFile(new URL('../assets/audio/manifest.json', import.meta.url)));
  assert.deepEqual(manifest.cues, SOUND_CUES);
  for (const [cue, { files, gain }] of Object.entries(SOUND_CUES)) {
    const metadata = manifest.sounds.find(sound => sound.id === cue);
    assert.ok(gain > 0 && gain <= 1);
    assert.ok(files[0].endsWith('.wav'));
    for (const filename of files) {
      const bytes = await readFile(new URL(`../assets/audio/${filename}`, import.meta.url));
      assert.ok(bytes.length > 44);
      assert.ok(filename.includes(createHash('sha256').update(bytes).digest('hex').slice(0,10)));
      if (filename.endsWith('.wav')) {
        assert.equal(bytes.readUInt16LE(22), metadata.channels);
        assert.equal(bytes.readUInt32LE(24), metadata.sample_rate);
        assert.equal(bytes.readUInt16LE(34), 16);
        assert.ok(Math.abs(bytes.readUInt32LE(40) / (metadata.channels * 2 * metadata.sample_rate) - metadata.duration) < .000001);
      }
    }
  }
});
