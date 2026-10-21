"""Feedback revisions 2.1 / 2.2. Accepted files/gains stay bit-identical.

Uses the existing original-synthesis renderer (numpy + macOS afconvert).
The box beats are taken from the actual shared BOX_SEQUENCE animation timings.
Use --feedback-r4 for the two-cue revision and delayed bonus-flourish montage.
"""
from pathlib import Path
import copy
import importlib.util
import json
import re
import shutil
import subprocess
import sys
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('synthesis', ROOT/'scripts/synthesise-feedback.py')
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)
R4 = '--feedback-r4' in sys.argv
REVIEW = ROOT/('audio-review/2026-10-21-r4' if R4 else 'audio-review/2026-10-21-r3')
s.REVIEW = REVIEW
timing_source = (ROOT/'js/mystery-box-motion.js').read_text().split('});', 1)[0]
BEATS = {key: int(value)/1000 for key,value in re.findall(r'(\w+):\s*(\d+)', timing_source)}


def box():
    x = s.canvas(BEATS['assembleAt'] + .16)
    # Taps track the initial lid movement. The musical phrase now lasts less
    # than a second, with its first note at the actual start of the icon lift.
    for at,gain,hz in [(0,.65,330),(.22*BEATS['lid'],.48,380),(.44*BEATS['lid'],.32,430)]:
        s.put(x,s.knock(hz,.14),at,gain)
    notes = [(BEATS['liftAt'],86,.44),(.75,80,.34),(BEATS['lid'],88,.36)] if R4 else [(BEATS['liftAt'],86,.44),(.75,81,.34),(BEATS['lid'],89,.36),(1.0,86,.32)]
    for at,midi,gain in notes:
        s.put(x,s.tine(440*2**((midi-69)/12),.48,.105),at,gain)
    # No sustained jingle over the settle/assembly. Just two small tactile taps.
    s.put(x,s.knock(300,.14),BEATS['settleAt'],.31)
    s.put(x,s.knock(225,.09) if R4 else s.knock(570,.14),BEATS['assembleAt'],.34)
    return x


def clue():
    if R4:
        x=s.canvas(.39)
        # A short drawn-in glass glint, with no paper/stone scrape or noise bed.
        s.put(x,s.tine(1174.66,.17,.035)[::-1],0,.28)
        s.put(x,s.tine(587.33,.24,.055),.145,.34)
        return x
    x=s.canvas(.31)
    # A dry stone/ceramic contact with a small release, no paper or noise layer.
    s.put(x,s.knock(360,.16),0,.65)
    s.put(x,s.knock(515,.17),.075,.24)
    s.put(x,s.tine(698.46,.25,.044),.05,.085)
    return x


def ended():
    times=s.t(.72)
    # One hollow, deadened impact: no tune, organ, creature/growl or comic slide.
    phase=2*np.pi*(240*times-6*times**2)
    x=np.zeros(len(times))
    for ratio,level,decay in [(1,.68,.09),(2.34,.25,.16),(3.82,.10,.11),(5.19,.035,.055)]:
        x+=np.sin(phase*ratio)*s.env(times,.0025,decay)*level
    s.put(x,s.knock(245,.20),0,.45)
    return x


pack=json.loads((s.ASSETS/'manifest.json').read_text())
before=copy.deepcopy(pack['cues'])
replacements={
    'mystery-box-a': (box,-18,'Mystery Box · Taps and short jingle',
        'Taps during lid movement; brief jingle begins at 620 ms lift; taps at 2010 ms settle and 2540 ms assembly.',
        'Four-note phrase replaces the 16-note jingle; no sustained musical tail. Tap timing is read from BOX_SEQUENCE.'),
    'quest-clue-reveal': (clue,-18,'Quest clue · Stone release',
        'When the next clue appears.', 'Short hollow contact/release. No paper, scrape, noise bed or whoosh.'),
    'run-ended': (ended,-17.5,'Run ended · Hollow impact',
        'Failed map result or Last Words result; the word cue is scheduled from the final wrong guess.',
        'One short nonmelodic, deadened metallic impact. No organ, jingle, growl or theatrical creature layer.'),
}
if R4:
    replacements={
        'mystery-box-a': (box,-18,'Mystery Box · Unsettled taps',
            'Taps follow the existing lid/lift/settle/assembly timings; three unsettled notes start at the icon lift.',
            'Closing musical note removed. Darker tritone contour; last assembly contact is a dull tap rather than a ringing note.'),
        'quest-clue-reveal': (clue,-18,'Quest clue · Glass glint',
            'When the next clue appears.', 'Brief reversed-glass glint. No paper, scrape, hollow knock or noise bed.'),
    }
buffers={}
for item in pack['sounds']:
    cue=item['id']
    path=REVIEW/'wav'/f'{cue}.wav'
    path.parent.mkdir(parents=True,exist_ok=True)
    compressed=REVIEW/'m4a'/f'{cue}.m4a'
    compressed.parent.mkdir(parents=True,exist_ok=True)
    if cue in replacements:
        generate,target,title,trigger,note=replacements[cue]
        x=s.write_wav(path,s.master(generate(),target))
        s.encode(path)
        path.with_suffix('.m4a').replace(compressed)
        files=[s.export_asset(path,cue),s.export_asset(compressed,cue)]
        pack['cues'][cue]['files']=files
        item.update(title=title,trigger=trigger,note=note,duration=round(len(x)/s.SR,4),
                    peak_dbfs=s.db(max(abs(x))),true_peak_4x_dbfs=s.db(s.true_peak(x)),
                    active_rms_dbfs=s.db(s.active_rms(x)),effective_rms_dbfs=s.db(s.active_rms(x)*item['volume']),
                    waveform=[round(float(np.max(abs(a))),4) for a in np.array_split(x,80)])
    else:
        shutil.copy2(s.ASSETS/item['wav'],path)
        shutil.copy2(s.ASSETS/item['compressed'],compressed)
        x,rate=s.read_wav(path)
        assert rate==s.SR and pack['cues'][cue]==before[cue]
    buffers[cue]=x
    item.update(wav=f'wav/{cue}.wav',compressed=f'm4a/{cue}.m4a')
    if R4 and cue=='double-points-a':
        item['trigger']='After the visible points count and finishing ping: 1220 ms after the result appears, or 500 ms with reduced motion. Unscored play has no count to wait for.'

events=[(0,'mystery-box-a'),(3.8,'letter-correct'),(4.5,'letter-streak-2'),
        (5.2,'letter-streak-3'),(5.9,'letter-streak-4'),(6.6,'letter-wrong'),
        (7.45,'run-ended'),(9,'quest-clue-reveal'),(9.8,'map-select'),
        (10.3,'answer-lock'),(10.39,'puzzle-solved-a'),(12,'bonus-step-1'),
        (12.5,'bonus-step-2'),(13,'bonus-step-3'),(13.5,'answer-lock'),(14.3,'double-points-a')]
if R4:
    events=[(15.52 if cue=='double-points-a' else at,cue) for at,cue in events]
events += [(14.3+i*.09,'points-tick') for i in range(7)]+[(15.02,'points-finish')]
montage_length=17.5 if R4 else 16.5
montage=s.canvas(montage_length)
for at,cue in events: s.put(montage,buffers[cue],at,pack['cues'][cue]['gain'])
peak=s.true_peak(montage)
assert peak<10**(-1/20)
montage_path=REVIEW/'wav/sample-gameplay.wav'
s.write_wav(montage_path,montage);s.encode(montage_path)
montage_path.with_suffix('.m4a').replace(REVIEW/'m4a/sample-gameplay.m4a')
pack.update(version='2.2' if R4 else '2.1',source_commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip() if R4 else 'f751d04ec8f93c6eb8345a1d304bdb041cd65771',
            revised_cues=list(replacements),box_animation_seconds=BEATS,
            mixed_sequence_true_peak_dbfs=s.db(peak),
            sequences=[dict(variant='A',wav='wav/sample-gameplay.wav',compressed='m4a/sample-gameplay.m4a',duration=montage_length,
                            events=[dict(at=at,id=cue,label=next(i['title'] for i in pack['sounds'] if i['id']==cue)) for at,cue in sorted(events)])])
runtime={**pack,'sequences':[],'sounds':[{**item,'wav':pack['cues'][item['id']]['files'][0],
            'compressed':pack['cues'][item['id']]['files'][1]} for item in pack['sounds']]}
(s.ASSETS/'manifest.json').write_text(json.dumps(runtime,indent=2)+'\n')
(REVIEW/'manifest.json').write_text(json.dumps(pack,indent=2)+'\n')
(REVIEW/'manifest-data.js').write_text('window.SOUND_PACK = '+json.dumps(pack,separators=(',',':'))+';\n')
audio_file=ROOT/'js/game-audio.js'
source=audio_file.read_text()
source=re.sub(r'export const SOUND_CUES = \{.*?\};',lambda _:'export const SOUND_CUES = '+json.dumps(pack['cues'],indent=2)+';',source,count=1,flags=re.S)
audio_file.write_text(source)
s.verify()
print(f'Revised {len(replacements)} cues; {len(before)-len(replacements)} accepted cue pairs and every playback gain unchanged.')
print('Box:',len(buffers['mystery-box-a'])/s.SR,'seconds;', 'closing note removed; three unsettled notes.' if R4 else 'four-note phrase ends at 1.48 seconds.')
print('Mixed gameplay peak:',s.db(peak),'dBTP.')
