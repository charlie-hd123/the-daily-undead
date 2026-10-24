"""Master the 17 user-selected replacement WAVs; originals are read-only.

Requires numpy and macOS afconvert. Run with the source directory as argument.
Preserves source sample rate, stereo image, pitch and audible reverb. Loudness
uses frequency-weighted, gated 40 ms RMS (not a certified LUFS measurement).
"""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import sys
import tempfile
import wave
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets/audio'
CUES = ['mystery-box-a', 'letter-correct', 'letter-streak-2', 'letter-streak-3',
        'letter-streak-4', 'letter-wrong', 'quest-clue-reveal', 'map-select',
        'answer-lock', 'puzzle-solved-a', 'bonus-step-1', 'bonus-step-2',
        'bonus-step-3', 'double-points-a', 'points-tick', 'points-finish', 'run-ended']
# Effective playback targets; frequent controls sit below outcome/reward sounds.
TARGETS = [-20, -20, -20, -20, -20, -21, -22, -23, -20,
           -18, -21, -21, -21, -17.5, -26, -20, -19]
CEILING = 10 ** (-3.5 / 20)


def read(path):
    with wave.open(str(path)) as stream:
        assert stream.getsampwidth() == 2 and stream.getnchannels() in (1, 2)
        rate = stream.getframerate()
        data = np.frombuffer(stream.readframes(stream.getnframes()), '<i2')
        return data.reshape(-1, stream.getnchannels()).astype(float) / 32768, rate


def db(value):
    return round(float(20 * np.log10(max(value, 1e-12))), 3)


def active_rms(x, rate, weighted=False):
    if weighted:
        # Gentle perceptual weighting: suppress sub-bass and weight bright cues.
        bins = np.fft.rfftfreq(len(x), 1 / rate)
        response = (bins ** 2 / (bins ** 2 + 80 ** 2)) * (1 + .585 * bins ** 2 / (bins ** 2 + 1500 ** 2))
        x = np.fft.irfft(np.fft.rfft(x, axis=0) * response[:, None], n=len(x), axis=0)
    block = round(rate * .04)
    padded = np.pad(x, ((0, (-len(x)) % block), (0, 0)))
    power = np.mean(padded.reshape(-1, block, x.shape[1]) ** 2, axis=(1, 2))
    return np.sqrt(np.mean(power[power > power.max() * .01]))


def true_peak(x):
    spectrum = np.fft.rfft(x, axis=0)
    if len(x) % 2 == 0:
        spectrum[-1] *= .5
    return float(np.max(abs(np.fft.irfft(spectrum, n=4 * len(x), axis=0) * 4)))


def trim(x, rate, cue):
    # Keep the attack position and all audible decay. Remove only quiet padding.
    block = round(rate * .02)
    padded = np.pad(x, ((0, (-len(x)) % block), (0, 0)))
    energy = np.sqrt(np.mean(padded.reshape(-1, block, x.shape[1]) ** 2, axis=(1, 2)))
    last = np.flatnonzero(energy > energy.max() * 10 ** (-48 / 20))[-1]
    end = min(len(x), (last + 1) * block + round(rate * .04))
    if cue == 'points-tick':
        # The supplied tick's body is under 100 ms; remove its almost-silent
        # residual tail so seven count ticks don't accumulate long echo voices.
        end = min(end, round(rate * .15))
    x = x[:end].copy()
    x[:round(rate * .001)] *= np.linspace(0, 1, round(rate * .001))[:, None]
    fade = min(round(rate * (.015 if cue == 'points-tick' else .025)), len(x))
    x[-fade:] *= np.linspace(1, 0, fade)[:, None]
    return x


def write(path, x, rate):
    rng = np.random.default_rng(20261024)
    dither = (rng.random(x.shape) - rng.random(x.shape)) / 65536
    pcm = np.rint(np.clip(x + dither * (abs(x) > 1e-8), -1, 1) * 32767).astype('<i2')
    pcm[0] = 0
    pcm[-1] = 0
    with wave.open(str(path), 'wb') as stream:
        stream.setparams((x.shape[1], 2, rate, len(x), 'NONE', 'not compressed'))
        stream.writeframes(pcm.tobytes())
    return pcm.astype(float) / 32768


def export(path, cue):
    name = f'{cue}-{hashlib.sha256(path.read_bytes()).hexdigest()[:10]}{path.suffix}'
    (ASSETS / name).write_bytes(path.read_bytes())
    return name


def catch_transients(x, rate, gain):
    # Stereo-linked peak control only when a large isolated spike would force
    # the entire sound several dB below its neighbours. Sub-ms lookahead and a
    # 25ms recovery preserve the body, spatial image and reverb.
    wanted = np.minimum(1, CEILING / np.maximum(np.max(abs(x), axis=1) * gain, 1e-12))
    envelope = wanted.copy()
    recovery = np.exp(-1 / (rate * .025))
    for i in range(1, len(envelope)):
        envelope[i] = min(wanted[i], 1 - (1 - envelope[i - 1]) * recovery)
    attack = np.exp(-1 / (rate * .0005))
    for i in range(len(envelope) - 2, -1, -1):
        envelope[i] = min(envelope[i], 1 - (1 - envelope[i + 1]) * attack)
    return x * envelope[:, None], db(np.min(envelope))


def main():
    directory = Path(sys.argv[1]).expanduser().resolve()
    inputs = sorted(directory.glob('*.wav'))
    assert len(inputs) == len(CUES), 'Expected exactly 17 numbered WAVs.'
    assert [int(path.name.split('_')[0]) for path in inputs] == list(range(1, 18))
    code_path = ROOT / 'js/game-audio.js'
    code = code_path.read_text()
    old_cues = json.loads(code.split('export const SOUND_CUES = ', 1)[1].split(';', 1)[0])
    manifest = json.loads((ASSETS / 'manifest.json').read_text())
    rows = {item['id']: item for item in manifest['sounds']}
    report, mastered = [], {}
    new_cues = {}
    with tempfile.TemporaryDirectory(prefix='undead-user-audio-') as temporary:
        for path, cue, target in zip(inputs, CUES, TARGETS):
            original, rate = read(path)
            x = trim(original, rate, cue)
            x -= np.mean(x, axis=0)
            # Reapply tiny edge tapers after DC removal.
            x[:32] *= np.linspace(0, 1, 32)[:, None]
            x[-32:] *= np.linspace(1, 0, 32)[:, None]
            gain = old_cues[cue]['gain']
            requested_scale = 10 ** (target / 20) / (active_rms(x, rate, True) * gain)
            safe_scale = CEILING / (true_peak(x) * gain)
            transient_reduction = 0
            if db(requested_scale / safe_scale) > 1.5:
                x, transient_reduction = catch_transients(x * requested_scale, rate, gain)
                scale = min(1, CEILING / (true_peak(x) * gain))
                x *= scale
                scale *= requested_scale
            else:
                scale = min(requested_scale, safe_scale)
                x *= scale
            wav = Path(temporary) / (cue + '.wav')
            x = write(wav, x, rate)
            compressed = wav.with_suffix('.m4a')
            subprocess.run(['/usr/bin/afconvert', '-f', 'm4af', '-d', 'aac', '-b', '192000', str(wav), str(compressed)], check=True, capture_output=True)
            decoded = Path(temporary) / (cue + '-decoded.wav')
            subprocess.run(['/usr/bin/afconvert', '-f', 'WAVE', '-d', 'LEI16', str(compressed), str(decoded)], check=True, capture_output=True)
            aac, aac_rate = read(decoded)
            assert aac_rate == rate and aac.shape[1] == x.shape[1]
            assert abs(len(aac) - len(x)) / rate < .1
            assert np.isfinite(x).all() and np.isfinite(aac).all()
            assert true_peak(x) * gain < 10 ** (-3.4 / 20)
            assert true_peak(aac) * gain < 10 ** (-1 / 20)
            assert np.max(abs(aac)) < .999, 'AAC decode sample clipping'
            files = [export(wav, cue), export(compressed, cue)]
            new_cues[cue] = dict(files=files, gain=gain)
            if cue == 'points-finish':
                new_cues[cue]['duration'] = round(len(x) / rate, 6)
            title = path.stem.split('_', 1)[1].removesuffix('_NEW')
            row = dict(id=cue, title=title, group=rows[cue]['group'], trigger=rows[cue]['trigger'],
                       wav=files[0], compressed=files[1], duration=round(len(x) / rate, 6),
                       volume=gain, channels=x.shape[1], sample_rate=rate, pcm_bits=16,
                       note='User-selected replacement. Level matched; source pitch and stereo image retained.',
                       peak_dbfs=db(np.max(abs(x))), true_peak_4x_dbfs=db(true_peak(x)),
                       active_rms_dbfs=db(active_rms(x, rate)), effective_rms_dbfs=db(active_rms(x, rate) * gain),
                       weighted_active_playback_dbfs=db(active_rms(x, rate, True) * gain),
                       waveform=[round(float(np.max(abs(a))), 4) for a in np.array_split(x, 80)])
            # Keep current trigger descriptions, rather than historical creation details.
            if cue == 'mystery-box-a': row['trigger'] = 'The Mystery Box opens and reveals the assigned puzzle during its 5.8-second sequence.'
            if cue == 'quest-clue-reveal': row['trigger'] = 'A new Quest Steps clue is revealed.'
            manifest['sounds'][CUES.index(cue)] = row
            mastered[cue] = (x, rate, gain)
            mono = np.mean(x, axis=1)
            report.append(dict(cue=cue, source_filename=path.name, source_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                               source_seconds=round(len(original) / rate, 6), output_seconds=row['duration'],
                               adjustment_db=db(scale), target_weighted_playback_dbfs=target,
                               maximum_transient_reduction_db=transient_reduction,
                               achieved_weighted_playback_dbfs=row['weighted_active_playback_dbfs'],
                               wav_playback_true_peak_dbfs=db(true_peak(x) * gain),
                               aac_playback_true_peak_dbfs=db(true_peak(aac) * gain),
                               mono_average_vs_channel_rms_db=db(np.sqrt(np.mean(mono ** 2)) / np.sqrt(np.mean(x ** 2))),
                               trimmed_tail_seconds=round((len(original) - len(x)) / rate, 6), files=files))
    # Worst-aligned count montage, before the existing runtime safety compressor.
    rate = mastered['points-tick'][1]
    finish_wait = max(500, round(new_cues['points-finish']['duration'] * 1000) + 70)
    events = [('points-tick', i * .09) for i in range(7)] + [('points-finish', .72), ('double-points-a', .72 + finish_wait / 1000)]
    length = max(round(at * rate) + len(mastered[cue][0]) for cue, at in events)
    mix = np.zeros((length, 2))
    for cue, at in events:
        data, sr, gain = mastered[cue]
        assert sr == rate
        start = round(at * rate)
        mix[start:start + len(data)] += data * gain
    mix_peak = db(true_peak(mix))
    assert mix_peak < -1, f'Count/reward overlap needs adjustment: {mix_peak}'
    manifest.update(title='The Daily Undead · User-selected sound pack', version='4.0', date='2026-10-24',
                    source_commit=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
                    sample_rate=44100, channels='mono/stereo; see individual cues', pcm_bits=16,
                    cues=new_cues, revised_cues=CUES, sequences=[], mixed_sequence_true_peak_dbfs=mix_peak,
                    provenance='17 replacement WAVs supplied by the site owner in NEW AUDIO. No third-party downloads or new sound generation in this import.',
                    sources=[dict(kind='user-provided', source_filename=p.name, sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in inputs],
                    box_animation_seconds=dict(lid=.85, liftAt=.45, liftFor=1, cycleAt=.95, cycleFor=2.8, settleAt=4.3, settleFor=1, assembleAt=4.9, finishAt=5.8),
                    listening_assessment=False)
    (ASSETS / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    replacement = 'export const SOUND_CUES = ' + json.dumps(new_cues, indent=2) + ';'
    code = re.sub(r'export const SOUND_CUES = \{.*?\n\};', lambda _: replacement, code, count=1, flags=re.S)
    code_path.write_text(code)
    qa = dict(date='2026-10-24', method='Frequency-weighted active 40ms RMS, -20dB relative energy gate; not certified LUFS. File gain includes runtime cue gain. 4x FFT-interpolated true peaks; AAC decode checks. Source originals untouched.',
              subjective_listening=False, count_finish_to_reward_ms=finish_wait, mixed_sequence_true_peak_dbfs=mix_peak, sounds=report)
    (ASSETS / 'replacement-qa-2026-10-24.json').write_text(json.dumps(qa, indent=2) + '\n')
    print(json.dumps(dict(sounds=len(report), finish_wait_ms=finish_wait, mixed_true_peak_dbfs=mix_peak, levels=[dict(cue=r['cue'],seconds=r['output_seconds'],level=r['achieved_weighted_playback_dbfs'],adjustment=r['adjustment_db']) for r in report]), indent=2))


if __name__ == '__main__': main()
