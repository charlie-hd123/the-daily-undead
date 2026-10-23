import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir } from 'node:fs/promises';
import { bloodTiesCatalogue } from '../js/blood-ties-catalogue.js';
import { bloodTiesCatalogue as historicalCatalogue } from '../js/blood-ties-catalogue-v1.js';
import { buildDailyBloodTiesPuzzle, countBloodTiesSolutions, createBloodTiesSession, normalizeBloodTiesSession, replayBloodTiesAttempts } from '../js/blood-ties-core.js';
import { getOfficialPuzzleType } from '../js/daily-challenge-core.js';
import { recordVerifiedBloodResult, recordVerifiedWordResult, recordVerifiedMapResult, sanitizeDailyState, getAccount } from '../worker/src/accounts.js';
import { buildDailyWordPuzzle } from '../js/word-puzzle-core.js';
import { buildDailyPuzzle } from '../js/game-core.js';
import { workerWords } from '../worker/src/generated-word-catalog.js';
import { workerMaps } from '../worker/src/generated-map-catalog.js';
import { readLeaderboards } from '../worker/src/leaderboards.js';
import { puzzleOptions } from '../worker/src/puzzle-environment.js';
import { replaySavedAccountResult } from '../js/account.js';
import { renderBloodTiesGroup, renderBloodTiesView } from '../js/blood-ties-view.js';
import worker from '../worker/src/index.js';

const puzzle = () => buildDailyBloodTiesPuzzle('2026-10-22');
const wrongs = (p) => [[p.groups[0].answers[0], p.groups[1].answers[0], p.groups[2].answers[0]],
  [p.groups[0].answers[1], p.groups[1].answers[1], p.groups[2].answers[1]],
  [p.groups[0].answers[2], p.groups[1].answers[2], p.groups[2].answers[2]]];
const solution = (p) => p.groups.map((g) => g.answers);
const interruptedSolution = (p) => [...p.groups.slice(0, 3).flatMap((g, i) => [
  [g.answers[0], g.answers[1], p.groups[i + 1].answers[0]],
  [g.answers[0], g.answers[1], p.groups[i + 1].answers[1]],
  g.answers,
]), p.groups[3].answers];

test('Blood Ties renders three strike circles, mode warnings and truthful result/reveal labels', () => {
  const p = puzzle();
  const render = (session, official = true, flashStrikes = false) => {
    const app = { innerHTML: '', querySelectorAll: () => [], querySelector: () => null };
    renderBloodTiesView({ app, puzzle: p, session, official, flashStrikes, developer: false, heading: () => '', onSave() {}, onSubmit() {}, onSound() {} });
    return app.innerHTML;
  };
  const active = render(replayBloodTiesAttempts(p, [wrongs(p)[0]]));
  assert.match(active, /<span>Strikes<\/span>/);
  assert.match(active, /aria-label="1 of 3 strikes"/);
  assert.equal((active.match(/<i class="is-active"/g) || []).length, 1);
  assert.match(active, /Potential score<\/span><strong>90/);
  assert.match(active, /blood-status is-miss/);
  const cleared = render(replayBloodTiesAttempts(p, interruptedSolution(p).slice(0, 3)), true, true);
  assert.match(cleared, /blood-strike-circles is-clearing/);
  assert.match(cleared, /aria-label="0 of 3 strikes"/);
  assert.match(cleared, /Potential score<\/span><strong>80/);
  assert.doesNotMatch(cleared, /<i class="is-active"/);
  const fun = render(createBloodTiesSession(p), false);
  assert.match(fun, /Playing just for fun\. This result will not change your stats/);
  assert.doesNotMatch(fun, /Potential score/);
  const finalTiles = render(replayBloodTiesAttempts(p, solution(p).slice(0, 3)));
  assert.equal((finalTiles.match(/data-blood-tile=/g) || []).length, 3);
  assert.equal((finalTiles.match(/· Found/g) || []).length, 3);
  assert.doesNotMatch(finalTiles, /· Revealed|Round Survived|revealed automatically/);
  assert.match(finalTiles, /3 \/ 4 connections found/);
  const won = render(replayBloodTiesAttempts(p, solution(p)));
  assert.equal((won.match(/· Found/g) || []).length, 4);
  assert.equal((won.match(/· Revealed/g) || []).length, 0);
  assert.match(won, /Round Survived!/);
  const lost = render({ ...replayBloodTiesAttempts(p, wrongs(p)), roundsSurvivedBeforeLoss: 8 });
  assert.match(lost, /Your run ended at <strong>Round 8/);
  assert.equal((lost.match(/· Revealed/g) || []).length, 4);
  assert.doesNotMatch(lost, /Round score/);
  assert.match(renderBloodTiesGroup({ name: '<script>', answers: ['A & B'], definition: '<img>' }, 0), /&lt;script&gt;/);
});

test('the final first worksheet replaces the active database with 164 connections', () => {
  assert.equal(bloodTiesCatalogue.worksheet, 'Blood Ties');
  assert.equal(bloodTiesCatalogue.connections.length, 164);
  assert.equal(new Set(bloodTiesCatalogue.connections.map((g) => g.id)).size, 164);
  assert.equal(bloodTiesCatalogue.version, 2);
  assert.equal(new Set(bloodTiesCatalogue.connections.flatMap(g => g.tiles)).size, 477);
  assert.match(bloodTiesCatalogue.sourceSha256, /^[a-f0-9]{64}$/);
  for (const g of bloodTiesCatalogue.connections) assert.ok(g.tiles.length >= 3);
});

test('a full year has deterministic unique solutions, deliberate traps and three-day category/tile cooldowns', () => {
  const history = [];
  for (let day = 0; day < 366; day++) {
    const date = new Date(Date.UTC(2026, 9, 1 + day)).toISOString().slice(0, 10);
    const p = buildDailyBloodTiesPuzzle(date);
    assert.equal(p.tiles.length, 12); assert.equal(new Set(p.tiles).size, 12);
    assert.equal(countBloodTiesSolutions(p.groups.map((g) => ({ tiles: g.eligibleTiles })), p.tiles), 1, date);
    assert.ok(p.redHerrings.length >= 2, date);
    for (const g of p.groups) {
      const source = (date < '2026-10-23' ? historicalCatalogue : bloodTiesCatalogue).connections.find((c) => c.id === g.id);
      assert.ok(g.answers.every((tile) => source.tiles.includes(tile)));
    }
    for (const previous of history.slice(-3)) {
      if (date < '2026-10-23' || previous.dateKey >= '2026-10-23') assert.ok(p.groups.every((g) => !previous.groups.some((before) => before.id === g.id)), date);
      if (date < '2026-10-23' || previous.dateKey >= '2026-10-22') assert.ok(p.tiles.every((tile) => !previous.tiles.includes(tile)), date);
    }
    history.push(p);
  }
  // Calling dates out of sequence or mutating the returned board cannot alter assignments.
  const frozen = JSON.stringify(puzzle()); const p = puzzle(); p.groups[0].answers.reverse(); p.tiles.reverse();
  assert.equal(JSON.stringify(puzzle()), frozen);
  assert.throws(() => buildDailyBloodTiesPuzzle('2026-02-30'), /valid UTC date/);
});

test('exact cover rejects two complete solutions, without counting solve order as ambiguity', () => {
  const tiles = Array.from({ length: 12 }, (_, i) => String(i));
  const groups = Array.from({ length: 4 }, (_, i) => ({ tiles: tiles.slice(i * 3, i * 3 + 3) }));
  assert.equal(countBloodTiesSolutions(groups, tiles), 1);
  groups[0].tiles.push('3'); groups[1].tiles.push('0');
  assert.equal(countBloodTiesSolutions(groups, tiles), 2);
  assert.equal(countBloodTiesSolutions(groups, [...tiles.slice(1), '1']), 0);
});

test('all four trios must be submitted; every incorrect submission deducts ten points', () => {
  const p = puzzle();
  for (const [misses, score] of [[0, 100], [1, 90], [2, 80]]) {
    const result = replayBloodTiesAttempts(p, [...wrongs(p).slice(0, misses), ...solution(p)]);
    assert.equal(result.complete, true); assert.equal(result.success, true);
    assert.equal(result.points, score); assert.equal(result.solved.length, 4);
    assert.equal(result.strikes, 0); assert.equal(result.potentialPoints, score);
  }
  const final = replayBloodTiesAttempts(p, solution(p).slice(0, 3));
  assert.equal(final.complete, false); assert.equal(final.points, 0);
  assert.equal(final.solved.length, 3);
  const restored = normalizeBloodTiesSession(p, { ...final, selected: p.groups[3].answers });
  assert.equal(restored.complete, false); assert.deepEqual(restored.selected, p.groups[3].answers);
  assert.match(replayBloodTiesAttempts(p, [wrongs(p)[0]]).message, /don’t match this puzzle’s connections/);
  const failed = replayBloodTiesAttempts(p, wrongs(p));
  assert.equal(failed.complete, true); assert.equal(failed.success, false); assert.equal(failed.points, 0);
  assert.throws(() => replayBloodTiesAttempts(p, [wrongs(p)[0], [...wrongs(p)[0]].reverse()]), /Invalid/);
  assert.throws(() => replayBloodTiesAttempts(p, [...solution(p), wrongs(p)[0]]), /Invalid/);
  assert.throws(() => replayBloodTiesAttempts(p, [[p.tiles[0], p.tiles[0], p.tiles[1]]]), /Invalid/);
  assert.throws(() => replayBloodTiesAttempts(p, [p.groups[0].answers, [p.groups[0].answers[0], ...p.groups[1].answers.slice(0, 2)]]), /Invalid/);
});

test('restores replay the history, remove forged points and preserve unfinished selection', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-22T12:00:00Z') });
  const p = puzzle();
  const raw = { ...createBloodTiesSession(p), attempts: [p.groups[0].answers], selected: p.groups[1].answers, complete: true, points: 9999, misses: 0 };
  const restored = normalizeBloodTiesSession(p, raw);
  assert.equal(restored.complete, false); assert.equal(restored.points, 0);
  assert.deepEqual(restored.selected, p.groups[1].answers);
  const saved = sanitizeDailyState({ dayStateVersion: 1, dateKey: p.dateKey, officialType: 'blood', sessions: { blood: raw } }, p.dateKey);
  assert.equal(saved.sessions.blood.complete, false);
  assert.equal(normalizeBloodTiesSession(p, { ...raw, key: 'stale' }), null);
});

test('correct groups reset strikes without restoring points; six total misses can still solve', () => {
  const p = puzzle(), attempts = interruptedSolution(p);
  for (const count of [3, 6]) {
    const s = replayBloodTiesAttempts(p, attempts.slice(0, count));
    assert.equal(s.strikes, 0); assert.equal(s.misses, count / 3 * 2);
    assert.equal(s.potentialPoints, count === 3 ? 80 : 60);
    assert.equal(s.complete, false);
  }
  const result = replayBloodTiesAttempts(p, attempts);
  assert.equal(result.strikes, 0); assert.equal(result.misses, 6);
  assert.equal(result.points, 40); assert.equal(result.success, true);
  assert.equal(result.solved.length, 4);
  assert.throws(() => replayBloodTiesAttempts(p, [...attempts, wrongs(p)[0]]), /Invalid/);
  assert.throws(() => replayBloodTiesAttempts(p, attempts, 99), /Invalid/);
});

test('refresh reconstructs strikes and potential points before and after a reset', () => {
  const p = puzzle(), attempts = interruptedSolution(p);
  for (const [count, strikes, potential] of [[2, 2, 80], [3, 0, 80], [5, 2, 60], [6, 0, 60], [9, 0, 40], [10, 0, 40]]) {
    const raw = { ...createBloodTiesSession(p), attempts: attempts.slice(0, count), strikes: 0, potentialPoints: 999, points: 999, misses: 0 };
    const restored = normalizeBloodTiesSession(p, JSON.parse(JSON.stringify(raw)));
    assert.equal(restored.strikes, strikes); assert.equal(restored.potentialPoints, potential);
    assert.equal(restored.points, count === 10 ? 40 : 0);
  }
});

test('unfinished legacy saves adopt strikes while completed legacy awards retain their original rules', () => {
  const p = puzzle();
  const attempts = [wrongs(p)[0], ...solution(p).slice(0, 3)];
  const legacy = replayBloodTiesAttempts(p, attempts, 1);
  assert.equal(legacy.points, 70);
  delete legacy.rulesVersion;
  assert.equal(normalizeBloodTiesSession(p, legacy).points, 70);
  const completedV2 = replayBloodTiesAttempts(p, attempts, 2);
  assert.equal(normalizeBloodTiesSession(p, completedV2).points, 90);
  assert.equal(normalizeBloodTiesSession(p, completedV2).rulesVersion, 2);
  const activeV2 = { ...replayBloodTiesAttempts(p, attempts.slice(0, 2), 2) };
  assert.equal(normalizeBloodTiesSession(p, activeV2).rulesVersion, 3);
  const unfinished = { key: p.key, attempts: attempts.slice(0, 2), complete: false };
  const migrated = normalizeBloodTiesSession(p, unfinished);
  assert.equal(migrated.rulesVersion, 3); assert.equal(migrated.strikes, 0);
  assert.equal(migrated.misses, 1); assert.equal(migrated.potentialPoints, 90);
  const failed = replayBloodTiesAttempts(p, wrongs(p), 1);
  delete failed.rulesVersion;
  assert.equal(normalizeBloodTiesSession(p, failed).success, false);
});

test('three-day rotation is staging/local only, and leaves historical assignments intact', () => {
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => getOfficialPuzzleType(`2026-10-${22 + i}`, { bloodTies: true })), ['blood', 'word', 'easter', 'blood', 'word', 'easter']);
  assert.equal(getOfficialPuzzleType('2026-10-22'), 'easter');
  assert.equal(getOfficialPuzzleType('2026-10-21', { bloodTies: true }), getOfficialPuzzleType('2026-10-21'));
  assert.equal(puzzleOptions({ BLOOD_TIES_DEMO: '1', DEPLOYMENT_ENVIRONMENT: 'production' }).bloodTies, false);
  assert.equal(puzzleOptions({ BLOOD_TIES_DEMO: '1', DEPLOYMENT_ENVIRONMENT: 'staging' }).bloodTies, true);
});

async function database(beforeMigration, beforeName = '0015') {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec('PRAGMA foreign_keys=ON');
  for (const name of (await readdir(new URL('../worker/migrations/', import.meta.url))).filter((n) => n.endsWith('.sql')).sort()) {
    if (name.startsWith(beforeName)) beforeMigration?.(sqlite);
    sqlite.exec(await readFile(new URL(`../worker/migrations/${name}`, import.meta.url), 'utf8'));
  }
  const db = { sqlite, prepare(sql) {
    let values = [];
    return { bind(...args) { values = args; return this; },
      async first() { return sqlite.prepare(sql).get(...values) || null; },
      async all() { const statement = sqlite.prepare(sql); if (statement.columns().length) return { results: statement.all(...values) }; return this.run(); },
      async run() { const r = sqlite.prepare(sql).run(...values); return { meta: { changes: Number(r.changes) } }; } };
  }, async batch(statements) { sqlite.exec('BEGIN'); try { const rows = []; for (const s of statements) rows.push(await s.all()); sqlite.exec('COMMIT'); return rows; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };
  return db;
}

test('the next-day statistics API keeps Blood Ties solve rates separate from the other games', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-23T12:00:00Z') });
  const db = await database();
  const previousTotal = db.sqlite.prepare('SELECT total_games FROM community_totals WHERE id = 1').get().total_games;
  const insert = db.sqlite.prepare('INSERT INTO puzzle_attempts(puzzle_date,puzzle_type,puzzle_id,player_hash,answer_id,answer_name,is_correct) VALUES (?,?,?,?,?,?,?)');
  for (let i = 0; i < 4; i++) insert.run('2026-10-22', 'blood', 'blood-board', `blood-${i}`, 'blood-ties', 'Four hidden connections', i < 3 ? 1 : 0);
  for (let i = 0; i < 2; i++) insert.run('2026-10-22', 'word', 'word-board', `word-${i}`, 'word-answer', 'Word answer', 0);
  insert.run('2026-10-23', 'word', 'new-word-board', 'today-player', 'word-answer', 'New answer', 1);
  const response = await worker.fetch(new Request('https://example.test/api/stats?date=2026-10-23'), { DB: db, DEPLOYMENT_ENVIRONMENT: 'local', BLOOD_TIES_DEMO: '1' });
  assert.equal(response.status, 200);
  const stats = await response.json();
  assert.equal(stats.yesterday.date, '2026-10-22');
  assert.deepEqual(stats.yesterday.blood, { attempts: 4, correct: 3, solvePercentage: 75, answerName: 'Four hidden connections' });
  assert.equal(stats.yesterday.word.solvePercentage, 0);
  assert.equal(stats.playersToday, 1);
  assert.equal(stats.totalPuzzles, previousTotal + 7);
});

test('strike migration preserves existing results, awards, account progress, indexes and admin view', async (t) => {
  let before;
  const db = await database((sql) => {
    sql.exec("INSERT INTO player_profiles(user_id,username) VALUES ('preserve-strikes','PreserveStrikes'); INSERT INTO player_saves(user_id,score,total_rounds,current_round,best_round) VALUES ('preserve-strikes',170,2,3,8)");
    for (const [date, type, points, misses] of [['2026-10-20', 'easter', 50, 0], ['2026-10-21', 'word', 50, 0], ['2026-10-22', 'blood', 70, 1]]) {
      sql.prepare("INSERT INTO player_daily_results(user_id,puzzle_date,puzzle_id,selected_map_id,clues_used,map_correct,map_points,points_earned,score_awarded,progression_applied,puzzle_type,blood_misses) VALUES ('preserve-strikes',?,?,?,1,1,?,?,?,1,?,?)").run(date, 'old-board', 'old-answer', points, points, points, type, misses);
    }
    before = { results: sql.prepare('SELECT * FROM player_daily_results').all(), progress: sql.prepare('SELECT * FROM player_saves').all(), totals: sql.prepare('SELECT * FROM community_totals').all() };
  }, '0016');
  t.after(() => db.sqlite.close());
  assert.deepEqual(db.sqlite.prepare('SELECT * FROM player_daily_results').all(), before.results);
  assert.deepEqual(db.sqlite.prepare('SELECT * FROM player_saves').all(), before.progress);
  assert.deepEqual(db.sqlite.prepare('SELECT * FROM community_totals').all(), before.totals);
  assert.equal(db.sqlite.prepare('SELECT username FROM admin_player_results LIMIT 1').get().username, 'PreserveStrikes');
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='index' AND name IN ('player_daily_results_date_idx','player_daily_results_user_idx')").get().n, 2);
  db.sqlite.exec("UPDATE player_daily_results SET blood_misses=7 WHERE puzzle_type='blood'");
  assert.throws(() => db.sqlite.exec("UPDATE player_daily_results SET blood_misses=8 WHERE puzzle_type='blood'"), /CHECK constraint failed/);
});

test('migration preserves populated results, attempts, totals, triggers, views and cascade deletion', async (t) => {
  let before;
  const db = await database((sql) => {
    sql.exec(`INSERT INTO player_profiles(user_id,username) VALUES ('prior','Prior'); INSERT INTO player_saves(user_id,score) VALUES ('prior',1234);
      INSERT INTO player_daily_results(user_id,puzzle_date,puzzle_id,selected_map_id,clues_used,map_correct,map_points,points_earned,score_awarded,progression_applied) VALUES ('prior','2026-10-20','old','map',1,1,50,50,50,1);
      INSERT INTO puzzle_attempts(puzzle_date,puzzle_type,puzzle_id,player_hash,answer_id,answer_name,is_correct) VALUES ('2026-10-20','word','old','hash','word','Answer',1)`);
    before = ['player_daily_results','puzzle_attempts','puzzle_daily_stats','community_totals','player_saves'].map((table) => sql.prepare(`SELECT * FROM ${table}`).all());
  });
  t.after(() => db.sqlite.close());
  const tables = ['player_daily_results','puzzle_attempts','puzzle_daily_stats','community_totals','player_saves'];
  tables.forEach((table, i) => {
    const after = db.sqlite.prepare(`SELECT * FROM ${table}`).all().map((row) => { const copy = { ...row }; if (table === 'player_daily_results') delete copy.blood_misses; return copy; });
    assert.deepEqual(after, before[i].map((r) => ({ ...r })), table);
  });
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM admin_player_results').get().n, 1);
  db.sqlite.exec("INSERT INTO puzzle_attempts(puzzle_date,puzzle_type,puzzle_id,player_hash,answer_id,answer_name,is_correct) VALUES ('2026-10-22','blood','blood','hash','blood','Connections',1)");
  assert.equal(db.sqlite.prepare("SELECT attempts FROM puzzle_daily_stats WHERE puzzle_type='blood'").get().attempts, 1);
  db.sqlite.exec("DELETE FROM player_profiles WHERE user_id='prior'");
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM player_daily_results').get().n, 0);
  assert.deepEqual(db.sqlite.prepare('PRAGMA foreign_key_check').all(), []);
});

test('verified Blood Ties scoring replays guesses, rejects forgery and credits each account once', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-22T12:00:00Z') });
  const db = await database(); t.after(() => db.sqlite.close());
  db.sqlite.exec("INSERT INTO player_profiles(user_id,username) VALUES ('blood-player','BloodPlayer'); INSERT INTO player_saves(user_id,score) VALUES ('blood-player',120)");
  const p = puzzle();
  const send = (body, options = { bloodTies: true }) => recordVerifiedBloodResult(db, new Request('https://test/api/account/results/blood', { method: 'POST', body: JSON.stringify(body) }), 'blood-player', options);
  const payload = { puzzleDate: p.dateKey, puzzleId: p.key, attempts: solution(p), rulesVersion: 3, points: 9999, success: false };
  assert.equal((await send({ ...payload, attempts: [] })).status, 400);
  assert.equal((await send({ ...payload, attempts: solution(p).slice(0, 3), success: true, points: 100 })).status, 400);
  assert.equal((await send({ ...payload, attempts: [['made', 'up', 'tiles']] })).status, 400);
  assert.equal((await send({ ...payload, puzzleId: 'wrong' })).status, 400);
  assert.equal((await send(payload, {})).status, 400);
  assert.equal((await send({ ...payload, puzzleDate: '2026-10-25' })).status, 400);
  const result = await send(payload); assert.equal(result.status, 200); assert.equal(result.body.result.pointsEarned, 100);
  await send(payload);
  const stored = db.sqlite.prepare("SELECT score,total_rounds FROM player_saves WHERE user_id='blood-player'").get();
  assert.equal(stored.score, 220); assert.equal(stored.total_rounds, 1);
  const leaderboards = await readLeaderboards(db, p.dateKey);
  assert.equal(leaderboards.today.elite[0].puzzleType, 'blood'); assert.equal(leaderboards.today.elite[0].bloodMisses, 0);
});

test('signed-in result recovery resubmits the saved Blood Ties transcript', async () => {
  const p = puzzle(), session = replayBloodTiesAttempts(p, solution(p)); let sent;
  const progress = await replaySavedAccountResult({ puzzleDate: p.dateKey, dailyState: { dayStateVersion: 1, dateKey: p.dateKey, officialType: 'blood', officialCompleted: true, sessions: { blood: session } }, sendBloodResult: async (body) => { sent = body; return { progress: { score: 100 } }; } });
  assert.deepEqual(sent.attempts, solution(p)); assert.equal(sent.rulesVersion, 3); assert.equal(progress.score, 100);
});

test('the server awards only remaining potential points once after strike resets and records total misses on leaderboards', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-22T12:00:00Z') });
  const db = await database(); t.after(() => db.sqlite.close());
  db.sqlite.exec("INSERT INTO player_profiles(user_id,username) VALUES ('strike-player','StrikePlayer'); INSERT INTO player_saves(user_id,score,total_rounds,current_round,best_round,round_anchor_date,round_anchor_value) VALUES ('strike-player',500,4,7,9,'2026-10-21',7)");
  const p = puzzle(), attempts = interruptedSolution(p);
  const send = (body) => recordVerifiedBloodResult(db, new Request('https://test/result', { method: 'POST', body: JSON.stringify({ puzzleDate: p.dateKey, puzzleId: p.key, rulesVersion: 3, ...body }) }), 'strike-player', { bloodTies: true });
  assert.equal((await send({ attempts: attempts.slice(0, 6), success: true, points: 100 })).status, 400);
  assert.equal((await send({ attempts: attempts.slice(0, 9), success: true, points: 100 })).status, 400);
  assert.equal((await send({ attempts, rulesVersion: 99 })).status, 400);
  const result = await send({ attempts, points: 9999, strikes: 0, misses: 0, potentialPoints: 100 });
  assert.equal(result.status, 200); assert.equal(result.body.result.pointsEarned, 40);
  assert.equal(result.body.result.bloodMisses, 6);
  assert.equal(result.body.progress.score, 540); assert.equal(result.body.progress.solves, 5);
  const refreshed = await getAccount(db, 'strike-player', p.dateKey);
  assert.equal(refreshed.body.progress.currentRound, 8); assert.equal(refreshed.body.progress.bestRound, 9);
  const duplicate = await send({ attempts: solution(p), points: 100 });
  assert.equal(duplicate.body.result.pointsEarned, 40); assert.equal(duplicate.body.progress.score, 540);
  assert.equal(duplicate.body.progress.solves, 5);
  const board = await readLeaderboards(db, p.dateKey);
  const entry = board.today.elite.find((e) => e.username === 'StrikePlayer');
  assert.equal(entry.points, 40); assert.equal(entry.bloodMisses, 6);
});

test('three new strikes after a reset end the run, preserving lifetime score and solves', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-22T12:00:00Z') });
  const db = await database(); t.after(() => db.sqlite.close());
  db.sqlite.exec("INSERT INTO player_profiles(user_id,username) VALUES ('strike-fail','StrikeFail'); INSERT INTO player_saves(user_id,score,total_rounds,current_round,best_round) VALUES ('strike-fail',500,4,7,9)");
  const p = puzzle();
  const attempts = [...interruptedSolution(p).slice(0, 6), ...[0, 1, 2].map((i) => [p.groups[2].answers[0], p.groups[2].answers[1], p.groups[3].answers[i]])];
  const replay = replayBloodTiesAttempts(p, attempts);
  assert.equal(replay.strikes, 3); assert.equal(replay.misses, 7); assert.equal(replay.points, 0); assert.equal(replay.complete, true);
  const result = await recordVerifiedBloodResult(db, new Request('https://test/result', { method: 'POST', body: JSON.stringify({ puzzleDate: p.dateKey, puzzleId: p.key, attempts, rulesVersion: 3, points: 100, success: true }) }), 'strike-fail', { bloodTies: true });
  assert.equal(result.status, 200); assert.equal(result.body.result.pointsEarned, 0);
  assert.equal(result.body.result.bloodMisses, 7);
  assert.equal(result.body.progress.score, 500); assert.equal(result.body.progress.solves, 4); assert.equal(result.body.progress.currentRound, 1);
  assert.throws(() => replayBloodTiesAttempts(p, [...attempts, p.groups[2].answers]), /Invalid/);
});

test('anonymous statistics verify strike-rule transcripts and reject forged completion', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-22T12:00:00Z') });
  const db = await database(); t.after(() => db.sqlite.close());
  const p = puzzle(), env = { DB: db, DEPLOYMENT_ENVIRONMENT: 'local', BLOOD_TIES_DEMO: '1' };
  const body = { playerId: '07ce720f-48dd-470e-90d9-85650ff1edeb', puzzleDate: p.dateKey, puzzleType: 'blood', puzzleId: p.key, mapId: 'blood-ties', mapName: 'Connections', attempts: interruptedSolution(p), rulesVersion: 3, isCorrect: true };
  const send = (values) => worker.fetch(new Request('https://test/api/attempts', { method: 'POST', body: JSON.stringify(values) }), env);
  assert.equal((await send({ ...body, isCorrect: false })).status, 400);
  assert.equal((await send({ ...body, attempts: body.attempts.slice(0, 9) })).status, 400);
  assert.equal((await send({ ...body, rulesVersion: 1 })).status, 400);
  assert.equal((await send(body)).status, 200);
  assert.equal((await send(body)).status, 200);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM puzzle_attempts WHERE puzzle_type='blood'").get().n, 1);
});

test('verified failure credits no points and the staging schedule also verifies the other two games', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-22T12:00:00Z') });
  const db = await database(); t.after(() => db.sqlite.close());
  db.sqlite.exec("INSERT INTO player_profiles(user_id,username) VALUES ('verify-player','VerifyPlayer'); INSERT INTO player_saves(user_id,score,current_round,best_round) VALUES ('verify-player',500,7,9)");
  const p = puzzle();
  const req = (body) => new Request('https://test/result', { method: 'POST', body: JSON.stringify(body) });
  const failed = await recordVerifiedBloodResult(db, req({ puzzleDate: p.dateKey, puzzleId: p.key, attempts: wrongs(p), rulesVersion: 3, success: true, points: 100 }), 'verify-player', { bloodTies: true });
  assert.equal(failed.status, 200); assert.equal(failed.body.progress.score, 500);
  assert.equal(failed.body.progress.currentRound, 1); assert.equal(failed.body.progress.bestRound, 9);
  assert.equal(failed.body.result.bloodMisses, 3);
  t.mock.timers.setTime(new Date('2026-10-26T12:00:00Z').getTime());
  const w = buildDailyWordPuzzle('2026-10-26', workerWords);
  const wordPayload = { puzzleDate: w.dateKey, puzzleId: w.key, guesses: [...new Set(w.entry.answer.toUpperCase().replace(/[^A-Z]/g, ''))] };
  assert.equal((await recordVerifiedWordResult(db, req(wordPayload), 'verify-player')).status, 400);
  assert.equal((await recordVerifiedWordResult(db, req(wordPayload), 'verify-player', { bloodTies: true })).status, 200);
  t.mock.timers.setTime(new Date('2026-10-27T12:00:00Z').getTime());
  const map = buildDailyPuzzle('2026-10-27', workerMaps);
  const mapPayload = { puzzleDate: map.dateKey, puzzleId: map.key, selectedMapId: map.map.id, cluesUsed: 1 };
  assert.equal((await recordVerifiedMapResult(db, req(mapPayload), 'verify-player')).status, 400);
  assert.equal((await recordVerifiedMapResult(db, req(mapPayload), 'verify-player', { bloodTies: true })).status, 200);
});

test('new workbook boards use the same secure account, refresh, statistics and leaderboard flows', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-25T12:00:00Z') });
  const db = await database(); t.after(() => db.sqlite.close());
  db.sqlite.exec("INSERT INTO player_profiles(user_id,username) VALUES ('content-player','ContentPlayer'); INSERT INTO player_saves(user_id,score,total_rounds,current_round,best_round) VALUES ('content-player',500,4,7,9)");
  const p = buildDailyBloodTiesPuzzle('2026-10-25');
  const attempts = [wrongs(p)[0], ...solution(p)];
  const payload = { puzzleDate: p.dateKey, puzzleId: p.key, attempts, rulesVersion: 3, points: 9999, success: false };
  const req = body => new Request('https://test/result', { method: 'POST', body: JSON.stringify(body) });
  const send = body => recordVerifiedBloodResult(db, req(body), 'content-player', { bloodTies: true });
  assert.equal((await send({ ...payload, rulesVersion: 2 })).status, 400);
  assert.equal((await send({ ...payload, attempts: attempts.slice(0, 4) })).status, 400);
  assert.equal((await send({ ...payload, puzzleId: puzzle().key })).status, 400);
  const result = await send(payload);
  assert.equal(result.status, 200);
  assert.equal(result.body.result.pointsEarned, 90);
  assert.equal(result.body.progress.score, 590);
  assert.equal(result.body.progress.solves, 5);
  assert.equal(result.body.progress.currentRound, 7);
  const repeated = await send(payload);
  assert.equal(repeated.body.progress.score, 590);
  const board = await readLeaderboards(db, p.dateKey);
  assert.equal(board.today.elite.find(e => e.username === 'ContentPlayer').points, 90);
  const saved = sanitizeDailyState({ dayStateVersion: 1, dateKey: p.dateKey, officialType: 'blood', sessions: { blood: { ...replayBloodTiesAttempts(p, attempts.slice(0, 2)), points: 9999 } } }, p.dateKey);
  assert.equal(saved.sessions.blood.points, 0);
  assert.equal(saved.sessions.blood.potentialPoints, 90);
  const anonymous = { playerId: '07ce720f-48dd-470e-90d9-85650ff1edeb', puzzleDate: p.dateKey, puzzleType: 'blood', puzzleId: p.key, mapId: 'blood-ties', mapName: 'Connections', attempts, rulesVersion: 3, isCorrect: true };
  const env = { DB: db, DEPLOYMENT_ENVIRONMENT: 'local', BLOOD_TIES_DEMO: '1' };
  assert.equal((await worker.fetch(new Request('https://test/api/attempts', { method: 'POST', body: JSON.stringify(anonymous) }), env)).status, 200);
  assert.equal((await worker.fetch(new Request('https://test/api/attempts', { method: 'POST', body: JSON.stringify({ ...anonymous, rulesVersion: 1 }) }), env)).status, 400);
});
