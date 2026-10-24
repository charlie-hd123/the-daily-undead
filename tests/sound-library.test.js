import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { SOUND_CUES } from '../js/game-audio.js';
import { DEFAULT_SETTINGS, settings, changed, catalog, wavBytes, zipBytes } from '../assets/audio/library/library-core.js';

test('the library lists exactly the active game sounds and downloads their actual files', async () => {
  const manifest = JSON.parse(await readFile(new URL('../assets/audio/manifest.json', import.meta.url)));
  const sounds = catalog(SOUND_CUES, manifest);
  assert.deepEqual(sounds.map(sound => sound.id), Object.keys(SOUND_CUES));
  assert.equal(new Set(sounds.map(sound => sound.number)).size, sounds.length);
  for (const sound of sounds) {
    assert.deepEqual(sound.files, SOUND_CUES[sound.id].files);
    assert.equal(sound.gain, SOUND_CUES[sound.id].gain);
    assert.ok(sound.duration > 0); assert.ok(sound.waveform.length);
    for (const file of sound.files) await access(new URL('../assets/audio/' + file, import.meta.url));
  }
  assert.ok(sounds.find(sound => sound.id === 'answer-lock').tags.includes('Blood Ties'));
  assert.ok(!sounds.some(sound => sound.id === 'highest-round'));
});

test('unknown future cues remain visible; stale waveform metadata and unsafe file paths are excluded', () => {
  const sounds = catalog({ future: { files: ['future-abcd.wav', '../private.wav'], gain: .8 } }, { sounds: [{ id: 'future', title: 'New sound', wav: 'old.wav', duration: 1, waveform: [1] }] });
  assert.equal(sounds[0].title, 'New sound'); assert.deepEqual(sounds[0].files, ['future-abcd.wav']);
  assert.equal(sounds[0].duration, null); assert.deepEqual(sounds[0].waveform, []);
});

test('draft defaults, muted levels, range bounds and note-only proposals survive normalisation', () => {
  assert.deepEqual(settings(), DEFAULT_SETTINGS);
  assert.deepEqual(settings({ level: 0, pitch: -99, reverb: 99, delay: NaN }), { level: 0, pitch: -6, reverb: 60, delay: 0 });
  assert.equal(changed({ settings: DEFAULT_SETTINGS, notes: ' ' }), false);
  assert.equal(changed({ notes: 'Less reverb' }), true);
  assert.equal(changed({ settings: { level: 0 } }), true);
  assert.equal(changed({ blob: new Blob(['source']) }), true);
});

test('downloaded WAV has a standard stereo PCM header, interleaved samples and bounded finite output', () => {
  const data = [new Float32Array([0, 1, -1, NaN]), new Float32Array([.5, 2, -2, 0])];
  const wav = wavBytes({ numberOfChannels: 2, length: 4, sampleRate: 48000, getChannelData: channel => data[channel] });
  const view = new DataView(wav.buffer);
  assert.equal(new TextDecoder().decode(wav.slice(0, 4)), 'RIFF');
  assert.equal(view.getUint32(4, true), wav.length - 8); assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(24, true), 48000); assert.equal(view.getUint32(40, true), 16);
  assert.deepEqual(Array.from({ length: 8 }, (_, i) => view.getInt16(44 + i * 2, true)), [0, 16384, 32767, 32767, -32768, -32768, 0, 0]);
});

test('draft ZIP includes standard CRC32 and central-directory records for WAV and notes', () => {
  const text = new TextEncoder().encode('hello world');
  const zip = zipBytes([{ name: 'sound.wav', bytes: text }, { name: 'draft-manifest.json', bytes: new TextEncoder().encode('{}') }]);
  const view = new DataView(zip.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(14, true), 0x0d4a1185);
  assert.equal(view.getUint32(zip.length - 22, true), 0x06054b50);
  assert.equal(view.getUint16(zip.length - 12, true), 2);
  const central = view.getUint32(zip.length - 6, true);
  assert.equal(view.getUint32(central, true), 0x02014b50);
  assert.throws(() => zipBytes([{ name: '../escape.wav', bytes: text }]));
});
