# Original sound auditions

Original local synthesis candidates by the Daily Undead project. No samples or third-party melodies were used. These options are not selected in game. In round two, 1A is copied bit-identically for comparison.

Rebuild: `python scripts/build-audio-auditions.py` `--round-two` with numpy and macOS afconvert. Primary: 48 kHz mono 16-bit PCM WAV. Fallback/download: 192 kb/s AAC. Levels use active-window RMS and existing game gains; clipping and decoded-file checks are in qa-report.json. No subjective listening was possible.
