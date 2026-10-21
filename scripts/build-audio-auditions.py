"""Render six original audition candidates without changing active game audio.

Uses the existing local numpy/afconvert renderer. Hosted under assets/audio so
the normal committed-snapshot staging build includes the independent player.
"""
from pathlib import Path
import csv
import hashlib
import importlib.util
import json
import re
import subprocess
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('synthesis', ROOT/'scripts/synthesise-feedback.py')
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)
OUT = ROOT/'assets/audio/auditions-2026-10-21'
s.REVIEW = OUT
beats = {key: int(value)/1000 for key,value in re.findall(
    r'(\w+):\s*(\d+)', (ROOT/'js/mystery-box-motion.js').read_text().split('});',1)[0])}


def hz(midi):
    return 440*2**((midi-69)/12)


def pluck(frequency, duration, decay=.075):
    """Warm string harmonics, not the steel-tine/glass timbre of prior cues."""
    t=s.t(duration)
    return sum(np.sin(2*np.pi*frequency*k*t)*np.exp(-t/(decay/k**.45))/k**1.7
               for k in range(1,10))*-np.expm1(-t/.0025)


def box_frame():
    x=s.canvas(beats['assembleAt']+.16)
    s.put(x,s.knock(250,.11),0,.17)
    # Quiet unpitched contacts, with no final musical note.
    s.put(x,s.knock(210,.11),beats['settleAt'],.12)
    s.put(x,s.knock(185,.09),beats['assembleAt'],.15)
    return x


def crooked_toy_box():
    x=box_frame()
    # An original lower-register broken waltz. Short resonant comb strikes,
    # with different partial balance from the rejected high rolling jingle.
    for i,(at,note) in enumerate([(.14,76),(.31,79),(.48,83),(.65,78),
                                 (.83,75),(1.00,71),(1.17,74),(1.34,73)]):
        t=s.t(.37); f=hz(note)
        comb=sum(level*np.sin(2*np.pi*f*ratio*t)*s.env(t,.002,decay)
                 for ratio,level,decay in [(1,1,.087),(2,.035,.039),(3.006,.085,.034),(5.92,.008,.018)])
        s.put(x,comb,at,.37 if i%3==0 else .28)
        s.put(x,s.knock(520,.045),at,.025)
    return x


def muted_strings():
    x=box_frame()
    # Dry, damped pizzicato with a descending answer; no bell partials or air.
    for at,note,gain in [(.10,57,.45),(.15,64,.29),(.21,70,.21),
                         (beats['liftAt'],65,.35),(.79,61,.28),(.98,58,.30)]:
        s.put(x,pluck(hz(note),.44,.083),at,gain)
    return x


def dark_reed():
    x=box_frame(); t=s.t(1.15)
    # Rounded single reed swell: fixed separated pitches, no detuning/chorus.
    shape=np.sin(np.pi*t/1.15)**1.65
    voice=np.zeros(len(t))
    for frequency,level in [(349.23,.50),(493.88,.23),(622.25,.12)]:
        voice+=sum(np.sin(2*np.pi*frequency*k*t)/k**2.5 for k in [1,2,3,4])*level
    s.put(x,voice*shape,.15,.34)
    return x


def dry_switch():
    x=s.canvas(.19)
    # A small switch contact, no hollow body or ringing pitched tail.
    for at,gain,duration in [(0,.60,.055),(.052,.29,.065)]:
        t=s.t(duration)
        contact=s.noise(duration,500,1900)*s.env(t,.0018,.0075)
        s.put(x,contact,at,gain)
    return x


def warm_pluck():
    x=s.canvas(.35)
    s.put(x,pluck(523.25,.35,.044),0,.65)
    s.put(x,pluck(783.99,.30,.035),.024,.22)
    return x


def soft_sweep():
    t=s.t(.34)
    # A broad, smooth air gesture, without the glass or pressure-pop attack.
    shape=np.sin(np.pi*t/.34)**2
    air=s.noise(.34,300,1400)*shape
    return air*.18


specs=[
    ('1A','box-a','Mystery Box','Crooked toy box','A lower, uneven toy-box tune.',crooked_toy_box,.86),
    ('1B','box-b','Mystery Box','Muted strings','Dry plucked strings with a dark falling answer.',muted_strings,.86),
    ('1C','box-c','Mystery Box','Dark reed','One rounded, eerie reed swell.',dark_reed,.86),
    ('8A','clue-a','Clue reveal','Dry switch','A small, restrained double contact.',dry_switch,.80),
    ('8B','clue-b','Clue reveal','Warm pluck','A short, warm string pluck.',warm_pluck,.80),
    ('8C','clue-c','Clue reveal','Soft sweep','A smooth, quiet brush of air.',soft_sweep,.80),
]
OUT.mkdir(parents=True,exist_ok=True)
sounds=[]
for label,cue,group,title,note,generate,gain in specs:
    temporary=OUT/f'{cue}.wav'
    x=s.write_wav(temporary,s.master(generate(),-18))
    s.encode(temporary)
    files=[]
    for path in [temporary,temporary.with_suffix('.m4a')]:
        filename=f'{cue}-{hashlib.sha256(path.read_bytes()).hexdigest()[:10]}{path.suffix}'
        path.replace(OUT/filename); files.append(filename)
    sounds.append(dict(id=cue,label=label,group=group,title=title,note=note,wav=files[0],
                       compressed=files[1],duration=len(x)/s.SR,volume=gain,
                       active_rms_dbfs=s.db(s.active_rms(x)),peak_dbfs=s.db(max(abs(x))),
                       true_peak_4x_dbfs=s.db(s.true_peak(x)),
                       waveform=[round(float(np.max(abs(a))),4) for a in np.array_split(x,80)]))
pack=dict(title='The Daily Undead · Sound auditions',version='auditions-1',sample_rate=s.SR,
          channels=1,pcm_bits=16,sounds=sounds,sequences=[],
          source_commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
          provenance='Six original local synthesised alternatives. No downloaded samples, paid services, copied melodies or recordings.',
          listening_assessment=False,integrated=False,box_animation_seconds=beats)
(OUT/'manifest.json').write_text(json.dumps(pack,indent=2)+'\n')
(OUT/'manifest-data.js').write_text('window.SOUND_AUDITIONS = '+json.dumps(pack,separators=(',',':'))+';\n')
with (OUT/'manifest.csv').open('w',newline='') as stream:
    writer=csv.DictWriter(stream,fieldnames=['label','title','group','wav','compressed','duration','volume','note'],extrasaction='ignore')
    writer.writeheader();writer.writerows(sounds)
(OUT/'CREDITS.md').write_text('# Original sound auditions\n\nSix original local synthesis candidates by the Daily Undead project. No samples or third-party melodies were used. These options are not selected in game.\n\nRebuild: `python scripts/build-audio-auditions.py` with numpy and macOS afconvert. Primary: 48 kHz mono 16-bit PCM WAV. Fallback/download: 192 kb/s AAC. Levels use active-window RMS and existing game gains; clipping and decoded-file checks are in qa-report.json. No subjective listening was possible.\n')
s.verify()
print('Six audition candidates rendered. Active runtime files, gains, button routing and timing are untouched.')
