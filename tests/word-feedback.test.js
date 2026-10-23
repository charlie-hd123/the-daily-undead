import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { normalizeLetter, isWordSolved, calculateWordPoints } from '../js/word-puzzle-core.js';
import { letterSound } from '../js/game-audio.js';

const appSource = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
// Exercise the real application handlers with a minimal rendering boundary.
// The real ensureSession normalizes into a new object on each render/read.
function appFunction(name) {
  const start = appSource.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const end = appSource.indexOf('\nfunction ', start + 1);
  return appSource.slice(start, end < 0 ? undefined : end);
}

function fixture({ solved = false, official = true, reducedMotion = false, misses = 0 } = {}) {
  const calls = [];
  const initial = { key: '2026-10-29:ray-gun', guesses: solved ? [...['B','C','D','E'].slice(0,misses),'Y','G','U'] : ['B','C','D','E'], wrongGuesses: solved ? misses : 4 };
  const context = vm.createContext({
    pendingWordSounds: new WeakSet(), // Present only to reproduce the previous handler.
    activePlay: { type: 'word', mode: official ? 'official' : 'for_fun' },
    wordPuzzle: { key: initial.key, initialLetters: ['R','A'], entry: { answer: 'Ray Gun', category: 'Wonder Weapon' } },
    dayState: { sessions: { word: initial } }, puzzle: { dateKey: '2026-10-29' },
    window: { matchMedia: () => ({ matches: reducedMotion }) },
    normalizeLetter, isWordSolved, calculateWordPoints, letterSound,
    isOfficialPlay: () => official, confirmAccountResultSubmission: () => true,
    accountController: {}, saveState() {}, recordCommunityAttemptFor() {}, applyOfficialWordProgression() {}, renderWordResult() {},
    playScoreCount: points => calls.push({ type: 'legacy-count', points }),
    gameAudio: {
      play: (cue, options) => calls.push({ type: 'play', cue, options }),
      reward: cue => calls.push({ type: 'reward', cue }),
      countPoints: (duration, options) => calls.push({ type: 'count', duration, options }),
    },
  });
  context.renderWordPuzzle = () => context.ensureSession('word');
  vm.runInContext(['createWordSession','normalizeWordSession','ensureSession','getWordCompletionDelay','submitLetter','finishWordPuzzle'].map(appFunction).join('\n'), context);
  return { context, calls, initial };
}

test('fresh Last Words failure schedules its end cue before normalization replaces the session', () => {
  for (const reducedMotion of [false, true]) {
    const { context: app, calls, initial } = fixture({ reducedMotion });
    app.submitLetter('Q');
    assert.notEqual(app.dayState.sessions.word, initial);
    const end = calls.filter(c => c.cue === 'run-ended');
    assert.equal(end.length, 1);
    assert.equal(end[0].options.delay, reducedMotion ? 120 : 850);
    // Further renders and finishing the cloned session must not duplicate audio.
    app.ensureSession('word');
    app.finishWordPuzzle(app.dayState.sessions.word, false);
    assert.equal(calls.filter(c => c.cue === 'run-ended').length, 1);
  }
});

test('fresh word success schedules the accepted points cues for the visible result, despite session cloning', () => {
  for (const reducedMotion of [false, true]) {
    const { context: app, calls } = fixture({ solved: true, reducedMotion });
    app.submitLetter('N');
    assert.equal(calls.filter(c => c.cue === 'puzzle-solved-a').length, 1);
    const count = calls.filter(c => c.type === 'count');
    assert.equal(count.length, 1);
    assert.equal(count[0].duration, reducedMotion ? 0 : 720);
    assert.equal(count[0].options.delay, app.getWordCompletionDelay(true));
    assert.equal(count[0].options.reward, 'double-points-a');
    app.finishWordPuzzle(app.dayState.sessions.word, true);
    assert.equal(calls.filter(c => c.type === 'count' || c.type === 'legacy-count').length, 1);
  }
});

test('a fresh word solve below 100 keeps its count and solve sting without the maximum-score flourish', () => {
  const { context: app, calls } = fixture({ solved: true, misses: 1 });
  app.submitLetter('N');
  assert.equal(calls.filter(c => c.cue === 'puzzle-solved-a').length, 1);
  const counts = calls.filter(c => c.type === 'count');
  assert.equal(counts.length, 1);
  assert.equal(counts[0].options.reward, undefined);
});

test('restored word results remain silent and just-for-fun wins do not count points', () => {
  const restored = fixture();
  restored.context.finishWordPuzzle(restored.context.ensureSession('word'), false);
  assert.equal(restored.calls.length, 0);
  const fun = fixture({ solved: true, official: false });
  fun.context.submitLetter('N');
  assert.equal(fun.calls.filter(c => c.type === 'count').length, 0);
  assert.equal(fun.calls.filter(c => c.cue === 'puzzle-solved-a').length, 1);
});
