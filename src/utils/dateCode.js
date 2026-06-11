// Date code parsing for Swire can bottom ink-jet codes.
// Printed format (no spaces, dot-matrix): BBMAR0827SCD12:01
//   BB    — best-by prefix
//   MAR   — month
//   0827  — expiration date (MMDD)
//   SCD   — production day code
//   12:01 — production time

export const MONTH_LIST = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const MONTHS = {
  JAN: 'January', FEB: 'February', MAR: 'March', APR: 'April',
  MAY: 'May', JUN: 'June', JUL: 'July', AUG: 'August',
  SEP: 'September', OCT: 'October', NOV: 'November', DEC: 'December',
};

// OCR confusion maps — dot-matrix ink misreads
const TO_LETTER = { '0': 'O', '1': 'I', '2': 'Z', '3': 'E', '4': 'A', '5': 'S', '6': 'G', '7': 'T', '8': 'B', '9': 'G' };
const TO_DIGIT = { O: '0', Q: '0', D: '0', C: '0', I: '1', L: '1', J: '1', Z: '2', E: '3', A: '4', S: '5', G: '6', B: '8', R: '8' };

function mapToLetter(ch) { return TO_LETTER[ch] || ch; }
function mapToDigit(ch) { return TO_DIGIT[ch] || ch; }
function isDigit(ch) { return ch >= '0' && ch <= '9'; }
function isLetter(ch) { return ch >= 'A' && ch <= 'Z'; }

// Fuzzy month match on a 3-char window. Applies digit→letter mapping,
// then allows at most 1 outright mismatch. Returns { month, subs } or null.
function fuzzyMonth(win) {
  if (win.length !== 3) return null;
  const mapped = [mapToLetter(win[0]), mapToLetter(win[1]), mapToLetter(win[2])];
  let best = null;
  for (const month of MONTH_LIST) {
    let matches = 0;
    let mappedCount = 0;
    for (let i = 0; i < 3; i++) {
      if (mapped[i] === month[i]) {
        matches++;
        if (mapped[i] !== win[i]) mappedCount++;
      }
    }
    if (matches === 3) {
      const subs = mappedCount;
      if (!best || subs < best.subs) best = { month, subs };
    } else if (matches === 2) {
      const subs = mappedCount + 1.5;
      if (!best || subs < best.subs) best = { month, subs };
    }
  }
  return best;
}

// Parse OCR text into structured date code fields.
// Tolerates missing spaces and common OCR character confusions,
// "filling in the blanks" and flagging inferred fields for user approval.
export function parseDateCode(raw) {
  if (!raw) return { raw: '', confidence: 'none', inferred: [] };
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9:]/g, '');
  if (!cleaned) return { raw: '', confidence: 'none', inferred: [] };

  // Find best month candidate anywhere in the string
  let monthHit = null;
  for (let i = 0; i + 3 <= cleaned.length; i++) {
    const hit = fuzzyMonth(cleaned.slice(i, i + 3));
    if (hit && (!monthHit || hit.subs < monthHit.subs)) {
      monthHit = { ...hit, index: i };
      if (hit.subs === 0) break; // exact match — take the first one
    }
  }
  if (!monthHit) return { raw: cleaned, confidence: 'none', inferred: [] };

  const inferred = [];
  if (monthHit.subs > 0) inferred.push('month');
  const month = monthHit.month;

  // Extract 4-digit date right after the month (map letter confusions to digits)
  let pos = monthHit.index + 3;
  let date = '';
  let dateSubs = 0;
  while (pos < cleaned.length && date.length < 4) {
    const ch = cleaned[pos];
    const d = mapToDigit(ch);
    if (isDigit(d)) {
      date += d;
      if (d !== ch) dateSubs++;
      pos++;
    } else if (ch === ':') {
      pos++; // stray colon — skip
    } else {
      break;
    }
  }
  // Guard against garbage: a real date should be mostly true digits
  if (dateSubs > 2) {
    date = '';
    dateSubs = 0;
  }
  if (date.length < 4) {
    // Month found but date incomplete — partial result
    return {
      raw: cleaned, prefix: 'BB', month, monthFull: MONTHS[month],
      date, dayCode: '', dayCodeFull: '', time: '',
      confidence: date.length >= 2 ? 'partial' : 'none', inferred,
    };
  }
  if (dateSubs > 0) inferred.push('date');

  // Extract day code: 2-4 chars (map digit confusions to letters),
  // stopping when the remainder looks like a time (e.g. 12:01 / 12C01 / 12O1)
  let dayCode = '';
  let daySubs = 0;
  while (pos < cleaned.length && dayCode.length < 4) {
    const rest = cleaned.slice(pos);
    const restMapped = rest.split('').map(c => (c === ':' ? ':' : mapToDigit(c))).join('');
    // Stop at the time only when it starts with a true digit (e.g. "12:01", "12O1")
    if (dayCode.length >= 2 && isDigit(rest[0]) && /^\d{1,2}:?\d{2}/.test(restMapped)) break;
    const ch = cleaned[pos];
    const l = mapToLetter(ch);
    if (isLetter(l)) {
      dayCode += l;
      if (l !== ch) daySubs++;
      pos++;
    } else {
      break;
    }
  }
  if (daySubs > 0) inferred.push('dayCode');

  // Extract time: try the raw remainder first (junk char = misread colon),
  // then fall back to the confusion-mapped remainder
  const rawRemainder = cleaned.slice(pos);
  let time = '';
  let timeMatch = rawRemainder.match(/(\d{1,2})[^0-9]?(\d{2})/);
  if (!timeMatch) {
    const mappedRemainder = rawRemainder.split('').map(c => (c === ':' ? ':' : mapToDigit(c))).join('');
    timeMatch = mappedRemainder.match(/(\d{1,2}):?(\d{2})/);
  }
  if (timeMatch) {
    time = `${timeMatch[1]}:${timeMatch[2]}`;
    if (!rawRemainder.startsWith(`${timeMatch[1]}:${timeMatch[2]}`)) inferred.push('time');
  }

  const haveAll = month && date.length === 4 && dayCode.length >= 2;
  const confidence = haveAll
    ? (inferred.length === 0 ? 'high' : 'medium')
    : 'partial';

  return {
    raw: cleaned,
    prefix: 'BB',
    month,
    monthFull: MONTHS[month],
    date,
    dayCode,
    dayCodeFull: dayCode,
    time,
    confidence,
    inferred,
  };
}

// Score a parse result so multi-pass OCR can pick the best attempt
export function scoreParse(parsed) {
  if (!parsed) return -1;
  let score = 0;
  if (parsed.month) score += 4;
  if (parsed.date?.length === 4) score += 4;
  else if (parsed.date?.length >= 2) score += 1;
  if (parsed.dayCode?.length >= 2) score += 2;
  if (parsed.time) score += 1;
  score -= (parsed.inferred?.length || 0) * 0.4;
  return score;
}

export function formatDateCodeSummary(parsed) {
  if (!parsed || parsed.confidence === 'none') return 'Could not parse date code';
  const parts = [];
  parts.push(`${parsed.prefix} ${parsed.monthFull || parsed.month}`);
  if (parsed.date) parts.push(`Date: ${parsed.date}`);
  if (parsed.dayCode) parts.push(`Day: ${parsed.dayCode}`);
  if (parsed.time) parts.push(`Time: ${parsed.time}`);
  return parts.join(' | ');
}

// ── Image preprocessing variants for multi-pass OCR ─────────────────
// Dot-matrix ink on reflective aluminum needs different treatments
// depending on lighting; we try several and keep the best parse.

function cloneToCanvas(source, scale = 1) {
  const c = document.createElement('canvas');
  const w = (source.videoWidth || source.width);
  const h = (source.videoHeight || source.height);
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return c;
}

function grayscale(canvas) {
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const gray = new Float32Array(d.length / 4);
  let sum = 0;
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    gray[j] = g;
    sum += g;
  }
  return { img, gray, mean: sum / gray.length };
}

function applyGray(canvas, img, fn) {
  const d = img.data;
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const v = Math.max(0, Math.min(255, fn(j)));
    d[i] = v; d[i + 1] = v; d[i + 2] = v;
  }
  canvas.getContext('2d').putImageData(img, 0, 0);
  return canvas;
}

// Downscale-then-upscale to blur dot-matrix dots into solid strokes
function dotConnect(canvas, factor = 0.45) {
  const small = document.createElement('canvas');
  small.width = Math.max(1, Math.round(canvas.width * factor));
  small.height = Math.max(1, Math.round(canvas.height * factor));
  const sctx = small.getContext('2d');
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(canvas, 0, 0, small.width, small.height);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(small, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// Returns [{ canvas, label }] preprocessing variants, best-first guess order
export function makeOcrVariants(source) {
  const variants = [];

  // 1. High contrast + invert (light ink visible on dark can bottom)
  {
    const c = cloneToCanvas(source, 2);
    const { img, gray } = grayscale(c);
    applyGray(c, img, j => 255 - (((gray[j] / 255 - 0.5) * 3.0 + 0.5) * 255));
    variants.push({ canvas: c, label: 'contrast-invert' });
  }

  // 2. Dot-connect blur + threshold + invert (joins dot-matrix dots)
  {
    const c = cloneToCanvas(source, 2);
    dotConnect(c);
    const { img, gray, mean } = grayscale(c);
    const t = mean * 1.15;
    applyGray(c, img, j => (gray[j] > t ? 0 : 255));
    variants.push({ canvas: c, label: 'dot-connect-threshold' });
  }

  // 3. High contrast, no invert (dark ink on bright aluminum)
  {
    const c = cloneToCanvas(source, 2);
    const { img, gray } = grayscale(c);
    applyGray(c, img, j => ((gray[j] / 255 - 0.5) * 3.0 + 0.5) * 255);
    variants.push({ canvas: c, label: 'contrast' });
  }

  // 4. Adaptive threshold around the mean, no invert
  {
    const c = cloneToCanvas(source, 2);
    dotConnect(c, 0.55);
    const { img, gray, mean } = grayscale(c);
    const t = mean * 0.85;
    applyGray(c, img, j => (gray[j] < t ? 0 : 255));
    variants.push({ canvas: c, label: 'adaptive-threshold' });
  }

  return variants;
}

// Rotate a canvas by 90/180/270 degrees (returns a new canvas).
// Needed because operators hold the can at any angle.
export function rotateCanvas(source, deg) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  if (deg === 180) {
    c.width = source.width;
    c.height = source.height;
    ctx.translate(c.width, c.height);
    ctx.rotate(Math.PI);
  } else {
    c.width = source.height;
    c.height = source.width;
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((deg * Math.PI) / 180);
    ctx.translate(-source.width / 2, -source.height / 2);
    ctx.drawImage(source, 0, 0);
    return c;
  }
  ctx.drawImage(source, 0, 0);
  return c;
}

// Backwards-compatible single enhancement (used for the preview thumbnail)
export function enhanceCanBottomImage(canvas) {
  const { img, gray } = grayscale(canvas);
  applyGray(canvas, img, j => 255 - (((gray[j] / 255 - 0.5) * 3.0 + 0.5) * 255));
  return canvas;
}
