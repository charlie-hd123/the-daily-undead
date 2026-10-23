# Original sound auditions

Original local synthesis candidates by the Daily Undead project. No samples or third-party melodies were used. Box endings are auditions; 8E is the selected in-game clue sound, copied bit-identically.

Rebuild: `python scripts/build-audio-auditions.py --rewarding-endings` with numpy and macOS afconvert. Primary: 48 kHz mono 16-bit PCM WAV. Fallback/download: 192 kb/s AAC. Levels use active-window RMS and existing game gains; clipping and decoded-file checks are in qa-report.json. No subjective listening was possible.
