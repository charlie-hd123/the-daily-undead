"""Recorded chest foley + original 1G, dark reverb and quiet harmonic atmosphere.

Rebuilds only mystery-box-a. Source recording/CC0 details are retained beside
the downloaded HQ preview. No late settle/assembly impacts are used.
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
recording = assets/'sources/wooden-chest-573654-hq.mp3'
assert hashlib.sha256(recording.read_bytes()).hexdigest() == '23d40436fe798f45e6c48f8405e0e99664e502e6be0f35351f2374998bdbd516'
original, rate = s.read_wav(assets/'mystery-box-a-7ace408112.wav')
assert rate == s.SR
length = 3.42
jingle = s.canvas(length)
# The musical phrase starts at 140 ms and ends at 1.73 s. Keep it from the
# accepted PCM; exclude the initial synthetic knock and both post-jingle thuds.
jingle[:round(1.85*rate)] = original[:round(1.85*rate)]
jingle[:round(.12*rate)] = 0
edge = round(.008*rate)
jingle[round(.12*rate):round(.12*rate)+edge] *= np.linspace(0,1,edge)
assert not np.any(jingle[round(1.85*rate):])

with tempfile.TemporaryDirectory(prefix='undead-box-') as directory:
    decoded = Path(directory)/'chest.wav'
    subprocess.run(['/usr/bin/afconvert','-f','WAVE','-d','LEI16','-c','1',str(recording),str(decoded)],
                   check=True,capture_output=True)
    chest, chest_rate = s.read_wav(decoded)
    # Opening contact and lid movement only, at natural speed; no later impact.
    chest = s.resample(chest[round(.18*chest_rate):round(.84*chest_rate)], chest_rate)

chest -= np.mean(chest)
bins = np.fft.rfftfreq(len(chest), 1/rate)
chest = np.fft.irfft(np.fft.rfft(chest)*(bins*bins/(bins*bins+110**2))
                     /np.sqrt(1+(bins/6400)**8), n=len(chest))
# Gentle saturation controls the isolated recording's sharp contact peaks.
chest *= .085/max(s.active_rms(chest),1e-12)
chest = .38*np.tanh(chest/.38)
edge = round(.005*rate)
chest[:edge] *= np.linspace(0,1,edge)
chest[-round(.035*rate):] *= np.linspace(1,0,round(.035*rate))
foley = s.canvas(length)
s.put(foley,chest,0)

# A diffuse, dark room response with 45 ms predelay; no discrete late taps.
rng = np.random.default_rng(23102026)
t = s.t(1.50)
impulse = rng.normal(size=len(t))*np.exp(-t/.285)*(-np.expm1(-t/.012))
bins = np.fft.rfftfreq(len(impulse), 1/rate)
impulse = np.fft.irfft(np.fft.rfft(impulse)*(bins*bins/(bins*bins+230**2))
                       /np.sqrt(1+(bins/3300)**6), n=len(impulse))
size = 1 << (len(jingle)+len(impulse)-1).bit_length()
response = np.fft.irfft(np.fft.rfft(jingle,size)*np.fft.rfft(impulse,size),n=size)
wet = s.canvas(length)
s.put(wet,response,.045)
wet *= s.active_rms(jingle)*.22/max(s.active_rms(wet),1e-12)

atmosphere = s.canvas(length)
t = s.t(2.20)
hz = lambda midi: 440*2**((midi-69)/12)
bloom = (np.sin(2*np.pi*hz(64)*t)+.38*np.sin(2*np.pi*hz(71)*t)
         +.13*np.sin(2*np.pi*hz(79)*t))
bloom *= np.sin(np.pi*t/2.20)**2
s.put(atmosphere,bloom,.62,.020)
mix = jingle+foley+wet+atmosphere
mix[-round(.18*rate):] *= np.linspace(1,0,round(.18*rate))
mix = s.master(mix,-18,original=True)

with tempfile.TemporaryDirectory(prefix='undead-box-master-') as directory:
    wav = Path(directory)/'mystery-box-a.wav'
    mix = s.write_wav(wav,mix)
    s.encode(wav)
    files = [s.export_asset(path,'mystery-box-a') for path in [wav,wav.with_suffix('.m4a')]]
    decoded = Path(directory)/'aac.wav'
    subprocess.run(['/usr/bin/afconvert','-f','WAVE','-d','LEI16',str(wav.with_suffix('.m4a')),str(decoded)],
                   check=True,capture_output=True)
    aac,aac_rate = s.read_wav(decoded)
    assert aac_rate == rate and abs(len(aac)-len(mix))/rate < .1
    assert mix[0] == 0 and mix[-1] == 0 and np.isfinite(mix).all()
    assert s.true_peak(mix) < 10**(-3.4/20) and s.true_peak(aac) < 10**(-.1/20)

source = dict(title='Wooden Chest Open.wav',author='The_Frisbee_of_Peace',
              page='https://freesound.org/people/The_Frisbee_of_Peace/sounds/573654/',
              download='https://cdn.freesound.org/previews/573/573654_6614920-hq.mp3',
              licence='CC0 1.0',licence_url='https://creativecommons.org/publicdomain/zero/1.0/',
              used_by=['mystery-box-a'],source_file='sources/'+recording.name,
              source_excerpt_seconds=[.18,.84],playback_speed=1)
pack = json.loads((assets/'manifest.json').read_text())
item = next(x for x in pack['sounds'] if x['id']=='mystery-box-a')
old_files = [item['wav'],item['compressed']]
item.update(title='Mystery Box · Recorded chest and spectral 1G',
            trigger='Recorded chest contact on activation, lid movement under the 850 ms opening, original 1G phrase, quiet lift atmosphere and reverb fading before the 3.5-second sequence ends.',
            note='Original 1G melody. Both post-jingle thuds removed. Recorded wooden-chest opening (CC0), dark diffuse reverb and quiet E/B harmonic atmosphere.',
            wav=files[0],compressed=files[1],duration=len(mix)/rate,
            peak_dbfs=s.db(max(abs(mix))),true_peak_4x_dbfs=s.db(s.true_peak(mix)),
            active_rms_dbfs=s.db(s.active_rms(mix)),effective_rms_dbfs=s.db(s.active_rms(mix)*item['volume']),
            waveform=[round(float(np.max(abs(a))),4) for a in np.array_split(mix,80)])
pack['cues']['mystery-box-a']['files'] = files
pack.update(version='2.8',date='2026-10-23',revised_cues=['mystery-box-a'],sources=[source],
            provenance='Original local synthesis plus a CC0 wooden-chest recording by The_Frisbee_of_Peace / Freesound 573654. Public HQ MP3 preview used; source original WAV requires login. Licence and processing in sources/CREDITS.md. Other cues unchanged.',
            source_commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip())
(assets/'manifest.json').write_text(json.dumps(pack,indent=2)+'\n')
code = (ROOT/'js/game-audio.js').read_text()
for old,new in zip(old_files,files): code = code.replace(old,new)
(ROOT/'js/game-audio.js').write_text(code)
preview = assets/'box-opening-review'
preview.mkdir(exist_ok=True)
(preview/'index.html').write_text(f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="dark">
<title>Mystery Box opening · The Daily Undead</title>
<style>
*{{box-sizing:border-box}}body{{margin:0;background:#0e1310;color:#eef2e8;font:16px/1.6 system-ui,-apple-system,sans-serif}}
main{{max-width:760px;margin:auto;padding:36px 24px}}a{{color:#c5ef9c;text-underline-offset:4px}}
header{{display:flex;justify-content:space-between;gap:18px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;border-bottom:1px solid #354139;padding-bottom:18px}}
.eyebrow{{margin:36px 0 10px;color:#e6c68a;font-size:12px;letter-spacing:.1em;text-transform:uppercase}}
h1{{font-size:clamp(30px,6vw,46px);line-height:1.1;letter-spacing:-.04em;margin:0 0 18px}}
p{{color:#adb8ac}}.player{{background:#171e18;border:1px solid #354139;border-radius:12px;padding:24px;margin:28px 0}}
audio{{width:100%;display:block;margin:18px 0}}.files{{display:flex;gap:24px;font-size:13px}}
li{{margin:8px 0}}footer{{margin-top:32px;border-top:1px solid #354139;padding-top:18px;font-size:12px;color:#adb8ac}}
@media(max-width:480px){{main{{padding:24px 18px}}header{{font-size:10px}}.player{{padding:18px}}}}
</style></head><body><main>
<header><strong>The Daily Undead</strong><a href="../../../">Back to staging game</a></header>
<p class="eyebrow">Current staging sound</p><h1>Mystery Box opening.</h1>
<p>The 1G melody, with a real wooden-chest opening, dark reverb and a quiet supernatural layer.</p>
<section class="player" aria-label="Mystery Box sound preview"><strong>Recorded chest + spectral 1G</strong>
<audio controls preload="metadata" aria-label="Play current Mystery Box opening"><source src="../{files[0]}" type="audio/wav"><source src="../{files[1]}" type="audio/mp4"></audio>
<div class="files"><a href="../{files[0]}" download>Download WAV</a><a href="../{files[1]}" download>Download AAC</a><span>3.42 s</span></div></section>
<ul><li>Both thuds after the jingle removed.</li><li>Recorded chest contact and lid movement at the start.</li><li>Dark reverb and soft ethereal tones fade through the reveal.</li></ul>
<footer>Recording: <a href="{source['page']}">Wooden Chest Open.wav by The_Frisbee_of_Peace</a> · CC0.
Public HQ preview used. <a href="../sources/CREDITS.md">Source and processing credits</a>.
Signal and decoder checks passed; no direct listening assessment. Preview starts at the game's 86% cue gain.</footer>
</main><script>document.querySelector('audio').volume=.86;</script></body></html>''')
report = dict(result='PASS',files=files,duration=len(mix)/rate,volume=item['volume'],
              active_rms_dbfs=s.db(s.active_rms(mix)),wav_true_peak_dbfs=s.db(s.true_peak(mix)),
              aac_true_peak_dbfs=s.db(s.true_peak(aac)),late_impacts_removed=[2.01,2.54],
              reverb_predelay_seconds=.045,recording=source,listening_assessment=False)
review = ROOT/'.releases/reviews/box-atmosphere-qa.json'
review.parent.mkdir(parents=True,exist_ok=True)
review.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({key:report[key] for key in ['result','files','duration','active_rms_dbfs','wav_true_peak_dbfs','aac_true_peak_dbfs']}))
