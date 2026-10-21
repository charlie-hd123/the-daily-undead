"""Build the October 21 feedback revision. Python 3 + numpy; macOS afconvert.

Original synthesis only. Accepted sounds retain their existing waveform and
receive a level adjustment. Old content-addressed assets are left intact.
Run from the repository root. Use --verify to recheck without regenerating.
"""
from pathlib import Path
import csv
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
REVIEW = ROOT / 'audio-review/2026-10-21'
SR = 48000
RNG = np.random.default_rng(21102026)
BASE = '3baa928145f65d5acd8782afc43df2f467260cf9'
REMOVED = {'last-miss-warning', 'highest-round'}


def t(duration):
    return np.arange(round(duration * SR)) / SR


def env(times, attack=.002, decay=.08):
    return -np.expm1(-times / attack) * np.exp(-times / decay)


def canvas(duration):
    return np.zeros(round(duration * SR))


def put(dest, source, at=0, gain=1):
    start = round(at * SR)
    size = min(len(source), len(dest) - start)
    if size > 0:
        dest[start:start + size] += source[:size] * gain


def noise(duration, low, high):
    times = t(duration)
    bins = np.fft.rfftfreq(len(times), 1 / SR)
    response = (1 - np.exp(-(bins / low) ** 4)) * np.exp(-(bins / high) ** 4)
    x = np.fft.irfft(np.fft.rfft(RNG.normal(size=len(times))) * response, n=len(times))
    return x / max(np.std(x), 1e-12)


def tine(hz, duration=.65, decay=.18):
    """Dry struck steel tine: stable partials, no chorus/unison/flanger."""
    times = t(duration)
    x = np.zeros(len(times))
    for ratio, gain, lifetime in [(1, 1, 1), (3.006, .15, .43), (5.92, .035, .22)]:
        x += gain * np.sin(2 * np.pi * hz * ratio * times) * env(times, .0013, decay * lifetime)
    return x


def knock(hz=300, duration=.14):
    times = t(duration)
    x = np.zeros(len(times))
    for ratio, gain, decay in [(1, 1, .024), (2.72, .28, .012), (4.36, .09, .007)]:
        x += gain * np.sin(2 * np.pi * hz * ratio * times) * env(times, .0007, decay)
    return x


def mystery():
    """An original wind-up music-box phrase, not a transcription/sample."""
    x = canvas(3.5)
    # Original contour and rhythm. Lid opens for .850s; lift .620s;
    # settle 2.010s; final puzzle assembly 2.540s; end 3.500s.
    notes = [(0.015, 86), (.205, 81), (.390, 89), (.575, 88),
             (.755, 85), (.925, 88), (1.090, 91), (1.250, 89),
             (1.405, 86), (1.555, 81), (1.700, 83), (1.840, 85),
             (1.975, 86), (2.105, 89), (2.235, 88), (2.365, 85)]
    for index, (at, midi) in enumerate(notes):
        hz = 440 * 2 ** ((midi - 69) / 12)
        put(x, tine(hz, .64, .18), at, .78 if index % 4 == 0 else .57)
    # A tiny winding-key tap, no hinge, creak, noise bed or pitch wobble.
    put(x, knock(720, .10), 0, .12)
    for midi, gain in [(74, .25), (81, .22), (86, .42)]:
        put(x, tine(440 * 2 ** ((midi - 69) / 12), .96, .22), 2.540, gain)
    return x


def wrong():
    x = canvas(.29)
    put(x, knock(330, .14), 0, .8)
    put(x, tine(311.13, .27, .046), .009, .45)
    put(x, tine(277.18, .20, .043), .077, .32)
    return x


def clue():
    x = canvas(.43)
    times = t(.28)
    # Dry card/page turnover with two small tangible contact transients.
    page = noise(.28, 1100, 5800) * np.sin(np.pi * times / .28) ** 2
    put(x, page, .016, .10)
    put(x, knock(630, .16), 0, .52)
    put(x, tine(1046.50, .26, .048), .125, .14)
    put(x, knock(430, .16), .224, .19)
    return x


def points_tick():
    x = canvas(.075)
    put(x, knock(1050, .075), 0, .65)
    put(x, tine(1568, .075, .014), 0, .2)
    return x


def points_finish():
    x = canvas(.43)
    put(x, tine(1318.51, .43, .085), 0, .75)
    put(x, tine(1760, .36, .070), .025, .28)
    return x


def ended():
    x = canvas(1.35)
    # Dark chamber-organ descent with a restrained, nonverbal creature texture.
    for at, hz, level in [(0, 587.33, .55), (.175, 415.30, .47), (.365, 293.66, .60)]:
        times = t(.85)
        body = sum(np.sin(2*np.pi*hz*k*times) / k**1.8 for k in range(1, 7))
        put(x, body * env(times, .009, .13), at, level)
        put(x, tine(hz, .85, .16), at, .22)
    times = t(.82)
    phase = 2*np.pi*(145*times - 15*times**2)
    rasp = sum(np.sin(k*phase) / k**1.2 for k in range(2, 12))
    rasp *= np.sin(np.pi * times / .82)**2 * (.85 + .15*np.sin(2*np.pi*19*times))
    put(x, rasp, .12, .13)
    return x


def read_wav(path):
    with wave.open(str(path), 'rb') as stream:
        assert stream.getnchannels() == 1 and stream.getsampwidth() == 2
        rate = stream.getframerate()
        x = np.frombuffer(stream.readframes(stream.getnframes()), dtype='<i2').astype(float) / 32768
    return x, rate


def resample(x, rate):
    if rate == SR:
        return x
    # Band-limited FFT interpolation; no added detuning or spatial processing.
    size = round(len(x) * SR / rate)
    spectrum = np.fft.rfft(x)
    if len(x) % 2 == 0:
        spectrum[-1] *= .5
    return np.fft.irfft(spectrum, n=size) * size / len(x)


def active_rms(x):
    block = round(.04 * SR)
    blocks = np.pad(x, (0, (-len(x)) % block)).reshape(-1, block)
    levels = np.sqrt(np.mean(blocks * blocks, axis=1))
    return np.sqrt(np.mean(levels[levels > levels.max() * .2] ** 2))


def db(value):
    return round(float(20 * np.log10(max(value, 1e-12))), 3)


def true_peak(x):
    spectrum = np.fft.rfft(x)
    if len(x) % 2 == 0:
        spectrum[-1] *= .5
    return float(np.max(abs(np.fft.irfft(spectrum, n=4*len(x)) * 4)))


def master(x, target, original=False):
    x = x - np.mean(x)
    if not original:
        bins = np.fft.rfftfreq(len(x), 1 / SR)
        response = (bins**2 / (bins**2 + 85**2)) / np.sqrt(1 + (bins/10000)**12)
        x = np.fft.irfft(np.fft.rfft(x) * response, n=len(x))
    x *= 10 ** (target / 20) / max(active_rms(x), 1e-12)
    x *= min(1, 10 ** (-3.5/20) / max(true_peak(x), 1e-12))
    # Short edge tapers; the accepted waveforms otherwise keep their character.
    edge = min(96 if not original else 24, len(x)//3)
    x[:edge] *= np.linspace(0, 1, edge)
    x[-edge:] *= np.linspace(1, 0, edge)
    return x


def write_wav(path, x):
    dither = (RNG.random(len(x)) - RNG.random(len(x))) / 65536
    pcm = np.rint(np.clip(x + dither * (abs(x) > 1e-8), -1, 1) * 32767).astype('<i2')
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), 'wb') as stream:
        stream.setparams((1, 2, SR, len(pcm), 'NONE', 'not compressed'))
        stream.writeframes(pcm.tobytes())
    return pcm.astype(float) / 32768


def encode(path):
    subprocess.run(['/usr/bin/afconvert', '-f', 'm4af', '-d', 'aac', '-b', '192000',
                    str(path), str(path.with_suffix('.m4a'))], check=True, capture_output=True)


def export_asset(path, cue):
    sha = hashlib.sha256(path.read_bytes()).hexdigest()[:10]
    name = f'{cue}-{sha}{path.suffix}'
    (ASSETS / name).write_bytes(path.read_bytes())
    return name


def build():
    old_js = subprocess.check_output(['git', 'show', f'{BASE}:js/game-audio.js'], cwd=ROOT, text=True)
    old = json.loads(re.search(r'export const SOUND_CUES = (\{.*?\});', old_js, re.S).group(1))
    specs = {
        'mystery-box-a': (mystery, -18, .86, 'Mystery Box · Wind-up jingle', 'Opening', 'Once on box opening, aligned to the 3.5-second animation.'),
        'letter-wrong': (wrong, -18, .83, 'Wrong letter · Muted knock', 'Last Words', 'Wrong letter or incorrect bonus order.'),
        'quest-clue-reveal': (clue, -18, .80, 'Quest clue · Card turn', 'Quest Steps', 'When the next clue appears.'),
        'map-select': (lambda: knock(285, .16), -18.5, .78, 'Button / map selection · Low click', 'Interface', 'Ordinary button presses and map/game selection; dedicated gameplay cues take priority.'),
        'points-tick': (points_tick, -19, .88, 'Points · Counting tick', 'Rewards', 'Seven ticks across the 720 ms visible score animation.'),
        'points-finish': (points_finish, -17, .90, 'Points · Finishing ping', 'Rewards', 'When the visible points count finishes.'),
        'run-ended': (ended, -17.5, .93, 'Run ended · Undead descent', 'Outcomes', 'Once on an actual failed puzzle.'),
    }
    accepted = {
        'letter-correct': ('Correct letter', 'Last Words', 'Accepted correct letter guess.'),
        **{f'letter-streak-{i}': (f'Correct streak · {i if i < 4 else "4+"}', 'Last Words', f'Correct guess number {i} in a row; fourth variant repeats for longer streaks.') for i in range(2,5)},
        'answer-lock': ('Answer confirmation', 'Quest Steps', 'Accepted map confirmation or correct bonus-order submission.'),
        'puzzle-solved-a': ('Puzzle solved · Survival signal', 'Rewards', 'Once on successful word or map completion.'),
        **{f'bonus-step-{i}': (f'Bonus selection · Step {i}', 'Quest Steps', f'New bonus selection in position {i}.') for i in range(1,4)},
        'double-points-a': ('Double Points · Survival amplified', 'Rewards', 'Once when the Double Points result appears.'),
    }
    manifest, buffers, cues = [], {}, {}
    for cue, source in old.items():
        if cue in REMOVED:
            continue
        original = cue not in specs
        if original:
            x, rate = read_wav(ASSETS / next(f for f in source['files'] if f.endswith('.wav')))
            x = resample(x, rate)
            is_reward = cue in {'puzzle-solved-a', 'double-points-a'}
            target, gain = -17, (1.0 if cue == 'double-points-a' else .96 if is_reward else .80)
            title, group, trigger = accepted[cue]
        else:
            synth, target, gain, title, group, trigger = specs[cue]
            x = synth()
        path = REVIEW / 'wav' / f'{cue}.wav'
        x = write_wav(path, master(x, target, original))
        encode(path)
        compressed = REVIEW / 'm4a' / f'{cue}.m4a'
        compressed.parent.mkdir(parents=True, exist_ok=True)
        path.with_suffix('.m4a').replace(compressed)
        cues[cue] = dict(files=[export_asset(path, cue), export_asset(compressed, cue)], gain=gain)
        buffers[cue] = x
        manifest.append(dict(id=cue, title=title, group=group, trigger=trigger,
                             wav=f'wav/{cue}.wav', compressed=f'm4a/{cue}.m4a',
                             duration=round(len(x)/SR, 4), volume=gain,
                             note='Accepted sound; level adjusted only.' if original else 'Rewritten from original synthesis. Dry mono, no chorus or flanging.',
                             peak_dbfs=db(max(abs(x))), true_peak_4x_dbfs=db(true_peak(x)),
                             active_rms_dbfs=db(active_rms(x)), effective_rms_dbfs=db(active_rms(x)*gain),
                             waveform=[round(float(np.max(abs(a))),4) for a in np.array_split(x,80)]))
    # Audition with the same playback gains and realistic cue overlaps.
    events = [(0,'mystery-box-a'),(4,'letter-correct'),(4.7,'letter-streak-2'),
              (5.4,'letter-streak-3'),(6.1,'letter-streak-4'),(6.9,'letter-wrong'),
              (7.6,'puzzle-solved-a'),(8.02,'points-tick'),(8.74,'points-finish'),
              (10,'map-select'),(10.5,'quest-clue-reveal'),(11.3,'map-select'),
              (11.8,'answer-lock'),(11.89,'puzzle-solved-a'),(13.5,'bonus-step-1'),
              (14.0,'bonus-step-2'),(14.5,'bonus-step-3'),(15,'answer-lock'),
              (15.8,'double-points-a'),(15.8,'points-tick'),(16.52,'points-finish'),(18.1,'run-ended')]
    for start in [8.02,15.8]:
        events.extend((start+i*.09,'points-tick') for i in range(1,7))
    sequence = canvas(19.6)
    for at,cue in events:
        put(sequence,buffers[cue],at,cues[cue]['gain'])
    peak = true_peak(sequence)
    assert peak < 10**(-1/20), f'Mixed gameplay sequence needs more headroom: {db(peak)} dBTP'
    sequence_path = REVIEW/'wav/sample-gameplay.wav'
    write_wav(sequence_path,sequence)
    encode(sequence_path)
    sequence_path.with_suffix('.m4a').replace(REVIEW/'m4a/sample-gameplay.m4a')
    pack = dict(title='The Daily Undead · Sound feedback revision',version='2.0',date='2026-10-21',
                source_commit=BASE,sample_rate=SR,channels=1,pcm_bits=16,sounds=manifest,
                removed=sorted(REMOVED),cues=cues,
                sequences=[dict(variant='A',wav='wav/sample-gameplay.wav',compressed='m4a/sample-gameplay.m4a',
                                duration=19.6,events=[dict(at=at,id=cue,label=next(s['title'] for s in manifest if s['id']==cue)) for at,cue in sorted(events)])],
                mixed_sequence_true_peak_dbfs=db(peak),
                provenance='Original local synthesis. No Treyarch audio or melodies sampled/transcribed; no door recording used. Accepted cues retain their sound with level-only remastering.',
                listening_assessment=False)
    deployed = {**pack, 'sequences': [], 'sounds': [
        {**item, 'wav': cues[item['id']]['files'][0], 'compressed': cues[item['id']]['files'][1]}
        for item in manifest
    ]}
    (ASSETS/'manifest.json').write_text(json.dumps(deployed,indent=2)+'\n')
    (REVIEW/'manifest.json').write_text(json.dumps(pack,indent=2)+'\n')
    (REVIEW/'manifest-data.js').write_text('window.SOUND_PACK = '+json.dumps(pack,separators=(',',':'))+';\n')
    with (REVIEW/'manifest.csv').open('w',newline='') as stream:
        keys=['id','title','group','trigger','wav','compressed','duration','volume','note','peak_dbfs','active_rms_dbfs','effective_rms_dbfs']
        writer=csv.DictWriter(stream,fieldnames=keys,extrasaction='ignore'); writer.writeheader(); writer.writerows(manifest)
    # Update only the cue table; engine edits are independently reviewed.
    game_audio=ROOT/'js/game-audio.js'
    js=game_audio.read_text()
    js=re.sub(r'export const SOUND_CUES = \{.*?\};',lambda _: 'export const SOUND_CUES = '+json.dumps(cues,indent=2)+';',js,count=1,flags=re.S)
    game_audio.write_text(js)
    print(f'Built {len(manifest)} cues + gameplay montage; mix peak {db(peak)} dBTP.')


def verify():
    pack=json.loads((REVIEW/'manifest.json').read_text())
    checks=[]
    with tempfile.TemporaryDirectory(prefix='daily-undead-audio-') as temp:
        for item in pack['sounds']+pack['sequences']:
            path=REVIEW/item['wav']; x,rate=read_wav(path)
            assert rate==SR and np.isfinite(x).all()
            assert abs(len(x)/SR-item['duration'])<.001
            assert x[0]==0 and x[-1]==0
            assert true_peak(x)<10**(-.9/20)
            decoded=Path(temp)/(path.stem+'.wav')
            subprocess.run(['/usr/bin/afconvert','-f','WAVE','-d','LEI16',str(REVIEW/item['compressed']),str(decoded)],check=True,capture_output=True)
            y,y_rate=read_wav(decoded)
            assert y_rate==SR and abs(len(y)-len(x))/SR<.1
            assert true_peak(y)<10**(-.1/20)
            checks.append(dict(id=item.get('id','sample-gameplay'),duration=len(x)/SR,
                               true_peak_dbfs=db(true_peak(x)),aac_true_peak_dbfs=db(true_peak(y))))
    report=dict(result='PASS',format='48 kHz mono 16-bit PCM WAV primary, 192 kb/s AAC fallback',
                source_and_aac_decode_checks=checks,listening_assessment=False)
    (REVIEW/'qa-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(f'PASS: {len(checks)} lossless WAVs and AAC decodes; finite, silent endpoints, no sample/4x peak clipping.')


if __name__=='__main__':
    if '--verify' not in sys.argv:
        build()
    verify()
