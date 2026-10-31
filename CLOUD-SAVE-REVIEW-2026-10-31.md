# Cloud save investigation — 31 October 2026

The conflict dialog was introduced on 27 September (`fba188d`, “Handle expired Clerk sessions safely”). It protects locally queued account progress after interrupted/expired sessions or another tab/device changes the account. Ordinary online play should synchronise automatically. Cloud choice loads the server copy; device choice uploads the queued puzzle state. Verified Score/Solves belong to the server and are not replaced by either choice.

## Confirmed incident and authorised live repair

Tob1V's 30 October Blood Ties result exists: success, one mistake, **90 points**, fully credited. The user confirmed preserving those verified 90 points rather than changing the result to the initially reported 80. Score **7,840**, Solves **82**.

The result was saved at 10:14:54 UTC, but the last daily-state save was an incomplete board at 10:12:40. `last_played_date` remained 29 October. On 31 October the browser stored a false missed-day notice and Round 1. The exact network interruption/request ordering cannot be recovered from the database, but the inconsistent data and the faulty reconciliation path are confirmed.

The result handlers credited Score/Solves independently of the follow-up browser save that recorded participation. Save/result requests also raced for the same account revision. Account reads reconstructed Round from verified results without fixing the stale participation date, so the browser could immediately undo the reconstructed Round.

A guarded, one-account update restored **Round 77**, retained Highest Round 77, set last played to **30 October**, cleared the false notice, and incremented the revision. A separate read verified Round 77 / Score 7,840 / Solves 82, with yesterday's 90-point result unchanged. No result, daily puzzle state, assignment, other player or application deployment was changed by that repair. Database evidence and the guarded SQL/receipt are retained locally under `.releases/cloud-save-20261031/` (ignored by Git).

## Account audit

Read all **56 accounts**, their verified result histories, their October daily saves, and the protected-date calendar. Recent means **17–31 October**, with an extended review of **1–31 October**. Replayed saved answers/attempts against the actual production puzzle catalogue and schedule; compared result awards, participation dates and reconstructed rounds. All recorded results have their points fully awarded and progression applied. Guest-import totals reconcile to opening totals plus verified awards.

No other account was changed.

| Account | Date | Finding | Impact / decision |
| --- | --- | --- | --- |
| **lewzzibo** | 30 Oct | Verified successful Blood Ties result, **90 points**, but last played remains **29 Oct**. Stored/reconstructed Round **7**, Score **1,880**, Solves **20**. | Same stale-participation risk as Tob1V; no false missed-day notice stored at audit time. No missing score. Recommended targeted date repair before the next visit. Await user decision. |
| **luigismansion44** | 30 Sep–1 Oct | Last played **29 Sep** despite two verified failed rounds (zero points). Stored/reconstructed Round **1**, Highest 4. | Older stale metadata. Failures already ended the run legitimately; no missing points or successful run to restore. |
| **dave_thealmighty** | 13 Oct | Legacy Quest Steps save has a correct map and bonus, worth **20 local points**, but no verified result for that date. | Last Words was the official puzzle. Evidence is consistent with an old client during the two-game transition; not evidence of this cloud conflict causing loss. Consider discretionary compensation separately. |
| **Feur** | 13 Oct | Same legacy/official-puzzle mismatch; correct map and bonus worth **20 local points**, no verified result. | Same transition caveat; no automatic repair. |
| **Seef** | 13 Oct | Same mismatch; correct map and bonus worth **100 local points**, no verified result. | Same transition caveat; no automatic repair. |
| **Exp188** | 13 Oct | Legacy Quest Steps failure, **0 points**, no official Last Words result. | Historical client mismatch; no score credit indicated. |
| **Conner22** | 3 Oct | Saved successful bonus but verified result still shows bonus pending (50 verified vs 100 in saved puzzle). This is the registration/import date; opening imported Score **3,200** and 38 imported solves were already carried into the account. | Do not assume another 50 is owed. Imported completion may already be included; a top-up risks double-counting. Current total reconciles exactly to import plus verified awards. |
| **TheSirandom** | 14 Oct | Completed 50-point save without a verified row, on registration/import date. Opening import is **50 points and 1 solve**. | The result is already represented in imported totals. No extra points indicated. |

Outside October, **QiQiko** has a stale 23 September last-played date despite a verified failed round on 27 September. Its missed-day notice is already resolved, Round 1 is legitimate, and no points are missing.

The audit cannot establish every historical popup or recover progress that never reached the server and was deleted on a device. No conflict-event telemetry exists. Legacy transition cases are reported separately from confirmed recent stale-date risk.

## Staging implementation

- Verified map/word/Blood Ties results record participation in the same transaction as awards. Ordinary saves cannot move that date backwards.
- Account reconstruction repairs participation from verified history before the browser's missed-day decision.
- Save/result mutations queue their requests **and revision acknowledgements**. Acknowledging an older snapshot cannot clear newer local input.
- A queued save that already matches the cloud puzzle is acknowledged without a choice popup, including after an upload response was lost. Yesterday's pending state is compared with yesterday's saved puzzle without reconstructing the account at a historical date.
- Real conflicts retain the choice but show dates, puzzle completion and totals. Copy explains same-device/tab/network causes, the effect of cloud choice, and server-owned totals. Cloud choice retains a browser recovery copy; storage failure prevents discarding the pending copy. Conflict resolution uses a checked revision, not an unconditional overwrite.
- Account reads can recover today's/yesterday's complete, on-time **server-held** puzzle evidence with normal answer validation and idempotent awards. Historical client submissions remain rejected. Imported opening dates are excluded to avoid double-crediting.
- No migrations or production application deployment are included.

Automated regression coverage includes all three result types, stale-date writes, false run endings, sequential revision handling, snapshot comparison/recovery copies, lost result submissions across midnight, bonuses, failures, replay idempotency, late evidence rejection and imported totals. Browser/release verification is recorded in the task and local review receipts.
