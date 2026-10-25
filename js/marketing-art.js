const DISPLAY_FONT = 'DailyUndeadMarketingDisplay';
const BODY_FONT = 'DailyUndeadMarketingBody';
const WHITE = '#f5f6fb';
const CYAN = '#36dbf4';
const PANEL_CENTRE = 756;

const cards = {
  easter: {
    title: 'Which Zombies map is it?',
    subtitle: ['Can you identify the map from one of its', 'main quest steps?'],
  },
  word: {
    title: 'Which Zombies word is it?',
    subtitle: ['Try to solve the Zombies word or phrase', 'with these limited letters.'],
  },
  blood: {
    title: 'Spot a Zombies connection?',
    subtitle: ['Can you identify three tiles that form', 'a connection? There are four total.'],
  },
};

function roundRect(ctx, x, y, width, height, radius, fill, stroke, lineWidth = 2) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function accent(ctx, x1, x2) {
  const gradient = ctx.createLinearGradient(x1, 0, x2, 0);
  gradient.addColorStop(0, '#1ce5f0');
  gradient.addColorStop(.55, '#5ea7f4');
  gradient.addColorStop(1, '#e65cea');
  return gradient;
}

function label(ctx, text, x, y, size, color = WHITE, align = 'left', weight = 800) {
  ctx.font = `${weight} ${size}px ${DISPLAY_FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillText(text, x, y);
}

function wrap(ctx, text, maximumWidth) {
  const lines = [];
  let line = '';
  for (const word of text.trim().split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maximumWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function background(ctx) {
  ctx.fillStyle = '#050d17';
  ctx.fillRect(0, 0, 1254, 1254);
  let glow = ctx.createRadialGradient(70, 70, 0, 70, 70, 1050);
  glow.addColorStop(0, 'rgba(17,81,109,.3)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1254, 1254);
  glow = ctx.createRadialGradient(1200, 1120, 0, 1200, 1120, 750);
  glow.addColorStop(0, 'rgba(61,30,89,.16)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1254, 1254);
  let seed = 173;
  ctx.fillStyle = 'rgba(141,184,206,.035)';
  for (let i = 0; i < 9000; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const x = seed % 1254;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    ctx.fillRect(x, seed % 1254, 1, 1);
  }
  roundRect(ctx, 20, 17, 1214, 1218, 32, null, '#1dafe6', 3);
  ctx.fillStyle = accent(ctx, 80, 152);
  ctx.fillRect(80, 92, 72, 6);
  label(ctx, 'TODAY’S ROUND', 173, 71, 41, '#13e3e8', 'left', 700);
  ctx.fillStyle = accent(ctx, 1112, 1201);
  ctx.fillRect(1112, 47, 89, 6);
  ctx.fillStyle = '#9467d2';
  ctx.fillRect(1196, 47, 5, 91);
}

function panel(ctx) {
  const fill = ctx.createLinearGradient(70, 450, 1184, 1058);
  fill.addColorStop(0, '#071b2e');
  fill.addColorStop(1, '#080f23');
  roundRect(ctx, 68, 454, 1118, 604, 30, fill, '#169de1', 3);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(68, 454, 1118, 604, 30);
  ctx.clip();
  ctx.shadowColor = '#24caf1';
  ctx.shadowBlur = 20;
  ctx.fillStyle = accent(ctx, 68, 1186);
  ctx.fillRect(68, 454, 1118, 7);
  ctx.restore();
}

function footer(ctx, logo) {
  ctx.drawImage(logo, 64, 1114, 94, 94);
  ctx.font = `500 30px ${BODY_FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#c2b7eb';
  ctx.fillText('thedailyundead.com', 174, 1162);
  ctx.fillStyle = accent(ctx, 465, 1185);
  ctx.fillRect(465, 1161, 720, 2);
}

function drawQuest(ctx, clue) {
  let lines, size, lineHeight;
  for (size = 60; size >= 30; size--) {
    ctx.font = `500 ${size}px ${BODY_FONT}`;
    lines = wrap(ctx, clue, 948);
    lineHeight = Math.round(size * 86 / 60);
    if (lines.length * lineHeight <= 460 && lines.every(line => ctx.measureText(line).width <= 948)) break;
  }
  if (size < 30) throw new Error('The daily clue does not fit the marketing card.');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = WHITE;
  const metrics = lines.map(line => ctx.measureText(line));
  const top = -metrics[0].actualBoundingBoxAscent;
  const bottom = (lines.length - 1) * lineHeight + metrics.at(-1).actualBoundingBoxDescent;
  const baseline = PANEL_CENTRE - (top + bottom) / 2;
  lines.forEach((line, i) => ctx.fillText(line, 627, baseline + i * lineHeight));
}

function characterWidth(character, size) {
  if (/^[A-Z]$/i.test(character)) return size * .875;
  if (/['’“”]/.test(character)) return size * .3;
  if (character === '-') return size * .45;
  return size * .55;
}

function wordRows(answer, size) {
  const gap = size * .2, wordGap = size * .9;
  const rows = [];
  let words = [], width = 0;
  for (const word of answer.trim().toUpperCase().split(/\s+/)) {
    const characters = [...word];
    const wordWidth = characters.reduce((sum, char) => sum + characterWidth(char, size), 0) + gap * (characters.length - 1);
    if (wordWidth > 930) return null;
    if (words.length && width + wordGap + wordWidth > 930) {
      rows.push({ words, width });
      words = []; width = 0;
    }
    width += (words.length ? wordGap : 0) + wordWidth;
    words.push({ characters, width: wordWidth });
  }
  if (words.length) rows.push({ words, width });
  return rows;
}

function drawWord(ctx, { answer, initialLetters, category }) {
  let size = 80, rows;
  for (; size >= 30; size -= 2) {
    rows = wordRows(answer, size);
    if (rows && rows.length <= 3 && rows.length * size * 1.9125 <= 460) break;
  }
  if (size < 30) throw new Error('The daily word does not fit the marketing card.');
  const revealed = new Set(initialLetters.map(letter => letter.toUpperCase()));
  const strokes = [], letters = [];
  rows.forEach((row, rowIndex) => {
    let x = (1254 - row.width) / 2;
    const y = rowIndex * size * 1.9125;
    row.words.forEach((word, wordIndex) => {
      word.characters.forEach((character, index) => {
        const width = characterWidth(character, size);
        if (/^[A-Z]$/.test(character)) {
          strokes.push({ x1: x + size * .0875, x2: x + width - size * .0875, y: y + size });
          if (revealed.has(character)) letters.push({ character, x: x + width / 2, baseline: y + size * .9 });
        } else letters.push({ character, x: x + width / 2, baseline: y + size * .9 });
        x += width + (index < word.characters.length - 1 ? size * .2 : 0);
      });
      if (wordIndex < row.words.length - 1) x += size * .9;
    });
  });
  ctx.font = `800 ${size}px ${DISPLAY_FONT}`;
  ctx.textBaseline = 'alphabetic';
  const tops = strokes.map(stroke => stroke.y - 2.5), bottoms = strokes.map(stroke => stroke.y + 2.5);
  letters.forEach(({ character, baseline }) => {
    const metrics = ctx.measureText(character);
    tops.push(baseline - metrics.actualBoundingBoxAscent);
    bottoms.push(baseline + metrics.actualBoundingBoxDescent);
  });
  const hint = `Hint: ${category}`;
  let hintSize = 40;
  do { ctx.font = `500 ${hintSize}px ${BODY_FONT}`; if (ctx.measureText(hint).width <= 930) break; hintSize -= 2; } while (hintSize > 24);
  const hintMetrics = ctx.measureText(hint), hintBaseline = (rows.length - 1) * size * 1.9125 + size * 1.95;
  tops.push(hintBaseline - hintMetrics.actualBoundingBoxAscent);
  bottoms.push(hintBaseline + hintMetrics.actualBoundingBoxDescent);
  const offset = PANEL_CENTRE - (Math.min(...tops) + Math.max(...bottoms)) / 2;
  ctx.strokeStyle = '#c8d1e7';ctx.lineWidth = 5;ctx.lineCap = 'round';
  strokes.forEach(stroke => { ctx.beginPath();ctx.moveTo(stroke.x1, stroke.y + offset);ctx.lineTo(stroke.x2, stroke.y + offset);ctx.stroke(); });
  ctx.font = `800 ${size}px ${DISPLAY_FONT}`;ctx.textAlign = 'center';ctx.fillStyle = WHITE;
  letters.forEach(({ character, x, baseline }) => ctx.fillText(character, x, baseline + offset));
  ctx.font = `500 ${hintSize}px ${BODY_FONT}`;ctx.fillStyle = CYAN;
  ctx.fillText(hint, 627, hintBaseline + offset + 24);
}

function drawBlood(ctx, puzzle) {
  puzzle.tiles.forEach((tile, i) => {
    const x = 100 + i % 4 * 267, y = 511 + Math.floor(i / 4) * 165;
    const fill = ctx.createLinearGradient(x, y, x + 252, y + 145);
    fill.addColorStop(0, '#16283c');fill.addColorStop(1, '#10192b');
    roundRect(ctx, x, y, 252, 145, 16, fill, '#4c6d96', 2);
    let lines, size;
    for (size = 38; size >= 22; size -= 2) {
      ctx.font = `800 ${size}px ${DISPLAY_FONT}`;
      lines = wrap(ctx, tile.toUpperCase(), 222);
      if (lines.length * (size + 7) <= 120 && lines.every(line => ctx.measureText(line).width <= 222)) break;
    }
    if (size < 22) throw new Error('A daily tile does not fit the marketing card.');
    ctx.textAlign = 'center';ctx.textBaseline = 'middle';ctx.fillStyle = WHITE;
    lines.forEach((line, row) => ctx.fillText(line, x + 126, y + 72.5 + (row - (lines.length - 1) / 2) * (size + 7)));
  });
}

let logoPromise, fontsPromise;
export async function drawMarketingImage(canvas, type, puzzle) {
  if (!cards[type]) throw new Error('Unknown marketing puzzle.');
  fontsPromise ||= Promise.all([
    [DISPLAY_FONT, 'barlow-condensed-800.ttf', '800'],
    [DISPLAY_FONT, 'barlow-condensed-700.ttf', '700'],
    [BODY_FONT, 'barlow-500.ttf', '500'],
  ].map(async ([family, filename, weight]) => {
    const url = new URL(`../assets/fonts/${filename}`, import.meta.url);
    const face = await new FontFace(family, `url("${url.href}")`, { weight }).load();
    document.fonts.add(face);
  }));
  logoPromise ||= new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The original brand logo could not be loaded.'));
    image.src = new URL('../assets/zombie-logo.png?v=20261025-1', import.meta.url).href;
  });
  const [logo] = await Promise.all([logoPromise, fontsPromise]);
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.save();
  try {
    background(ctx);
    label(ctx, cards[type].title, 78, 154, 105);
    ctx.font = `500 46px ${BODY_FONT}`;ctx.fillStyle = '#ae90f0';ctx.textAlign = 'left';ctx.textBaseline = 'top';
    cards[type].subtitle.forEach((line, i) => ctx.fillText(line, 80, 291 + i * 65));
    panel(ctx);
    if (type === 'easter') drawQuest(ctx, puzzle.clue);
    else if (type === 'word') drawWord(ctx, puzzle);
    else drawBlood(ctx, puzzle);
    footer(ctx, logo);
  } finally { ctx.restore(); }
}
