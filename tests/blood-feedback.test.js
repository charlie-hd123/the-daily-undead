import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { replayBloodTiesAttempts } from '../js/blood-ties-core.js';
import { bloodConnectionSound } from '../js/game-audio.js';

const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
function appFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const end = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, end < 0 ? undefined : end);
}
function fixture({ misses = 0, official = true, reducedMotion = false, failure = false } = {}) {
  const groups = Array.from({ length: 4 }, (_, i) => ({ id: String(i), name: `Group ${i}`, answers: [`${i}A`,`${i}B`,`${i}C`] }));
  const puzzle = { key: '2026-10-25:feedback', groups, tiles: groups.flatMap(g => g.answers) };
  const wrong = [['0A','0B','1A'],['0A','0C','1B'],['0B','0C','1C']];
  const attempts = failure ? wrong.slice(0,2) : [...wrong.slice(0,misses), ...groups.slice(0,3).map(g => g.answers)];
  const session = replayBloodTiesAttempts(puzzle, attempts);
  session.selected = failure ? wrong[2] : groups[3].answers;
  const calls = []; let submit;
  const context = vm.createContext({
    bloodPuzzle: puzzle, puzzle: { dateKey: '2026-10-25' }, replayBloodTiesAttempts, bloodConnectionSound,
    ensureSession: () => session, isOfficialPlay: () => official,
    activePlay: { mode: official ? 'official' : 'for_fun' }, dayState: {},
    puzzleStats: { blood: { plays: 0, solves: 0, score: 0 } }, streakCount: 1,
    app: { querySelector: selector => selector === '[data-count-to]' && session.complete && official ? {} : null },
    window: { matchMedia: () => ({ matches: reducedMotion }) },
    mysteryBox: { cancel() {} }, accountController: {}, isLocalPreview: false,
    renderBloodTiesView: options => { submit = options.onSubmit; },
    renderHeading() {}, renderResultAccountAction() { return ''; },
    areAllPuzzlesCompleted: () => false, renderNextRoundScreen: () => '',
    confirmAccountResultSubmission: () => true, recordMapResult: () => false,
    awardPoints() {}, recordDailyParticipation() {}, savePuzzleStats() {}, saveState() {},
    recordCommunityAttemptFor() {}, snapPageToTop() {}, animatePointTotal() {},
    updateNextRoundCountdown() {}, bindResultAccountAction() {}, focusAfterRender() {},
    gameAudio: {
      countPoints: (duration, options) => calls.push({ type: 'count', duration, options }),
      play: cue => calls.push({ type: 'play', cue }), reward: cue => calls.push({ type: 'reward', cue }),
    },
  });
  vm.runInContext(['playScoreCount','renderBloodPuzzle'].map(appFunction).join('\n'), context);
  context.renderBloodPuzzle();
  return { context, session, calls, submit: () => submit() };
}

test('fresh Blood Ties final submission plays its connection cue then counts with one flourish; restored results are silent', () => {
  for (const reducedMotion of [false,true]) {
    const f = fixture({ reducedMotion }); f.submit();
    assert.equal(f.session.points, 100);
    assert.equal(f.calls.length, 2);
    assert.deepEqual(f.calls[0], { type: 'play', cue: 'answer-lock' });
    assert.equal(f.calls[1].duration, reducedMotion ? 0 : 720);
    assert.equal(f.calls[1].options.reward, 'double-points-a');
    f.context.renderBloodPuzzle(); f.submit();
    assert.equal(f.calls.length, 2);
  }
});

test('lower-score, failed and just-for-fun Blood Ties results do not gain the 100-point flourish', () => {
  const lower = fixture({ misses: 1 }); lower.submit();
  assert.equal(lower.session.points, 90);
  assert.equal(lower.calls.length, 2);
  assert.deepEqual(lower.calls[0], { type: 'play', cue: 'answer-lock' });
  assert.equal(lower.calls[1].options.reward, undefined);
  const failed = fixture({ failure: true }); failed.submit();
  assert.equal(failed.session.success, false);
  assert.equal(failed.calls.length, 1);
  assert.equal(failed.calls[0].cue, 'run-ended');
  const fun = fixture({ official: false }); fun.submit();
  assert.equal(fun.session.success, true);
  assert.equal(fun.calls.length, 1);
  assert.deepEqual(fun.calls[0], { type: 'play', cue: 'answer-lock' });
});
