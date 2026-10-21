import { buildDailyPuzzle } from "../../js/game-core.js";
import { buildDailyWordPuzzle, calculateWordPoints } from "../../js/word-puzzle-core.js";
import { getOfficialPuzzleType } from "../../js/daily-challenge-core.js";
import { workerMaps } from "./generated-map-catalog.js";
import { workerWords } from "./generated-word-catalog.js";
import { buildDailyBloodTiesPuzzle, calculateBloodTiesPoints } from '../../js/blood-ties-core.js';

const fixtureVersion = 2;
const ready = new WeakMap();
const characters = [
  ["Richtofen", "richtofen", "World at War", "Der Riese"],
  ["Dempsey", "dempsey", "Black Ops", "Moon"],
  ["Takeo", "takeo", "Black Ops 3", "Zetsubou No Shima"],
  ["Nikolai", "nikolai", "Black Ops", "Ascension"],
  ["Samantha", "samantha", "Black Ops 2", "Origins"],
  ["Misty", "misty", "Black Ops 2", "Buried"],
  ["Marlton", "marlton", "Black Ops 2", "TranZit"],
  ["Russman", "russman", "Black Ops 2", "Die Rise"],
];

export function fixturesEnabled(env) {
  return env.STAGING_FIXTURES === "1"
    && ["staging", "local"].includes(env.DEPLOYMENT_ENVIRONMENT)
    && env.SUPABASE_ISSUER === "https://zsnnvzhimtlhpvwhwxpy.supabase.co/auth/v1";
}

export function fixtureStatements(db, today) {
  const statements = [];
  const statement = (sql, ...values) => statements.push(db.prepare(sql).bind(...values));
  for (const [index, [name, avatar, game, map]] of characters.entries()) {
    const id = `stage_demo_${String(index + 1).padStart(2, "0")}`;
    statement(`INSERT INTO player_profiles (user_id, account_id, username, leaderboard_visible, avatar_id, theme_id, favourite_game, favourite_map, bio)
      VALUES (?, ?, ?, 1, ?, 'default', ?, ?, 'Fictional staging player. Safe test data.')
      ON CONFLICT(user_id) DO NOTHING`, id, `acct_staging_fixture_${index + 1}`, `Demo${name}`, avatar, game, map);
    statement(`INSERT INTO player_saves (user_id, current_round, best_round, score, total_rounds, last_played_date, round_anchor_date, round_anchor_value)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET
      last_played_date = excluded.last_played_date, round_anchor_date = excluded.round_anchor_date`,
    id, 12 + index, 24 + index, 8400 - index * 650, 120 - index * 9, today, today, 12 + index);
  }
  for (const offset of [1, 0]) {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - offset);
    const dateKey = date.toISOString().slice(0, 10);
    const map = buildDailyPuzzle(dateKey, workerMaps);
    const word = buildDailyWordPuzzle(dateKey, workerWords);
    const blood = buildDailyBloodTiesPuzzle(dateKey);
    const official = getOfficialPuzzleType(dateKey, { bloodTies: true });
    for (let index = 0; index < 16; index += 1) {
      const correct = index < 12;
      for (const type of ["easter", "word", 'blood']) {
        statement(`INSERT OR IGNORE INTO puzzle_attempts (puzzle_date, puzzle_type, puzzle_id, player_hash, answer_id, answer_name, is_correct)
          VALUES (?, ?, ?, ?, ?, ?, ?)`, dateKey, type, type === 'blood' ? blood.key : type === "word" ? word.key : map.key,
        `staging-fixture-player-${index}`, type === 'blood' ? 'blood-ties' : type === "word" ? word.entry.id : map.map.id,
        type === 'blood' ? 'Four hidden connections' : type === "word" ? word.entry.answer : map.map.title, correct ? 1 : 0);
      }
      if (index >= characters.length) continue;
      const misses = index % 4;
      const clues = index % 3 + 1;
      const bonusCorrect = index % 2 === 0;
      const mapPoints = official === 'blood' ? calculateBloodTiesPoints(index % 3) : official === "word" ? calculateWordPoints(misses) : [0, 50, 20, 10][clues];
      const bonusPoints = official === "easter" && bonusCorrect ? mapPoints : 0;
      statement(`INSERT INTO player_daily_results (user_id, puzzle_date, puzzle_id, selected_map_id, clues_used, map_correct,
        map_points, bonus_status, bonus_points, points_earned, completed_at, score_awarded, progression_applied, puzzle_type, word_misses, blood_misses)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?) ON CONFLICT(user_id, puzzle_date) DO NOTHING`,
      `stage_demo_${String(index + 1).padStart(2, "0")}`, dateKey, official === 'blood' ? blood.key : official === "word" ? word.key : map.key,
      official === 'blood' ? 'blood-ties' : official === "word" ? word.entry.id : map.map.id, clues, mapPoints,
      official !== 'easter' ? "unavailable" : bonusCorrect ? "correct" : "incorrect",
      bonusPoints, mapPoints + bonusPoints, `${dateKey}T08:00:00Z`, mapPoints + bonusPoints, official, official === 'word' ? misses : 0, official === 'blood' ? index % 3 : 0);
    }
  }
  statement("INSERT OR IGNORE INTO staging_fixture_runs (date_key, version) VALUES (?, ?)", today, fixtureVersion);
  return statements;
}

export async function ensureStagingFixtures(env, today = new Date().toISOString().slice(0, 10)) {
  if (!fixturesEnabled(env)) return;
  const key = `${today}:${fixtureVersion}`;
  if (ready.get(env.DB)?.key === key) return ready.get(env.DB).promise;
  const promise = (async () => {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS staging_fixture_runs (date_key TEXT NOT NULL, version INTEGER NOT NULL, PRIMARY KEY(date_key, version))").run();
    if (await env.DB.prepare("SELECT 1 AS ready FROM staging_fixture_runs WHERE date_key = ? AND version = ?").bind(today, fixtureVersion).first()) return;
    await env.DB.batch(fixtureStatements(env.DB, today));
  })();
  ready.set(env.DB, { key, promise });
  try { await promise; } catch (error) { ready.delete(env.DB); throw error; }
}
