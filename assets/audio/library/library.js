import { DEFAULT_SETTINGS, catalog, changed, settings, wavBytes, zipBytes } from './library-core.js?v=20261024-13';
import { renderVersion } from './library-audio.js?v=20261024-13';

const $ = selector => document.querySelector(selector);
const drafts = new Map(), cards = new Map(), buffers = new Map(), saveTimers = new Map(), rendered = new WeakMap(), uploads = new Map();
let SOUND_CUES, sounds = [], chosen, filter = 'All sounds', context, output, source, playing, generation = 0, queue = [], nextTimer;
let database, canPersist = true, exporting = false;
const options = ['level', 'pitch', 'reverb', 'delay'];

function message(text, error = false) { $('#draft-status').textContent = text; $('#draft-status').classList.toggle('is-error', error); }
async function audioContext() {
  const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Audio) throw new Error('Audio preview is unavailable in this browser. You can still download every sound.');
  if (!context || context.state === 'closed') context = new Audio({ latencyHint: 'interactive' });
  if (context.state === 'suspended') await context.resume();
  if (context.state !== 'running') throw new Error('Tap Play again to enable audio.');
  return context;
}
async function currentBuffer(sound) {
  if (!buffers.has(sound.id)) buffers.set(sound.id, (async () => {
    const ctx = await audioContext();
    for (const file of sound.files) try {
      const response = await fetch(new URL('../' + file, import.meta.url));
      if (!response.ok) continue;
      return await ctx.decodeAudioData(await response.arrayBuffer());
    } catch { /* Try the game's fallback format. */ }
    buffers.delete(sound.id); throw new Error('This sound could not load. Try its WAV or AAC download.');
  })());
  return buffers.get(sound.id);
}
async function draftBuffer(sound, snapshot = drafts.get(sound.id)) {
  if (!snapshot) return { buffer: await currentBuffer(sound), protected: false };
  if (!rendered.has(snapshot)) rendered.set(snapshot, (async () => {
    const ctx = await audioContext();
    const input = snapshot.blob ? await ctx.decodeAudioData(await snapshot.blob.arrayBuffer()) : await currentBuffer(sound);
    return renderVersion(input, snapshot.settings, ctx.sampleRate);
  })().catch(error => { rendered.delete(snapshot); throw error; }));
  return rendered.get(snapshot);
}
function paintPlayback() {
  for (const [id, card] of cards) {
    const active = playing?.id === id;
    card.classList.toggle('is-playing', active);
    const button = card.querySelector('.sound-play');
    button.textContent = active ? '■' : '▶'; button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', `${active ? 'Stop' : 'Play'} ${sounds.find(sound => sound.id === id).title}`);
  }
  $('#stop').disabled = !playing && !queue.length;
}
function stop(text = 'Ready. Pick a sound to listen.', clearQueue = true) {
  generation++; clearTimeout(nextTimer);
  if (clearQueue) queue = [];
  if (source) { try { source.stop(); } catch {} source.disconnect(); source = null; }
  if (output) { output.disconnect(); output = null; }
  playing = null; paintPlayback(); $('#playback-status').textContent = text;
}
async function play(sound, mode = 'current', keepQueue = false) {
  stop(`Loading ${sound.title}…`, !keepQueue);
  const token = generation, snapshot = drafts.get(sound.id);
  playing = { id: sound.id, mode }; paintPlayback();
  try {
    const ctx = await audioContext();
    const result = mode === 'draft' ? await draftBuffer(sound, snapshot) : { buffer: await currentBuffer(sound) };
    if (token !== generation) return;
    source = ctx.createBufferSource(); source.buffer = result.buffer;
    output = ctx.createGain(); output.gain.value = sound.gain * Number($('#master-volume').value) / 100;
    source.connect(output); output.connect(ctx.destination);
    $('#playback-status').textContent = `${sound.number} · ${sound.title}${mode === 'draft' ? ' · your version' : ''}`;
    if (mode === 'draft') message(result.protected ? 'Playing your version. Peak protection keeps it from clipping.' : 'Playing your version.');
    source.onended = () => {
      if (token !== generation) return;
      if (queue.length) {
        playing = null; paintPlayback(); $('#playback-status').textContent = 'Next sound…';
        nextTimer = setTimeout(() => { if (token === generation) void play(queue.shift(), 'current', true); }, 350);
      } else stop(`Finished ${sound.title}.`);
    };
    source.start();
  } catch (error) { if (token === generation) { stop(error.message); if (mode === 'draft') message(error.message, true); } }
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('daily-undead-sound-room-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts', { keyPath: 'cue' });
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Draft storage is busy.'));
  });
}
function updateDraftCount() {
  $('#draft-count').textContent = drafts.size; $('#export-drafts').disabled = !drafts.size || exporting;
  for (const [id, card] of cards) card.querySelector('.draft-dot').hidden = !drafts.has(id);
}
function persist(id) {
  clearTimeout(saveTimers.get(id));
  if (!canPersist) return;
  $('#saved-status').textContent = 'Saving your draft…';
  saveTimers.set(id, setTimeout(() => saveNow(id), 250));
}
function saveNow(id) {
  clearTimeout(saveTimers.get(id)); saveTimers.delete(id);
  if (!canPersist) return;
  try {
    const snapshot = drafts.get(id);
    const transaction = database.transaction('drafts', 'readwrite'), store = transaction.objectStore('drafts');
    if (snapshot) store.put(snapshot); else store.delete(id);
    transaction.oncomplete = () => { $('#saved-status').textContent = 'Drafts saved on this device.'; };
    transaction.onerror = transaction.onabort = () => {
      canPersist = false; $('#saved-status').textContent = 'Drafts last for this visit. Export to keep them.';
    };
  } catch { canPersist = false; $('#saved-status').textContent = 'Drafts last for this visit. Export to keep them.'; }
}
function edit(id, patch) {
  const old = drafts.get(id) || { cue: id, settings: { ...DEFAULT_SETTINGS }, notes: '', filename: '', baseFiles: [...SOUND_CUES[id].files] };
  const next = { ...old, ...patch, updatedAt: new Date().toISOString() };
  if (changed(next)) drafts.set(id, next); else drafts.delete(id);
  persist(id); updateDraftCount(); updateBadge();
}
function updateBadge() {
  const has = drafts.has(chosen?.id); $('#draft-badge').textContent = has ? 'Your draft' : 'Experiment'; $('#draft-badge').classList.toggle('has-draft', has);
}
function choose(sound, scroll = false) {
  chosen = sound; const draft = drafts.get(sound.id), values = settings(draft?.settings);
  for (const [id, card] of cards) card.classList.toggle('is-chosen', id === sound.id);
  $('#bench-content').hidden = false; $('#bench-loading').hidden = true;
  $('#bench-number').textContent = sound.number; $('#bench-name').textContent = sound.title;
  $('#bench-source').textContent = draft?.filename ? `Replacement: ${draft.filename}` : `Current game sound · ${sound.duration?.toFixed(2) ?? '—'} s`;
  $('#remove-file').hidden = !draft?.blob; $('#replacement').value = ''; $('#notes').value = draft?.notes || '';
  for (const key of options) $('#' + key).value = values[key];
  paintSettings(); updateBadge();
  message(draft?.baseFiles?.join() !== undefined && draft.baseFiles.join() !== sound.files.join() ? 'The game sound has changed since this draft. Compare before exporting.' : 'Ready to experiment.');
  if (scroll) {
    history.replaceState(null, '', '#' + sound.id);
    if (window.matchMedia('(max-width:760px)').matches) $('.workbench').scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth' });
    $('#workbench-title').setAttribute('tabindex', '-1'); $('#workbench-title').focus({ preventScroll: true });
  }
}
function paintSettings() {
  const value = settings(Object.fromEntries(options.map(key => [key, $('#' + key).value])));
  $('#level-value').value = value.level + '%'; $('#pitch-value').value = value.pitch ? `${value.pitch > 0 ? '+' : ''}${value.pitch} semitones` : 'Original';
  $('#reverb-value').value = value.reverb + '%'; $('#delay-value').value = value.delay + '%'; return value;
}
function visibleSounds() {
  const query = $('#search').value.trim().toLowerCase();
  return sounds.filter(sound => (filter === 'All sounds' || sound.tags.includes(filter)) && `${sound.title} ${sound.subtitle} ${sound.trigger} ${sound.tags.join(' ')} ${sound.id}`.toLowerCase().includes(query));
}
function filterSounds() {
  const visible = new Set(visibleSounds().map(sound => sound.id));
  for (const [id, card] of cards) card.hidden = !visible.has(id);
  $('#showing').textContent = `${visible.size} ${visible.size === 1 ? 'sound' : 'sounds'}${filter === 'All sounds' ? '' : ' · ' + filter}`;
  $('#empty').hidden = Boolean(visible.size); $('#play-all').disabled = !visible.size;
}
function renderCards() {
  for (const sound of sounds) {
    const card = document.createElement('article'); card.className = 'sound-card'; card.id = 'sound-' + sound.id;
    card.innerHTML = '<span class="sound-number"></span><div class="sound-main"><div class="sound-top"><h3></h3><span class="draft-dot" hidden>● Draft</span></div><p class="sound-trigger"></p><div class="wave" aria-hidden="true"></div><div class="sound-bottom"><span class="duration"></span><span class="sound-tag"></span><a download>WAV ↓</a><a download>AAC ↓</a></div></div><div class="sound-actions"><button class="sound-play" type="button" aria-pressed="false">▶</button><button class="experiment" type="button">Experiment</button></div>';
    card.querySelector('.sound-number').textContent = sound.number; card.querySelector('h3').textContent = sound.title; card.querySelector('.sound-trigger').textContent = sound.trigger;
    card.querySelector('.duration').textContent = sound.duration ? sound.duration.toFixed(2) + ' s' : '— s';
    card.querySelector('.sound-tag').textContent = sound.subtitle;
    for (const height of sound.waveform || []) { const bar = document.createElement('i'); bar.style.height = Math.max(2, Math.sqrt(height) * 25) + 'px'; card.querySelector('.wave').append(bar); }
    const links = card.querySelectorAll('a');
    for (const [i, extension] of ['.wav', '.m4a'].entries()) { const file = sound.files.find(name => name.endsWith(extension)); if (file) links[i].href = '../' + file; else links[i].hidden = true; }
    const button = card.querySelector('.sound-play'); button.setAttribute('aria-label', 'Play ' + sound.title);
    button.addEventListener('click', () => { if (playing?.id === sound.id) stop(); else void play(sound); });
    const experiment = card.querySelector('.experiment'); experiment.setAttribute('aria-label', 'Experiment with ' + sound.title); experiment.addEventListener('click', () => choose(sound, true));
    $('#sound-list').append(card); cards.set(sound.id, card);
  }
}

async function replacement(file) {
  const sound = chosen;
  if (!file || !sound) return;
  if (file.size > 20 * 1024 * 1024) { message('Choose an audio file smaller than 20 MB.', true); return; }
  const token = (uploads.get(sound.id) || 0) + 1; uploads.set(sound.id, token);
  stop(); message('Checking your file…');
  try {
    const ctx = await audioContext(), buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    if (!buffer.duration || buffer.duration > 20 || buffer.numberOfChannels > 2) throw new Error('Choose mono or stereo audio up to 20 seconds long.');
    if (uploads.get(sound.id) !== token) return;
    edit(sound.id, { blob: file, filename: file.name });
    if (chosen.id === sound.id) { choose(sound); message('Replacement ready. Compare it with the current sound.'); }
  } catch (error) { if (chosen.id === sound.id && uploads.get(sound.id) === token) message(error.message.includes('Choose') ? error.message : 'That file could not be read as audio. Your previous draft is unchanged.', true); }
  $('#replacement').value = '';
}
function download(bytes, filename, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type })), link = document.createElement('a');
  link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function exportOne() {
  const sound = chosen, snapshot = drafts.get(sound.id); $('#download-draft').disabled = true; message('Preparing your WAV…');
  try { const { buffer, protected: limited } = await draftBuffer(sound, snapshot); download(wavBytes(buffer), sound.id + '-draft.wav', 'audio/wav'); if (chosen.id === sound.id) message(limited ? 'WAV ready. Peak protection was applied.' : 'Your edited WAV is ready.'); }
  catch (error) { message(error.message, true); } finally { $('#download-draft').disabled = false; }
}
async function exportDrafts() {
  exporting = true; updateDraftCount(); const snapshot = [...drafts.values()];
  try {
    const files = [], entries = [];
    for (let index = 0; index < snapshot.length; index++) {
      const draft = snapshot[index], sound = sounds.find(item => item.id === draft.cue);
      $('#saved-status').textContent = `Exporting ${index + 1} of ${snapshot.length}…`;
      const result = await draftBuffer(sound, draft), filename = sound.id + '-draft.wav';
      files.push({ name: filename, bytes: wavBytes(result.buffer) });
      entries.push({ cue: sound.id, name: sound.title, file: filename, duration: result.buffer.duration, sampleRate: result.buffer.sampleRate, channels: result.buffer.numberOfChannels, settings: settings(draft.settings), notes: draft.notes, replacementFilename: draft.filename || null, originalFiles: draft.baseFiles, currentFiles: sound.files, gameGain: sound.gain, peakProtectionApplied: result.protected });
    }
    files.push({ name: 'draft-manifest.json', bytes: new TextEncoder().encode(JSON.stringify({ title: 'The Daily Undead · Sound drafts', exportedAt: new Date().toISOString(), appliedToGame: false, drafts: entries }, null, 2)) });
    download(zipBytes(files), 'daily-undead-sound-drafts.zip', 'application/zip');
    $('#saved-status').textContent = 'Draft export ready. The game is unchanged.';
  } catch (error) { $('#saved-status').textContent = 'Export failed. ' + error.message; }
  finally { exporting = false; updateDraftCount(); }
}

async function init() {
  let version = String(Date.now());
  try { const response = await fetch('../../../release.json', { cache: 'no-cache' }); const release = await response.json(); if (/^\d{8}-\d+$/.test(release.build)) version = release.build; } catch {}
  ({ SOUND_CUES } = await import('../../../js/game-audio.js?v=' + version));
  let manifest;
  try { const response = await fetch('../manifest.json', { cache: 'no-cache' }); if (response.ok) manifest = await response.json(); } catch {}
  sounds = catalog(SOUND_CUES, manifest); renderCards(); $('#sound-count').textContent = sounds.length;
  for (const name of ['All sounds', 'Last Words', 'Quest Steps', 'Blood Ties', 'Rewards', 'Controls']) {
    const button = document.createElement('button'); button.className = 'filter'; button.textContent = name; button.setAttribute('aria-pressed', String(name === filter));
    button.addEventListener('click', () => { filter = name; for (const item of $('#filters').children) item.setAttribute('aria-pressed', String(item === button)); filterSounds(); }); $('#filters').append(button);
  }
  try {
    database = await openDatabase();
    const saved = await new Promise((resolve, reject) => { const request = database.transaction('drafts').objectStore('drafts').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    for (const row of saved) if (SOUND_CUES[row.cue] && changed(row)) drafts.set(row.cue, { ...row, settings: settings(row.settings) });
  } catch { canPersist = false; $('#saved-status').textContent = 'Drafts last for this visit. Export to keep them.'; }
  choose(sounds.find(sound => sound.id === location.hash.slice(1)) || sounds[0]); updateDraftCount(); filterSounds(); paintPlayback();
  $('#playback-status').textContent = 'Ready. Pick a sound to listen.'; $('#export-list').disabled = false;
  $('#search').addEventListener('input', filterSounds);
  $('#stop').addEventListener('click', () => stop());
  $('#play-all').addEventListener('click', () => { stop(); queue = visibleSounds(); if (queue.length) void play(queue.shift(), 'current', true); });
  $('#master-volume').addEventListener('input', () => { $('#master-value').value = $('#master-volume').value + '%'; if (output && playing) output.gain.value = SOUND_CUES[playing.id].gain * Number($('#master-volume').value) / 100; });
  $('#play-current').addEventListener('click', () => void play(chosen)); $('#play-draft').addEventListener('click', () => void play(chosen, 'draft'));
  for (const key of options) $('#' + key).addEventListener('input', () => { stop(); edit(chosen.id, { settings: paintSettings() }); message('Ready to preview your changes.'); });
  $('#notes').addEventListener('input', () => edit(chosen.id, { notes: $('#notes').value }));
  $('#replacement').addEventListener('change', event => void replacement(event.target.files[0]));
  for (const type of ['dragover', 'dragleave', 'drop']) $('#drop-zone').addEventListener(type, event => { event.preventDefault(); $('#drop-zone').classList.toggle('is-over', type === 'dragover'); if (type === 'drop') void replacement(event.dataTransfer.files[0]); });
  $('#remove-file').addEventListener('click', () => { stop(); uploads.set(chosen.id, (uploads.get(chosen.id) || 0) + 1); edit(chosen.id, { blob: null, filename: '' }); choose(chosen); });
  $('#reset-draft').addEventListener('click', () => { stop(); uploads.set(chosen.id, (uploads.get(chosen.id) || 0) + 1); drafts.delete(chosen.id); persist(chosen.id); updateDraftCount(); choose(chosen); message('Reset to the current game sound.'); });
  $('#back-to-collection').addEventListener('click', () => $('.collection-tools').scrollIntoView({ block: 'start' }));
  $('#download-draft').addEventListener('click', () => void exportOne()); $('#export-drafts').addEventListener('click', () => void exportDrafts());
  $('#export-list').addEventListener('click', () => {
    const quote = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
    const rows = [['Number', 'Cue', 'Name', 'Trigger', 'Duration seconds', 'Game volume', 'WAV', 'AAC'], ...sounds.map(sound => [sound.number, sound.id, sound.title, sound.trigger, sound.duration, sound.gain, ...sound.files])];
    download(rows.map(row => row.map(quote).join(',')).join('\r\n'), 'daily-undead-current-sounds.csv', 'text/csv');
  });
  window.addEventListener('hashchange', () => { const sound = sounds.find(item => item.id === location.hash.slice(1)); if (sound) choose(sound); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stop('Paused while this page was hidden.'); for (const id of [...saveTimers.keys()]) saveNow(id); } });
  window.addEventListener('pagehide', () => { stop(); for (const id of [...saveTimers.keys()]) saveNow(id); });
}
init().catch(error => { $('#load-error').hidden = false; $('#playback-status').textContent = 'Library unavailable. Refresh to try again.'; console.error(error); });
