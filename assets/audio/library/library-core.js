export const DEFAULT_SETTINGS = Object.freeze({ level: 100, pitch: 0, reverb: 0, delay: 0 });
export function settings(value = {}) {
  const ranges = { level: [0, 200], pitch: [-6, 6], reverb: [0, 60], delay: [0, 45] };
  return Object.fromEntries(Object.entries(ranges).map(([key, [min, max]]) => {
    const number = Number(value[key]);
    return [key, Math.min(max, Math.max(min, Number.isFinite(number) ? number : DEFAULT_SETTINGS[key]))];
  }));
}
export function changed(draft) {
  return Boolean(draft && (draft.blob || draft.notes?.trim() || Object.keys(DEFAULT_SETTINGS).some(key => settings(draft.settings)[key] !== DEFAULT_SETTINGS[key])));
}
const details = {
  'mystery-box-a': ['Mystery Box opening', 'Recorded chest + spectral 1G', 'The chest opens, its lid rises, and the puzzle appears.', ['Opening', 'Last Words', 'Quest Steps', 'Blood Ties']],
  'letter-correct': ['Correct letter', 'Last Words', 'A correct letter in Last Words.', ['Last Words']],
  'letter-streak-2': ['Correct streak · 2', 'Last Words', 'The second consecutive correct letter.', ['Last Words']],
  'letter-streak-3': ['Correct streak · 3', 'Last Words', 'The third consecutive correct letter.', ['Last Words']],
  'letter-streak-4': ['Correct streak · 4+', 'Last Words', 'The fourth consecutive correct letter; repeats for longer streaks.', ['Last Words']],
  'letter-wrong': ['Wrong answer', 'Everyday feedback', 'A wrong letter, an incorrect bonus order, or an incorrect Blood Ties trio.', ['Last Words', 'Quest Steps', 'Blood Ties']],
  'quest-clue-reveal': ['Clue reveal', 'Wooden roll · 8E', 'A new Quest Steps clue is revealed.', ['Quest Steps']],
  'map-select': ['Selection & deselection', 'Puzzle controls', 'Map and puzzle choices, Blood Ties tiles, shuffle and deselect, and puzzle navigation.', ['Controls', 'Last Words', 'Quest Steps', 'Blood Ties']],
  'answer-lock': ['Answer lock-in / connection', 'Puzzle feedback', 'Confirming a map, submitting a correct bonus order, or finding a Blood Ties connection.', ['Quest Steps', 'Blood Ties']],
  'puzzle-solved-a': ['Puzzle solved', 'Survival signal', 'A Last Words solve or a correct Quest Steps map answer.', ['Rewards', 'Last Words', 'Quest Steps']],
  'bonus-step-1': ['Bonus selection · first', 'Quest Steps', 'The first selected bonus step.', ['Quest Steps']],
  'bonus-step-2': ['Bonus selection · second', 'Quest Steps', 'The second selected bonus step.', ['Quest Steps']],
  'bonus-step-3': ['Bonus selection · third', 'Quest Steps', 'The third selected bonus step.', ['Quest Steps']],
  'double-points-a': ['Reward flourish', 'Double Points', 'After the score count for a successful Quest Steps bonus, or a fresh 100-point Last Words or Blood Ties result.', ['Rewards', 'Last Words', 'Quest Steps', 'Blood Ties']],
  'points-tick': ['Points counting', 'Rewards', 'Seven soft ticks across the score-count animation.', ['Rewards', 'Last Words', 'Quest Steps', 'Blood Ties']],
  'points-finish': ['Points settled', 'Rewards', 'The finishing ping when the points count reaches its total.', ['Rewards', 'Last Words', 'Quest Steps', 'Blood Ties']],
  'run-ended': ['Run ended', 'Outcomes', 'A failed puzzle ends the run.', ['Last Words', 'Quest Steps', 'Blood Ties']],
};
export function catalog(cues, manifest = {}) {
  return Object.entries(cues).map(([id, cue], index) => {
    const meta = manifest.sounds?.find(sound => sound.id === id);
    const [title, subtitle, trigger, tags] = details[id] || [meta?.title || id, meta?.group || 'Sound', meta?.trigger || 'Game feedback.', []];
    const files = cue.files.filter(file => /^[a-z0-9-]+\.(wav|m4a)$/.test(file));
    const currentMeta = meta && files.includes(meta.wav);
    return { id, number: String(index + 1).padStart(2, '0'), title, subtitle, trigger, tags, files,
      gain: cue.gain, duration: currentMeta ? meta.duration : null, waveform: currentMeta ? meta.waveform : [] };
  });
}

export function wavBytes(buffer) {
  const channels = buffer.numberOfChannels, frames = buffer.length;
  if (channels < 1 || channels > 2 || frames < 1 || !Number.isInteger(buffer.sampleRate)) throw new Error('Unsupported WAV format.');
  const bytes = new Uint8Array(44 + frames * channels * 2), view = new DataView(bytes.buffer);
  const word = (at, text) => [...text].forEach((char, i) => view.setUint8(at + i, char.charCodeAt(0)));
  word(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); word(8, 'WAVE'); word(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); word(36, 'data'); view.setUint32(40, bytes.length - 44, true);
  const data = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  for (let frame = 0; frame < frames; frame++) for (let channel = 0; channel < channels; channel++) {
    const sample = Math.max(-1, Math.min(1, Number.isFinite(data[channel][frame]) ? data[channel][frame] : 0));
    view.setInt16(44 + (frame * channels + channel) * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return bytes;
}

function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ -1) >>> 0;
}
// Uncompressed ZIP keeps exports dependency-free, readable in standard ZIP apps.
export function zipBytes(files) {
  const encoder = new TextEncoder(), records = []; let offset = 0;
  for (const file of files) {
    if (!/^[a-zA-Z0-9._-]+$/.test(file.name)) throw new Error('Invalid export filename.');
    const name = encoder.encode(file.name), body = file.bytes, header = new Uint8Array(30 + name.length);
    const view = new DataView(header.buffer), crc = crc32(body);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x800, true);
    view.setUint16(12, 33, true); view.setUint32(14, crc, true); view.setUint32(18, body.length, true); view.setUint32(22, body.length, true); view.setUint16(26, name.length, true); header.set(name, 30);
    records.push({ name, body, header, crc, offset }); offset += header.length + body.length;
  }
  const centralSize = records.reduce((sum, row) => sum + 46 + row.name.length, 0);
  const output = new Uint8Array(offset + centralSize + 22); let cursor = 0;
  for (const row of records) { output.set(row.header, cursor); cursor += row.header.length; output.set(row.body, cursor); cursor += row.body.length; }
  for (const row of records) {
    const view = new DataView(output.buffer, cursor, 46 + row.name.length);
    view.setUint32(0, 0x02014b50, true); view.setUint16(4, 20, true); view.setUint16(6, 20, true); view.setUint16(8, 0x800, true); view.setUint16(14, 33, true);
    view.setUint32(16, row.crc, true); view.setUint32(20, row.body.length, true); view.setUint32(24, row.body.length, true); view.setUint16(28, row.name.length, true); view.setUint32(42, row.offset, true);
    output.set(row.name, cursor + 46); cursor += 46 + row.name.length;
  }
  const end = new DataView(output.buffer, cursor, 22);
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, records.length, true); end.setUint16(10, records.length, true); end.setUint32(12, centralSize, true); end.setUint32(16, offset, true);
  return output;
}
