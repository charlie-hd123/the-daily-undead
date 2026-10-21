import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { calculateBonusPoints } from '../js/game-core.js';

const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
function appFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const end = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, end < 0 ? undefined : end);
}
function fixture({ official = true, reducedMotion = false } = {}) {
  const calls = [];
  const context = vm.createContext({
    state: { mapPoints: 50, bonusPointsRecorded: false }, dayState: {},
    activePlay: { mode: official ? 'official' : 'for_fun' }, bonusSubmissionPending: true,
    puzzleStats: { easter: { score: 0 } }, calculateBonusPoints,
    app: { querySelector: () => official ? {} : null },
    window: { matchMedia: () => ({ matches: reducedMotion }) },
    awardPoints() {}, savePuzzleStats() {},
    gameAudio: {
      countPoints: (duration, options) => calls.push({ type: 'count', duration, options }),
      reward: cue => calls.push({ type: 'reward', cue }),
    },
  });
  context.setState = update => { context.state = { ...context.state, ...update }; };
  vm.runInContext(['playScoreCount', 'finaliseBonusSubmission'].map(appFunction).join('\n'), context);
  return { context, calls };
}

test('a fresh Double Points result counts first and requests the reward as the ending of that sequence', () => {
  for (const reducedMotion of [false, true]) {
    const { context, calls } = fixture({ reducedMotion });
    context.finaliseBonusSubmission(true, true);
    assert.equal(context.state.points, 100);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].type, 'count');
    assert.equal(calls[0].duration, reducedMotion ? 0 : 720);
    assert.equal(calls[0].options.reward, 'double-points-a');
  }
});

test('failed bonus has no flourish; unscored play preserves the immediate reward without a nonexistent score count', () => {
  const failed = fixture(); failed.context.finaliseBonusSubmission(true, false);
  assert.equal(failed.calls.length, 1);
  assert.equal(failed.calls[0].type, 'count');
  assert.equal(failed.calls[0].options.reward, undefined);
  const fun = fixture({ official: false }); fun.context.finaliseBonusSubmission(false, true);
  assert.equal(fun.calls.length, 1);
  assert.equal(fun.calls[0].type, 'reward');
  assert.equal(fun.calls[0].cue, 'double-points-a');
});
