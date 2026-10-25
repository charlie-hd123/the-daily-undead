import { settings } from './library-core.js?v=20261025-1';

export async function renderVersion(input, options, sampleRate) {
  const config = settings(options), rate = 2 ** (config.pitch / 12);
  const Offline = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!Offline) throw new Error('Audio editing is unavailable in this browser. Current sounds can still be downloaded.');
  const tail = config.reverb ? 2 : config.delay ? 1.25 : 0;
  const context = new Offline(Math.min(2, input.numberOfChannels), Math.ceil((input.duration / rate + tail) * sampleRate), sampleRate);
  const source = context.createBufferSource(), level = context.createGain();
  source.buffer = input; source.playbackRate.value = rate; level.gain.value = config.level / 100;
  source.connect(level); level.connect(context.destination);
  if (config.reverb) {
    const response = context.createBuffer(1, Math.round(1.8 * sampleRate), sampleRate), values = response.getChannelData(0);
    let seed = 24102026;
    for (let i = 0; i < values.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const t = i / sampleRate;
      values[i] = (seed / 2147483648 - 1) * Math.exp(-t / .32) * (1 - Math.exp(-t / .008));
    }
    const room = context.createConvolver(), predelay = context.createDelay(.1), tone = context.createBiquadFilter(), wet = context.createGain();
    room.buffer = response; predelay.delayTime.value = .035; tone.type = 'lowpass'; tone.frequency.value = 3400;
    wet.gain.value = config.reverb / 100;
    level.connect(predelay); predelay.connect(room); room.connect(tone); tone.connect(wet); wet.connect(context.destination);
  }
  if (config.delay) for (let i = 1; i <= 4; i++) {
    const echo = context.createDelay(1.25), tone = context.createBiquadFilter(), wet = context.createGain();
    echo.delayTime.value = .18 * i; tone.type = 'lowpass'; tone.frequency.value = 4600 / i ** .4;
    wet.gain.value = config.delay / 100 * .55 ** (i - 1);
    level.connect(echo); echo.connect(tone); tone.connect(wet); wet.connect(context.destination);
  }
  source.start();
  const rendered = await context.startRendering();
  let peak = 0, last = 0;
  for (let channel = 0; channel < rendered.numberOfChannels; channel++) {
    const data = rendered.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      if (!Number.isFinite(data[i])) throw new Error('This file could not be processed. Try a different audio file.');
      const magnitude = Math.abs(data[i]); peak = Math.max(peak, magnitude);
      if (magnitude > .00003) last = Math.max(last, i);
    }
  }
  const frames = tail ? Math.min(rendered.length, Math.max(Math.round(.025 * sampleRate), last + Math.round(.015 * sampleRate))) : rendered.length;
  const output = context.createBuffer(rendered.numberOfChannels, frames, sampleRate);
  const protection = Math.min(1, 10 ** (-1 / 20) / Math.max(peak, 1e-12));
  for (let channel = 0; channel < output.numberOfChannels; channel++) {
    const to = output.getChannelData(channel), from = rendered.getChannelData(channel);
    for (let i = 0; i < frames; i++) to[i] = from[i] * protection;
    if (tail) for (let i = 0; i < Math.min(240, frames); i++) to[frames - 1 - i] *= i / 240;
  }
  return { buffer: output, protected: protection < 1 };
}
