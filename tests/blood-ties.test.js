import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir } from 'node:fs/promises';
import { bloodTiesCatalogue } from '../js/blood-ties-catalogue.js';
import { buildDailyBloodTiesPuzzle, countBloodTiesSolutions, createBloodTiesSession, normalizeBloodTiesSession, replayBloodTiesAttempts } from '../js/blood-ties-core.js';
import { getOfficialPuzzleType } from '../js/daily-challenge-core.js';
import { recordVerifiedBloodResult, recordVerifiedWordResult, recordVerifiedMapResult, sanitizeDailyState } from '../worker/src/accounts.js';
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
const solution = (p) => p.groups.slice(0, 3).map((g) => g.answers);

test('Blood Ties renders shared miss counters, mode warnings and truthful result/reveal labels', () => {
  const p = puzzle();
  const render = (session, official = true) => {
    const app = { innerHTML: '', querySelectorAll: () => [], querySelector: () => null };
    renderBloodTiesView({ app, puzzle: p, session, official, developer: false, heading: () => '', onSave() {}, onSubmit() {}, onSound() {} });
    return app.innerHTML;
  };
  const active = render(replayBloodTiesAttempts(p, [wrongs(p)[0]]));
  assert.match(active, /<span>Misses<\/span><strong>1 \/ 3/);
  assert.match(active, /Potential score<\/span><strong>70/);
  assert.match(active, /blood-status is-miss/);
  const fun = render(createBloodTiesSession(p), false);
  assert.match(fun, /Playing just for fun\. This result will not change your stats/);
  assert.doesNotMatch(fun, /Potential score/);
  const won = render(replayBloodTiesAttempts(p, solution(p)));
  assert.equal((won.match(/· Found/g) || []).length, 3);
  assert.equal((won.match(/· Revealed/g) || []).length, 1);
  assert.match(won, /Round Survived!/);
  const lost = render({ ...replayBloodTiesAttempts(p, wrongs(p)), roundsSurvivedBeforeLoss: 8 });
  assert.match(lost, /Your run ended at <strong>Round 8/);
  assert.equal((lost.match(/· Revealed/g) || []).length, 4);
  assert.doesNotMatch(lost, /Round score/);
  assert.match(renderBloodTiesGroup({ name: '<script>', answers: ['A & B'], definition: '<img>' }, 0), /&lt;script&gt;/);
});

test('the first worksheet supplies 51 connections and only eligible answers', () => {
  assert.equal(bloodTiesCatalogue.worksheet, 'Blood Ties');
  assert.equal(bloodTiesCatalogue.connections.length, 51);
  assert.equal(new Set(bloodTiesCatalogue.connections.map((g) => g.id)).size, 51);
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
      const source = bloodTiesCatalogue.connections.find((c) => c.id === g.id);
      assert.ok(g.answers.every((tile) => source.tiles.includes(tile)));
    }
    for (const previous of history.slice(-3)) {
      assert.ok(p.groups.every((g) => !previous.groups.some((before) => before.id === g.id)), date);
      assert.ok(p.tiles.every((tile) => !previous.tiles.includes(tile)), date);
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

test('three solved trios reveal the fourth; misses set score and repeat guesses never cost lives', () => {
  const p = puzzle();
  for (const [misses, score] of [[0, 100], [1, 70], [2, 40]]) {
    const result = replayBloodTiesAttempts(p, [...wrongs(p).slice(0, misses), ...solution(p)]);
    assert.equal(result.complete, true); assert.equal(result.success, true);
    assert.equal(result.points, score); assert.equal(result.solved.length, 4);
  }
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

test('three-day rotation is staging/local only, and leaves historical assignments intact', () => {
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => getOfficialPuzzleType(`2026-10-${22 + i}`, { bloodTies: true })), ['blood', 'word', 'easter', 'blood', 'word', 'easter']);
  assert.equal(getOfficialPuzzleType('2026-10-22'), 'easter');
  assert.equal(getOfficialPuzzleType('2026-10-21', { bloodTies: true }), getOfficialPuzzleType('2026-10-21'));
  assert.equal(puzzleOptions({ BLOOD_TIES_DEMO: '1', DEPLOYMENT_ENVIRONMENT: 'production' }).bloodTies, false);
  assert.equal(puzzleOptions({ BLOOD_TIES_DEMO: '1', DEPLOYMENT_ENVIRONMENT: 'staging' }).bloodTies, true);
});

async function database(beforeMigration) {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec('PRAGMA foreign_keys=ON');
  for (const name of (await readdir(new URL('../worker/migrations/', import.meta.url))).filter((n) => n.endsWith('.sql')).sort()) {
    if (name.startsWith('0015')) beforeMigration?.(sqlite);
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
  const payload = { puzzleDate: p.dateKey, puzzleId: p.key, attempts: solution(p), points: 9999, success: false };
  assert.equal((await send({ ...payload, attempts: [] })).status, 400);
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
  assert.deepEqual(sent.attempts, solution(p)); assert.equal(progress.score, 100);
});

test('verified failure credits no points and the staging schedule also verifies the other two games', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-22T12:00:00Z') });
  const db = await database(); t.after(() => db.sqlite.close());
  db.sqlite.exec("INSERT INTO player_profiles(user_id,username) VALUES ('verify-player','VerifyPlayer'); INSERT INTO player_saves(user_id,score,current_round,best_round) VALUES ('verify-player',500,7,9)");
  const p = puzzle();
  const req = (body) => new Request('https://test/result', { method: 'POST', body: JSON.stringify(body) });
  const failed = await recordVerifiedBloodResult(db, req({ puzzleDate: p.dateKey, puzzleId: p.key, attempts: wrongs(p), success: true, points: 100 }), 'verify-player', { bloodTies: true });
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
