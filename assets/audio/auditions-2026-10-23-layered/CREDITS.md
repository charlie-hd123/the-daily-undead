# Original sound auditions

Original local synthesis candidates by the Daily Undead project. No samples or third-party melodies were used. Original 1G is copied bit-identically. 1G+ preserves its phrase and adds subtle animation-timed layers. Neither audition changes active game audio.

Rebuild: `python scripts/build-audio-auditions.py --layered-1g` with numpy and macOS afconvert. Primary: 48 kHz mono 16-bit PCM WAV. Fallback/download: 192 kb/s AAC. Levels use active-window RMS and existing game gains; clipping and decoded-file checks are in qa-report.json. No subjective listening was possible.
