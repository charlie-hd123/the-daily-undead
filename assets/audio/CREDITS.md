# The Daily Undead sound effects · feedback revision 2.9

## Fuller atmosphere and quiet chimes · 23 October 2026

Raised the Mystery Box ethereal layer by 4.61 dB relative to its previous mix, with three soft bell glints at 0.72, 1.06 and 1.43 seconds. The chimes share the existing dark room reverb. The recorded opening, 1G phrase and 3.42-second fade remain; no late impacts are added. Overall active-window loudness remains -18 dBFS and in-game gain remains .86. All other 16 cues are unchanged. Rebuild with `python scripts/revise-box-atmosphere.py`.

## Previous recorded chest and atmospheric 1G · 23 October 2026

Mystery Box now combines the existing 1G melody with a CC0 recording of an actual wooden chest opening. The initial synthetic knock and the two post-jingle thuds are removed. A dark diffuse reverb and quiet E/B harmonic layer add depth, fading to silence at 3.42 seconds before the 3.50-second animation finishes. The active-window RMS remains -18 dBFS and cue gain remains .86. All other 16 cues, including the cleaned reward flourish, are unchanged.

Recording: [Wooden Chest Open.wav by The_Frisbee_of_Peace](https://freesound.org/people/The_Frisbee_of_Peace/sounds/573654/), CC0. The public HQ MP3 preview is retained; the login-gated original WAV was not downloaded. Full source hash, licence and processing details: [sources/CREDITS.md](sources/CREDITS.md). Rebuild with `python scripts/revise-box-atmosphere.py`. No direct listening assessment; PCM/AAC decoding, finite samples, duration, silent endpoints and 4x true peaks checked.

## Previous reward texture cleanup · 23 October 2026

The papery air sweep embedded in Double Points (190–610 ms into its clip) has been removed by reconstructing and subtracting that original component. The existing chimes, echoes, 1.65-second duration, playback gain and post-count trigger timing remain. Loudness is matched to the accepted file. This shared flourish is cleaned wherever it plays. All other cues, including selected box 1G and clue 8E, are byte-identical. Rebuild with `python scripts/remove-reward-sweep.py` (numpy + macOS afconvert). Source/AAC decoding and true-peak checks passed; no subjective listening assessment.

## Selected original box 1G · 23 October 2026

Mystery Box opening now uses the approved **1G · Gentle lift**, copied byte-for-byte from `auditions-2026-10-23-lift/`. Its original melody, taps, 2.70-second duration and .86 playback gain are preserved. The layered 1G+ is not selected. Clue 8E and every other cue are unchanged. The original audition QA checks cover these identical WAV/AAC bytes; no subjective listening assessment was possible.

## Previous selection: clue 8E and brighter box auditions · 23 October 2026

Quest clue reveal now uses the approved **8E · Wooden roll**: three small dry
wooden contacts, 230 ms. Its WAV and AAC bytes are copied exactly from the audition;
the existing 80% gain and reveal trigger are unchanged. The other 16 active cue
pairs, button routing and maximum-score/bonus reward behavior are unchanged.

Box options 1G, 1H and 1I preserve the 1A comb timbre and opening phrase, but
replace the falling ending with an upward minor arpeggio, warmer major arpeggio
or open suspended lift. No extra closing chord or longer coda is appended. They
remain auditions at `assets/audio/auditions-2026-10-23-lift/`; no new box choice
has been selected. Rebuild with `python scripts/build-audio-auditions.py
--rewarding-endings`. No subjective listening was available.

## Perfect-score reward update · 23 October 2026

The accepted reward flourish now follows a fresh scored 100-point final result
in Last Words and Blood Ties, using the existing Quest Steps bonus sequence:
720 ms count, 430 ms finishing ping and 70 ms breathing room, then the flourish.
Reduced motion uses the immediate total/ping and a 500 ms wait. Reopening a saved
result and unscored Last Words/Blood Ties play do not start a new flourish.
Existing successful Quest Steps bonus feedback, including lower totals, remains.
Scheduling a later flourish preserves the solve sting playing before it; mute,
navigation and hidden-page cancellation still stop the complete sequence.

All 17 active sound files and gains remain unchanged. New box variations of 1A
and three new clue options are separate auditions at
`assets/audio/auditions-2026-10-23/`; no new audition is selected in gameplay.

The active pack contains 17 original effects, all generated locally. No Treyarch
recording, transcribed melody, door creak, speech or background music is included
in the current playback table. No paid service or downloaded sample was used for
this revision.

## Latest listening feedback · revision 2.4

Only Mystery Box and clue-reveal audio changed. The other 15 cue pairs, all gains,
button routing and delayed bonus reward timing remain unchanged from revision 2.3.

- Box: a nonmusical hollow mechanism rattle and inward breath. Short inharmonic
  material contacts follow the lid opening; broad air resonances accompany the
  lift. This gesture ends by 1.3 s, with quiet contacts at the unchanged settle
  and assembly beats. No music-box melody, comb tones, glass, creak or ending chord.
- Clue: a 280 ms rounded pressure pulse with a soft, falling body. The glass
  synthesis and reverse swell are removed entirely. No chime, note sequence,
  paper, scrape or radio texture.

These are original procedural synthesis using local numpy and macOS afconvert.
No downloaded audio or paid generation services were used. No direct listening
assessment was available; WAV and decoded AAC signal checks are recorded in the
review pack. Rebuild with `python scripts/revise-audio-timing.py --feedback-r6`;
the standalone audition player is in `audio-review/2026-10-21-r6`.

## Previous listening feedback · revision 2.3

Only Mystery Box and clue-reveal audio files changed. The other 15 cue pairs,
including run ended, and every playback gain remain bit-identical to revision 2.2.

- Box: a new miniature clockwork melody replaces the isolated chimes. Nine
  short comb tones form three rolling groups, ending unresolved before 1.6 s.
  Mechanical taps accompany lid movement; dull contacts follow the existing
  settle/assembly beats. No closing chord, creak, detuning or sustained pad.
- Clue: the reversed-glass shape is retained. Fundamentals drop from 1175/587 Hz
  to 880/440 Hz, with a rounded 9 ms attack, reduced upper partials and 1.8 kHz
  low-pass shaping to soften the sharp edge.
- Button click: waveform unchanged. Only puzzle cards/navigation, map/game
  selection, and Blood Ties shuffle/deselect opt in. Letter, clue, box, bonus,
  Blood Ties tile and confirmation handlers retain their dedicated cues.
  Account, leaderboard, sharing, settings, stat explainers, dialogs and ordinary
  site buttons are silent. New buttons default to silence.
- Bonus reward timing from revision 2.2 is unchanged.

Rebuild with `python scripts/revise-audio-timing.py --feedback-r5`. The standalone
player and montage are in `audio-review/2026-10-21-r5`. This is original local
synthesis, using the haunted clockwork/music-box character as creative direction.
No Treyarch samples or melody were copied; no direct listening tool was available.

## Previous listening feedback · revision 2.2

Only Mystery Box and clue-reveal files were replaced in this revision. The other
15 active cue pairs, including the approved run-ended impact, and all gains are
bit-identical to revision 2.1.

- Box: the closing musical note is removed. Three notes use a darker, unresolved
  tritone contour; the tapping follows the same animation beats. The final
  assembly contact is now a dull tap instead of a ringing contact.
- Clue: a brief reversed-glass glint replaces the stone/ceramic cue. No scrape,
  paper, hollow-knock or noise layer.
- Double Points: the accepted reward file is unchanged. It starts after the
  720 ms count and the 430 ms finishing ping, with 70 ms of breathing room
  (1220 ms after the result appears). Reduced motion waits 500 ms after its
  immediate total and ping. Unscored play has no count and keeps its immediate
  reward. Muting, leaving the page or navigating cancels the scheduled flourish.

Rebuild with `python scripts/revise-audio-timing.py --feedback-r4`. The review
player and montage are written to `audio-review/2026-10-21-r4`.

## Previous listening feedback · revision 2.1

Only three files were replaced. The other 14 active cue pairs and all playback
gains are bit-identical to revision 2.0.

- Mystery Box: three taps follow the initial lid movement; a four-note version
  of the accepted music-box character starts at the 620 ms icon lift and finishes
  by 1.48 s. Small taps mark settle at 2.010 s and assembly at 2.540 s. The file
  ends at 2.7 s instead of 3.5 s; it no longer sustains music through the reveal.
  These beat positions are read from the actual shared `BOX_SEQUENCE` constants.
- Clue: short hollow stone/ceramic contact and release. No paper, scrape or noise
  layer, and no whoosh.
- Run ended: one short, deadened hollow impact. The organ, melody and creature
  layer are removed; duration is 720 ms instead of 1.35 s.

Last Words now schedules end feedback from the accepted final guess, before a
render normalizes the session object. This fixes the lost WeakSet membership that
silenced the failed-word result. Its timing remains 850 ms (120 ms with reduced
motion). Word score-count sounds are likewise scheduled for their visible result.
Reloaded results stay silent; mute, hiding and navigation cancel scheduled cues.

Rebuild this revision with `python scripts/revise-audio-timing.py` (numpy + macOS
afconvert). It preserves every other active file and gain. Review artifacts are
written to `audio-review/2026-10-21-r3`.

## Previous revision 2.0, requested on 21 October 2026

- Mystery Box: an original wind-up music-box jingle, timed to the existing
  3.5-second reveal; no creak or detuned/unison layers.
- Wrong answer: clean muted knock and short falling tones; no electrical fizzle.
- Clue: dry page/card turnover and contact sounds instead of a supernatural sweep.
- Ordinary buttons/maps: lower 285 Hz click, with upper contact partials for phone
  speakers. Dedicated gameplay cues take priority, so buttons do not double up.
- Points: clearer, substantially louder counting ticks and finishing ping.
- Run ended: descending chamber-organ/bell sting with a restrained synthesised,
  nonverbal creature texture.
- Heartbeat and highest-round sounds removed from the active table and triggers.
- Accepted letter/streak, confirmation, solve, bonus and Double Points sounds keep
  their character, with level-only remastering.

## Format, provenance and checks

48 kHz mono 16-bit PCM WAV is the primary browser source; 192 kb/s AAC/M4A is the
fallback. Filenames carry SHA-256 prefixes. Current files, triggers, durations,
gains and measured levels are in `manifest.json`. Previous hashes remain for old
open pages. Gameplay/scoring is unchanged.

The previous quiet master multiplier is removed. Active-window RMS targets are
about -17 to -19 dBFS before cue gain. The realistic gameplay montage peaks at
-2.803 dBTP before the browser overlap limiter. WAVs and decoded AAC files are
checked for silent endpoints, valid durations and no sample/four-times-interpolated
peak clipping. These measurements are not BS.1770 LUFS or a listening assessment.
The rewritten cues are dry mono, without chorus, flanging or detuned unisons.

Rebuild with `python scripts/synthesise-feedback.py` (numpy + macOS afconvert).
Outputs go to audio-review/2026-10-21 and the content-addressed runtime folder.
Use `--verify` for file and decoded-signal checks without regeneration.

Research references, for music-box character only:

- https://www.reddit.com/r/CODZombies/comments/f9ambs/
- https://www.youtube.com/watch?v=iWqJJPX6wk0
- https://www.ugx-mods.com/downloads/tutorials/weapons_box.pdf

Reference audio was not downloaded or used in the application. No unofficial
origin story or licensing speculation was treated as fact. Research did not
include direct auditory inspection; this is an original synthesised interpretation
of the documented music-box character.

## Historical retained recording

The following credit applies to old Mystery Box hashes, no longer selected by
the current playback table. The audio-review/2026-10-19 source and notes remain.


**door creak 1.wav** by **soundofsong**, published on Freesound on 22 August 2022.

- Source and licence listing: https://freesound.org/people/soundofsong/sounds/647646/
- Licence: **Creative Commons Zero (CC0 1.0)** — https://creativecommons.org/publicdomain/zero/1.0/
- Public HQ preview used: https://cdn.freesound.org/previews/647/647646_9782868-hq.mp3
- Included original download: `soundofsong-647646-door-creak-hq.mp3`
- Decoded working copy: `soundofsong-647646-door-creak.wav`
- Working WAV SHA-256: `37321313bb2323e86a3f9e6861111d2f5f1a640dd0ac0b7a8865b05be66011b1`

The creator describes a recording of an aged wooden door creaking. The page marks the recording CC0 and permits commercial reuse and modification. This pack uses the public MP3 preview; the gated original WAV download was not accessed. The included working WAV is a decoded copy of that MP3, not the original lossless master.

Mystery Box A uses the active 0–900ms portion at its original speed, mixed to mono, edge-faded, level-matched and softened with the pack's general filtering. Mystery Box B uses the same recording at 90% playback speed for a slightly lower, longer creak. Both add a quiet synthesised latch, settle and final assembly chime. The recording supplies the audible hinge texture; the previous synthetic hinge was removed. The sample montages contain those revised box cues.

Attribution is retained here for traceability. No purchase, account creation, login or third-party generation service was used.

Source recording references describe the retained audio-review source folder. Deployed files are trimmed and mixed derivatives, named by content hash.
