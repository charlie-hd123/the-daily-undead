import { isValidDateKey } from "../../js/game-core.js";

function nonNegativeInteger(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function rowToDailyEntry(row) {
  return {
    username: row.username,
    cluesUsed: nonNegativeInteger(row.clues_used),
    bonusCorrect: row.bonus_status === "correct",
    points: nonNegativeInteger(row.points),
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

  const [dailyResult, todayStatsResult, allTimeResult] = await db.batch([
    db
      .prepare(
        `SELECT
          profiles.username,
          results.clues_used,
          results.bonus_status,
          results.points_earned AS points
        FROM player_daily_results AS results
        INNER JOIN player_profiles AS profiles ON profiles.user_id = results.user_id
        WHERE results.puzzle_date = ?
          AND profiles.leaderboard_visible = 1
          AND results.map_correct = 1
        ORDER BY
          results.points_earned DESC,
          profiles.username COLLATE BINARY ASC`,
      )
      .bind(dateKey),
    db
      .prepare("SELECT attempts FROM daily_stats WHERE puzzle_date = ?")
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

  return {
    date: dateKey,
    generatedAt: new Date().toISOString(),
    today: {
      playersToday: nonNegativeInteger(todayStatsResult.results?.[0]?.attempts),
      elite: (dailyResult.results || []).map(rowToDailyEntry),
    },
    allTime: (allTimeResult.results || []).map(rowToAllTimeEntry),
  };
}
