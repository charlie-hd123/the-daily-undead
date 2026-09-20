import { isValidDateKey } from "../../js/game-core.js";

function nonNegativeInteger(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function rowToDailyEntry(row, index, correct) {
  return {
    rank: correct ? index + 1 : null,
    username: row.username,
    points: nonNegativeInteger(row.points),
    correct,
  };
}

function rowToAllTimeEntry(row) {
  return {
    username: row.username,
    currentRound: nonNegativeInteger(row.current_round),
    points: nonNegativeInteger(row.points_balance),
    highestRound: nonNegativeInteger(row.best_round),
    totalRounds: nonNegativeInteger(row.total_rounds),
  };
}

export async function readLeaderboards(db, dateKey) {
  if (!isValidDateKey(dateKey)) throw new Error("A valid date is required.");

  const [dailyResult, allTimeResult] = await db.batch([
    db
      .prepare(
        `SELECT
          profiles.username,
          results.points_earned AS points,
          results.map_correct
        FROM player_daily_results AS results
        INNER JOIN player_profiles AS profiles ON profiles.user_id = results.user_id
        WHERE results.puzzle_date = ?
          AND profiles.leaderboard_visible = 1
        ORDER BY
          results.map_correct DESC,
          results.points_earned DESC,
          profiles.username COLLATE BINARY ASC`,
      )
      .bind(dateKey),
    db.prepare(
      `SELECT
        profiles.username,
        COALESCE(saves.current_round, 0) AS current_round,
        COALESCE(saves.points_balance, 0) AS points_balance,
        COALESCE(saves.best_round, 0) AS best_round,
        COALESCE(saves.total_rounds, 0) AS total_rounds
      FROM player_profiles AS profiles
      LEFT JOIN player_saves AS saves ON saves.user_id = profiles.user_id
      WHERE profiles.leaderboard_visible = 1
      ORDER BY
        best_round DESC,
        total_rounds DESC,
        current_round DESC,
        profiles.username COLLATE BINARY ASC`,
    ),
  ]);

  const dailyRows = dailyResult.results || [];
  const correctRows = dailyRows.filter((row) => Boolean(row.map_correct));
  const incorrectRows = dailyRows.filter((row) => !row.map_correct);

  return {
    date: dateKey,
    generatedAt: new Date().toISOString(),
    today: {
      correct: correctRows.map((row, index) => rowToDailyEntry(row, index, true)),
      incorrect: incorrectRows.map((row, index) => rowToDailyEntry(row, index, false)),
    },
    allTime: (allTimeResult.results || []).map(rowToAllTimeEntry),
  };
}
