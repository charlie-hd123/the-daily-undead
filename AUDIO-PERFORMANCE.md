# Audio performance audit · 25 October 2026

The complete active pack is small enough to preload without reducing the approved sound quality. It contains 17 effects: **637,224 bytes (637 KB) of 192kb/s AAC**, or 4,529,574 bytes (4.53 MB) if every sound falls back to WAV. On the normal AAC path the WAVs are not fetched as well. If AAC fails, the engine tries WAV; if every AAC transfers but fails decoding, the combined worst-case payload is about 5.17 MB. AAC transfer is about 86% smaller than WAV. Decoded sample memory is about 9.06 MB at 44.1kHz or 9.86 MB at a 48kHz context, excluding browser/codec/graph overhead. The largest active AAC is the Mystery Box at 113.9 KB.

## Loading and playback

The game begins warming all active cues at audio initialisation, before the first box interaction. Muted-on-entry players make no audio requests. Four background workers load/decode cues at a time, beginning with the box and selection click; other frequent feedback follows. An actual play/readiness request bypasses the background queue, while concurrent requests for that cue share the same download and decoded buffer. All 17 cues remain eligible for preload, including rewards, to avoid first-use result stutters. Loading does not block puzzle rendering; the box retains its existing bounded audio-readiness wait.

Repeated pointer, touch and keyboard events reuse an existing preload batch; already decoded cues are neither downloaded nor decoded again. Muting stops unstarted queue items. Switching games retains the shared buffers. Failed fetch/body/decode attempts have a timeout and retry cooldown. Page/connection restoration warms and resumes audio. Warmed cues are scheduled synchronously and every accepted cue starts at sample zero. The engine avoids replaying obsolete cold ticks together after a connection delay.

The current files keep their content-hashed URLs, source sound, stereo, reverb tails and volume. Under staging's authenticated gateway, successful hashed audio responses now get **private browser caching for one year**, varied by Authorization. Changed sound bytes use a different URL. HTML, release/configuration/manifest responses, errors and account data do not receive this policy. The staging password still gates network requests. Browser eviction and private browsing can require a new download. Production is still on its existing hosting/cache behavior; no production deployment was made.

## Per-sound sizes

Decimal KB (1,000 bytes). WAVs remain available for review/download and playback fallback.

| Sound | Duration | Channels | AAC | WAV |
|---|---:|---:|---:|---:|
| Mystery Box opening | 4.68 s | 2 | 113.9 KB | 825.6 KB |
| Correct letter | 2.26 s | 2 | 48.2 KB | 398.7 KB |
| Correct streak 2 | 2.13 s | 2 | 46.4 KB | 376.5 KB |
| Correct streak 3 | 2.01 s | 2 | 45.2 KB | 355.5 KB |
| Correct streak 4 | 1.94 s | 2 | 42.4 KB | 341.4 KB |
| Wrong answer | 0.72 s | 1 | 24.0 KB | 63.5 KB |
| Clue reveal | 0.66 s | 2 | 20.0 KB | 116.5 KB |
| Selection & deselection | 0.14 s | 2 | 6.6 KB | 24.7 KB |
| Answer lock-in _ connection | 1.80 s | 2 | 34.1 KB | 317.0 KB |
| Puzzle solved | 2.52 s | 2 | 62.7 KB | 444.6 KB |
| Bonus selection first | 0.94 s | 2 | 17.7 KB | 166.5 KB |
| Bonus selection second | 0.89 s | 2 | 17.4 KB | 157.2 KB |
| Bonus selection third | 0.84 s | 2 | 16.4 KB | 148.4 KB |
| Reward flourish | 3.38 s | 2 | 70.2 KB | 596.7 KB |
| Points Counting | 0.15 s | 1 | 8.3 KB | 13.3 KB |
| Points Settled | 0.66 s | 1 | 20.9 KB | 58.3 KB |
| Run ended | 1.42 s | 1 | 42.9 KB | 125.3 KB |

## Storage versus page download

The audio directory also retains earlier sound revisions, auditions and recorded source material: 197 audio files totalling about 19.4 MB at this audit. The game references only the 17 active cues, so archived files are not downloaded by normal gameplay. They remain useful for comparison and for older open releases. Removing them would reduce repository/deployment storage, not the active page's audio transfer.

## Further options and tradeoffs

- Further bitrate reduction, mono downmixing or shortened reverb tails would change the approved sound. There is little reason to do that for a 637 KB pack without a measured mobile problem.
- Splitting preload by puzzle or lazy-loading reward sounds could reduce initial bytes, but makes first-use feedback depend on the network. Keeping this small pack warm is the better tradeoff for responsiveness.
- A sprite or combined pack could reduce request count, but adds cue-boundary/seek/maintenance risks. Bounded concurrency plus browser caching is sufficient at this scale.
- The AAC containers include a small amount of reserved padding (around 2–3 KB each). Repacking could save a few tens of KB without re-encoding, but was not done: it adds validation and cold-cache churn for a minor gain.
- Browser decoding still happens on each new page lifetime even with disk-cached files; retained buffers prevent repeat decoding within the open game. No service worker, extra persistent database, paid service or external runtime dependency was introduced.

## Evidence and limits

Sizes come from the exact current files; decoded-memory estimates use WAV frame count × channels × 4 bytes; browser resampling and AAC padding can vary the exact allocation. Regression tests cover request/decode concurrency and deduplication, urgent requests, mute/unmute queues, zero-offset playback, retry/deadline/recovery and authenticated cache boundaries. Physical iPhone memory, latency and network-throttling benchmarks were not available; no subjective listening assessment is claimed.

References: [AudioBuffer storage](https://developer.mozilla.org/en-US/docs/Web/API/AudioBuffer), [Cloudflare browser caching defaults](https://developers.cloudflare.com/pages/configuration/serving-pages/), [headers and content-hashed caching](https://developers.cloudflare.com/pages/configuration/headers/).
