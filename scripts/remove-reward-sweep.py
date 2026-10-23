"""Remove only the embedded 190–610 ms air sweep from the approved reward.

The isolated component is reconstructed from the original October 19 renderer's
PCG64 state at that sweep and its two mastering gains. The original render was
checked against the active file (correlation 1.0). No unrelated cue is rendered.
"""
from pathlib import Path
import hashlib
import importlib.util
import json
import subprocess
import tempfile
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('synthesis', ROOT/'scripts/synthesise-feedback.py')
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)
assets = ROOT/'assets/audio'
source = assets/'double-points-a-d81c85b7a7.wav'
assert hashlib.sha256(source.read_bytes()).hexdigest().startswith('d81c85b7a7')
original, rate = s.read_wav(source)
assert rate == s.SR

# Exact original component, before the shared filter/mastering chain.
rate_v1 = 44100
rng = np.random.default_rng()
rng.bit_generator.state = dict(bit_generator='PCG64', state=dict(
    state=139649139318295823793031919326292154143,
    inc=261520169392212776437082417931477266617), has_uint32=0, uinteger=0)
t = np.arange(round(.42*rate_v1))/rate_v1
bins = np.fft.rfftfreq(len(t), 1/rate_v1)
response = (1-np.exp(-(bins/450)**4))*np.exp(-(bins/2900)**4)
noise = np.fft.irfft(np.fft.rfft(rng.normal(size=len(t)))*response, n=len(t))
noise /= np.std(noise)+1e-12
phase = 2*np.pi*(600*t+700*t*t/(2*.42))
air = np.sin(np.pi*t/.42)**1.8*(noise*.12+np.sin(phase)*.10+np.sin(phase*1.004)*.065)
stem = np.zeros(round(1.65*rate_v1))
start = round(.19*rate_v1)
stem[start:start+len(air)] = air*.12
bins = np.fft.rfftfreq(len(stem), 1/rate_v1)
stem = np.fft.irfft(np.fft.rfft(stem-np.mean(stem))*(bins*bins/(bins*bins+120**2))
                    /np.sqrt(1+(bins/5200)**8), n=len(stem))*.5074456433569472
edge = round(.008*rate_v1)
stem[:edge] *= np.linspace(0,1,edge)
stem[-edge:] *= np.linspace(1,0,edge)
stem = s.resample(stem, rate_v1)
stem = (stem-np.mean(stem))*1.7804092421657831
stem[:24] *= np.linspace(0,1,24)
stem[-24:] *= np.linspace(1,0,24)
assert len(stem) == len(original)
clean = original-stem
# Same active-window loudness as the accepted flourish, with no new layers.
clean = s.master(clean, -17, original=True)

with tempfile.TemporaryDirectory(prefix='undead-clean-reward-') as temporary:
    wav = Path(temporary)/'double-points-a.wav'
    clean = s.write_wav(wav, clean)
    s.encode(wav)
    names = [s.export_asset(path, 'double-points-a') for path in [wav, wav.with_suffix('.m4a')]]
    decoded = Path(temporary)/'decoded.wav'
    subprocess.run(['/usr/bin/afconvert','-f','WAVE','-d','LEI16',str(wav.with_suffix('.m4a')),str(decoded)],
                   check=True,capture_output=True)
    aac, aac_rate = s.read_wav(decoded)
    assert aac_rate == rate and abs(len(aac)-len(clean))/rate < .1
    assert clean[0] == 0 and clean[-1] == 0
    assert np.isfinite(clean).all() and s.true_peak(clean) < 10**(-3.4/20)
    assert s.true_peak(aac) < 10**(-.1/20)

pack = json.loads((assets/'manifest.json').read_text())
item = next(x for x in pack['sounds'] if x['id']=='double-points-a')
old_names = [item['wav'], item['compressed']]
item.update(wav=names[0], compressed=names[1], duration=len(clean)/rate,
            note='Accepted reward chimes and timing retained. Embedded 190–610 ms airy sweep removed by component subtraction; loudness matched.',
            peak_dbfs=s.db(max(abs(clean))), true_peak_4x_dbfs=s.db(s.true_peak(clean)),
            active_rms_dbfs=s.db(s.active_rms(clean)), effective_rms_dbfs=s.db(s.active_rms(clean)*item['volume']),
            waveform=[round(float(np.max(abs(a))),4) for a in np.array_split(clean,80)])
pack['cues']['double-points-a']['files'] = names
pack.update(version='2.7', date='2026-10-23', revised_cues=['double-points-a'],
            source_commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip())
(assets/'manifest.json').write_text(json.dumps(pack,indent=2)+'\n')
script = ROOT/'js/game-audio.js'
code = script.read_text()
for old,new in zip(old_names,names):
    code = code.replace(old,new)
script.write_text(code)
report = dict(result='PASS', source=source.name, files=names, duration=len(clean)/rate,
              removed_layer_seconds=[.19,.61], active_rms_dbfs=s.db(s.active_rms(clean)),
              wav_true_peak_dbfs=s.db(s.true_peak(clean)), aac_true_peak_dbfs=s.db(s.true_peak(aac)),
              listening_assessment=False)
review = ROOT/'.releases/reviews/reward-sweep-qa.json'
review.parent.mkdir(parents=True,exist_ok=True)
review.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
