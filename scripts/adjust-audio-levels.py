"""Apply the owner's volume feedback to the selected October 24 sound pack.

Rebuilds from the committed import, never from an already adjusted render.
Requires numpy and macOS afconvert; leaves the supplied original WAVs untouched.
"""
from pathlib import Path
import importlib.util
import json
import subprocess
import tempfile
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets/audio'
BASE = '1d8b4ae073f037d71546f3c27424833a33656c28'
CHANGES = {
    'letter-correct': 3, 'letter-streak-2': 3, 'letter-streak-3': 3, 'letter-streak-4': 3,
    'quest-clue-reveal': -3, 'bonus-step-1': -3, 'bonus-step-2': -3, 'bonus-step-3': -3,
    'double-points-a': -6,
}
spec = importlib.util.spec_from_file_location('audio_import', ROOT / 'scripts/import-user-audio.py')
a = importlib.util.module_from_spec(spec)
spec.loader.exec_module(a)


def main():
    baseline = json.loads(subprocess.check_output(['git', 'show', f'{BASE}:assets/audio/manifest.json'], cwd=ROOT, text=True))
    manifest = json.loads((ASSETS / 'manifest.json').read_text())
    code_path = ROOT / 'js/game-audio.js'
    code = code_path.read_text()
    report = []
    with tempfile.TemporaryDirectory(prefix='undead-levels-') as temporary:
        for cue, change in CHANGES.items():
            original = next(row for row in baseline['sounds'] if row['id'] == cue)
            row = next(row for row in manifest['sounds'] if row['id'] == cue)
            x, rate = a.read(ASSETS / original['wav'])
            original_level = a.db(a.active_rms(x, rate, True) * row['volume'])
            if cue == 'double-points-a':
                frequencies = np.fft.rfftfreq(len(x), 1 / rate)
                # Smooth 5dB treble shelf above 2.5kHz and gentle ultrasonic rolloff.
                # No pitch, stereo, delay or reverb changes.
                shelf = 10 ** (-5 / 20 * frequencies ** 2 / (frequencies ** 2 + 2500 ** 2))
                response = shelf / np.sqrt(1 + (frequencies / 10000) ** 4)
                x = np.fft.irfft(np.fft.rfft(x, axis=0) * response[:, None], n=len(x), axis=0)
                x[:64] *= np.linspace(0, 1, 64)[:, None]
                x[-64:] *= np.linspace(1, 0, 64)[:, None]
            x *= 10 ** (change / 20)
            wav = Path(temporary) / (cue + '.wav')
            x = a.write(wav, x, rate)
            compressed = wav.with_suffix('.m4a')
            subprocess.run(['/usr/bin/afconvert', '-f', 'm4af', '-d', 'aac', '-b', '192000', str(wav), str(compressed)], check=True, capture_output=True)
            decoded = Path(temporary) / (cue + '-decoded.wav')
            subprocess.run(['/usr/bin/afconvert', '-f', 'WAVE', '-d', 'LEI16', str(compressed), str(decoded)], check=True, capture_output=True)
            aac, aac_rate = a.read(decoded)
            assert rate == aac_rate and x.shape[1] == aac.shape[1]
            assert np.isfinite(x).all() and np.isfinite(aac).all() and np.max(abs(aac)) < .999
            assert abs(len(aac) - len(x)) / rate < .1
            gain = row['volume']
            assert a.true_peak(x) * gain < 10 ** (-3.4 / 20)
            assert a.true_peak(aac) * gain < 10 ** (-3 / 20)
            files = [a.export(wav, cue), a.export(compressed, cue)]
            for old, new in zip(manifest['cues'][cue]['files'], files):
                code = code.replace(old, new)
            manifest['cues'][cue]['files'] = files
            row.update(wav=files[0], compressed=files[1], peak_dbfs=a.db(np.max(abs(x))),
                       true_peak_4x_dbfs=a.db(a.true_peak(x)), active_rms_dbfs=a.db(a.active_rms(x, rate)),
                       effective_rms_dbfs=a.db(a.active_rms(x, rate) * gain),
                       weighted_active_playback_dbfs=a.db(a.active_rms(x, rate, True) * gain),
                       waveform=[round(float(np.max(abs(part))), 4) for part in np.array_split(x, 80)],
                       note=f'Owner feedback: {change:+}dB relative to the selected import.' + (' Treble softened with a 5dB shelf above 2.5kHz.' if cue == 'double-points-a' else ' Pitch, duration, stereo and existing effects preserved.'))
            report.append(dict(cue=cue, gain_change_db=change, before_weighted_playback_dbfs=original_level,
                               after_weighted_playback_dbfs=row['weighted_active_playback_dbfs'],
                               wav_playback_true_peak_dbfs=a.db(a.true_peak(x) * gain),
                               aac_playback_true_peak_dbfs=a.db(a.true_peak(aac) * gain), files=files))
    unchanged = set(manifest['cues']) - set(CHANGES)
    assert all(manifest['cues'][cue] == baseline['cues'][cue] for cue in unchanged)
    manifest.update(version='4.1', revised_cues=list(CHANGES),
                    provenance=baseline['provenance'] + ' Owner feedback: correct letters +3dB, clue/bonus selections -3dB, reward flourish -6dB with softer treble. Eight other cue pairs unchanged.',
                    source_commit=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip())
    events = [('points-tick', i * .09) for i in range(7)] + [('points-finish', .72), ('double-points-a', 1.45)]
    buffers = {cue: (*a.read(ASSETS / manifest['cues'][cue]['files'][0]), manifest['cues'][cue]['gain']) for cue, _ in events}
    mixed = np.zeros((max(round(t * 44100) + len(buffers[cue][0]) for cue, t in events), 2))
    for cue, at in events:
        x, rate, gain = buffers[cue]
        start = round(at * rate)
        mixed[start:start + len(x)] += x * gain
    manifest['mixed_sequence_true_peak_dbfs'] = a.db(a.true_peak(mixed))
    (ASSETS / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    code_path.write_text(code)
    qa = dict(baseline=BASE, subjective_listening=False, unchanged_cues=sorted(unchanged),
              changes=report, mixed_sequence_true_peak_dbfs=manifest['mixed_sequence_true_peak_dbfs'])
    (ASSETS / 'level-feedback-qa-2026-10-24.json').write_text(json.dumps(qa, indent=2) + '\n')
    print(json.dumps(qa, indent=2))


if __name__ == '__main__': main()
