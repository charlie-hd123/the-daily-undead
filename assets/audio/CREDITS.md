# The Daily Undead sound effects · feedback revision 2.1

The active pack contains 17 original effects, all generated locally. No Treyarch
recording, transcribed melody, door creak, speech or background music is included
in the current playback table. No paid service or downloaded sample was used for
this revision.

## Latest listening feedback

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
