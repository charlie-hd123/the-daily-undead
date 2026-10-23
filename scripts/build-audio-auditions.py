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
import sys
import shutil
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('synthesis', ROOT/'scripts/synthesise-feedback.py')
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)
ROUND_TWO = '--round-two' in sys.argv
ROUND_THREE = '--rewarding-endings' in sys.argv
LAYERED = '--layered-1g' in sys.argv
OUT = ROOT/('assets/audio/auditions-2026-10-23-layered' if LAYERED else 'assets/audio/auditions-2026-10-23-lift' if ROUND_THREE else 'assets/audio/auditions-2026-10-23' if ROUND_TWO else 'assets/audio/auditions-2026-10-21')
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


def toy_box_variant(variant):
    x=box_frame()
    notes=[76,79,83,78,75,71,74,73]
    times=[.14,.31,.48,.65,.83,1.00,1.17,1.34]
    if variant=='slower': times=[.14,.34,.54,.74,.94,1.12,1.30,1.48]
    if variant=='darker': notes=[n-3 for n in notes]
    if variant=='uneven':
        notes=[76,79,83,78,75,74,71,73]
        times=[.14,.285,.46,.62,.81,.955,1.19,1.34]
    if variant=='gentle-lift': notes[-3:]=[76,79,83]
    if variant=='bright-lift': notes[-3:]=[74,78,81]
    if variant=='open-lift': notes[-3:]=[76,81,83]
    for i,(at,note) in enumerate(zip(times,notes)):
        t=s.t(.39); f=hz(note)
        # Preserve 1A's comb timbre, register and unresolved phrase structure.
        tone=sum(level*np.sin(2*np.pi*f*ratio*t)*s.env(t,.002,decay)
                 for ratio,level,decay in [(1,1,.095 if variant=='slower' else .087),
                                           (2,.035,.039),(3.006,.085,.034),(5.92,.008,.018)])
        s.put(x,tone,at,.37 if i%3==0 else .28)
        s.put(x,s.knock(520,.045),at,.025)
    return x


def felt_key():
    t=s.t(.30)
    # A damped felt hammer and inharmonic piano-string modes, without glass.
    return sum(np.sin(2*np.pi*392*k*np.sqrt(1+.0009*k*k)*t)*s.env(t,.006,.043/k**.4)/k**1.9
               for k in range(1,8))


def layered_g():
    """Keep 1G's exact phrase; refine contacts and add one quiet lift bloom."""
    x=toy_box_variant('gentle-lift')
    # Replace the existing contacts, rather than stack more knocks over them.
    for at,f,duration,gain in [(0,250,.11,.17),
                               (beats['settleAt'],210,.11,.12),
                               (beats['assembleAt'],185,.09,.15)]:
        s.put(x,s.knock(f,duration),at,-gain)
    s.put(x,s.knock(245,.12),0,.16)
    s.put(x,s.knock(1180,.035),.012,.037)  # Small latch release.
    s.put(x,s.knock(365,.07),.047,.047)    # Muted wooden contact.
    # Stable, clean harmonics, well beneath the comb melody; no detuned voices.
    duration=beats['liftFor']; times=s.t(duration)
    bloom=(np.sin(2*np.pi*hz(64)*times)+.32*np.sin(2*np.pi*hz(71)*times))
    bloom*=np.sin(np.pi*times/duration)**2
    s.put(x,bloom,beats['liftAt'],.021)
    s.put(x,s.knock(195,.12),beats['settleAt'],.105)
    s.put(x,s.knock(270,.095),beats['assembleAt'],.12)
    s.put(x,s.knock(730,.035),beats['assembleAt']+.012,.025)
    return x


def wooden_roll():
    x=s.canvas(.23)
    for at,f,gain in [(0,560,.55),(.034,470,.34),(.079,395,.24)]:
        t=s.t(.11)
        body=sum(level*np.sin(2*np.pi*f*ratio*t)*s.env(t,.0015,decay)
                 for ratio,level,decay in [(1,1,.014),(2.76,.18,.007),(5.4,.025,.004)])
        s.put(x,body,at,gain)
    return x


def magnetic_snap():
    t=s.t(.24)
    # One rounded electronic tuck: fast downward bend, dry and restrained.
    phase=2*np.pi*(390*t+340*.011*(-np.expm1(-t/.011)))
    return (np.sin(phase)+.10*np.sin(phase*2))*s.env(t,.004,.024)


specs=[
    ('1A','box-a','Mystery Box','Crooked toy box','A lower, uneven toy-box tune.',crooked_toy_box,.86),
    ('1B','box-b','Mystery Box','Muted strings','Dry plucked strings with a dark falling answer.',muted_strings,.86),
    ('1C','box-c','Mystery Box','Dark reed','One rounded, eerie reed swell.',dark_reed,.86),
    ('8A','clue-a','Clue reveal','Dry switch','A small, restrained double contact.',dry_switch,.80),
    ('8B','clue-b','Clue reveal','Warm pluck','A short, warm string pluck.',warm_pluck,.80),
    ('8C','clue-c','Clue reveal','Soft sweep','A smooth, quiet brush of air.',soft_sweep,.80),
]
if ROUND_TWO:
    specs=[
        ('1A','box-a','Mystery Box','Original 1A','Your closest option, kept exactly for comparison.',None,.86),
        ('1D','box-d','Mystery Box','Slower toy box','The same crooked tune, with more space between notes.',lambda:toy_box_variant('slower'),.86),
        ('1E','box-e','Mystery Box','Darker toy box','The same comb character in a lower register.',lambda:toy_box_variant('darker'),.86),
        ('1F','box-f','Mystery Box','Uneven toy box','A related phrase with a slightly stumbling rhythm.',lambda:toy_box_variant('uneven'),.86),
        ('8D','clue-d','Clue reveal','Felt key','One soft, damped piano-like contact.',felt_key,.80),
        ('8E','clue-e','Clue reveal','Wooden roll','Three small, dry wooden contacts.',wooden_roll,.80),
        ('8F','clue-f','Clue reveal','Magnetic tuck','A short, rounded downward electronic tuck.',magnetic_snap,.80),
    ]
if ROUND_THREE:
    specs=[
        ('1G','box-g','Mystery Box','Gentle lift','The 1A character, ending with a rising minor arpeggio.',lambda:toy_box_variant('gentle-lift'),.86),
        ('1H','box-h','Mystery Box','Brighter lift','A warmer rising ending, with a little more reward.',lambda:toy_box_variant('bright-lift'),.86),
        ('1I','box-i','Mystery Box','Open lift','An upward suspended ending that keeps some mystery.',lambda:toy_box_variant('open-lift'),.86),
        ('8E','clue-e','Clue reveal','Selected · Wooden roll','Your chosen clue sound, kept exactly as auditioned.',None,.80),
    ]
if LAYERED:
    specs=[
        ('1G','box-g','Mystery Box','Original 1G','Your selected melody, copied exactly for comparison.',None,.86),
        ('1G+','box-g-layered','Mystery Box','1G · Subtle layers','The same melody, with a latch release, quiet lift shimmer and refined contacts.',layered_g,.86),
    ]
OUT.mkdir(parents=True,exist_ok=True)
sounds=[]
for label,cue,group,title,note,generate,gain in specs:
    if generate is None:
        previous=ROOT/('assets/audio/auditions-2026-10-23-lift' if LAYERED else 'assets/audio/auditions-2026-10-23' if ROUND_THREE else 'assets/audio/auditions-2026-10-21')
        original=next(item for item in json.loads((previous/'manifest.json').read_text())['sounds'] if item['id']==cue)
        files=[original['wav'],original['compressed']]
        for filename in files: shutil.copy2(previous/filename,OUT/filename)
        x,rate=s.read_wav(OUT/files[0]); assert rate==s.SR
    else:
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
pack=dict(title='The Daily Undead · Sound auditions',version='1g-layered' if LAYERED else 'auditions-3' if ROUND_THREE else 'auditions-2' if ROUND_TWO else 'auditions-1',sample_rate=s.SR,
          channels=1,pcm_bits=16,sounds=sounds,sequences=[],
          source_commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
          provenance='Original local synthesised alternatives. No downloaded samples, paid services, copied melodies or recordings.',
          listening_assessment=False,integrated=False,box_animation_seconds=beats)
(OUT/'manifest.json').write_text(json.dumps(pack,indent=2)+'\n')
(OUT/'manifest-data.js').write_text('window.SOUND_AUDITIONS = '+json.dumps(pack,separators=(',',':'))+';\n')
with (OUT/'manifest.csv').open('w',newline='') as stream:
    writer=csv.DictWriter(stream,fieldnames=['label','title','group','wav','compressed','duration','volume','note'],extrasaction='ignore',lineterminator='\n')
    writer.writeheader();writer.writerows(sounds)
(OUT/'CREDITS.md').write_text('# Original sound auditions\n\nOriginal local synthesis candidates by the Daily Undead project. No samples or third-party melodies were used. '+('Original 1G is copied bit-identically. 1G+ preserves its phrase and adds subtle animation-timed layers. Neither audition changes active game audio.' if LAYERED else 'Box endings are auditions; 8E is the selected in-game clue sound, copied bit-identically.' if ROUND_THREE else 'These options are not selected in game. In round two, 1A is copied bit-identically for comparison.')+'\n\nRebuild: `python scripts/build-audio-auditions.py'+(' --layered-1g' if LAYERED else ' --rewarding-endings' if ROUND_THREE else ' --round-two' if ROUND_TWO else '')+'` with numpy and macOS afconvert. Primary: 48 kHz mono 16-bit PCM WAV. Fallback/download: 192 kb/s AAC. Levels use active-window RMS and existing game gains; clipping and decoded-file checks are in qa-report.json. No subjective listening was possible.\n')
s.verify()
print(f'{len(sounds)} audition candidates rendered. Active runtime files and gains are untouched.')
