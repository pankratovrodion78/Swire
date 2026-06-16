// Date code parsing for Swire can bottom ink-jet codes.
// Exact format (per plant spec): BB MAR0827 SCD 12:01 1
//   BB    — "Best By" prefix, always BB
//   MAR   — expiration month
//   08    — expiration day (01-31)
//   27    — expiration year (26/27/28 only — current year + 2)
//   SC    — Denver plant code, always SC
//   D     — production day of week: A=Mon B=Tue C=Wed D=Thu E=Fri F=Sat G=Sun
//   12:01 — production time (hour 0-24, colon always printed, minutes 00-59)
//   1     — production line: 1 or 3 only

export const MONTH_LIST = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const MONTHS = {
  JAN: 'January', FEB: 'February', MAR: 'March', APR: 'April',
  MAY: 'May', JUN: 'June', JUL: 'July', AUG: 'August',
  SEP: 'September', OCT: 'October', NOV: 'November', DEC: 'December',
};

export const WEEKDAY_CODES = {
  A: 'Monday', B: 'Tuesday', C: 'Wednesday', D: 'Thursday',
  E: 'Friday', F: 'Saturday', G: 'Sunday',
};

export const VALID_YEARS = ['26', '27', '28'];
export const VALID_LINES = ['1', '3'];

// OCR confusion maps — dot-matrix ink misreads
const TO_LETTER = { '0': 'O', '1': 'I', '2': 'Z', '3': 'E', '4': 'A', '5': 'S', '6': 'G', '7': 'T', '8': 'B', '9': 'G' };
const TO_DIGIT = { O: '0', Q: '0', D: '0', C: '0', I: '1', L: '1', J: '1', Z: '2', E: '3', A: '4', S: '5', G: '6', B: '8', R: '8' };
// Weekday slot confusions (digit/letter shapes that resolve to A-G)
const TO_WEEKDAY = { '4': 'A', '8': 'B', '0': 'D', O: 'D', '6': 'G', '3': 'E', '9': 'G' };

function mapToLetter(ch) { return TO_LETTER[ch] || ch; }
function mapToDigit(ch) { return TO_DIGIT[ch] || ch; }
function isDigit(ch) { return ch >= '0' && ch <= '9'; }

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

// Parse OCR text into structured date code fields using the known format,
// validating each field against its legal range and "filling in the blanks"
// for misread characters. Flags every inferred field for operator approval.
export function parseDateCode(raw) {
  const empty = { raw: '', confidence: 'none', inferred: [], warnings: [] };
  if (!raw) return empty;
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9:]/g, '');
  if (!cleaned) return empty;

  const inferred = [];
  const warnings = [];

  // ── Month: fuzzy scan anywhere in the string ──
  let monthHit = null;
  for (let i = 0; i + 3 <= cleaned.length; i++) {
    const hit = fuzzyMonth(cleaned.slice(i, i + 3));
    if (hit && (!monthHit || hit.subs < monthHit.subs)) {
      monthHit = { ...hit, index: i };
      if (hit.subs === 0) break;
    }
  }
  if (!monthHit) return { ...empty, raw: cleaned };
  if (monthHit.subs > 0) inferred.push('month');
  const month = monthHit.month;
  let pos = monthHit.index + 3;

  // ── Expiration: 2-digit day (01-31) + 2-digit year (26-28) ──
  let digits = '';
  let digitSubs = 0;
  while (pos < cleaned.length && digits.length < 4) {
    const ch = cleaned[pos];
    if (ch === ':') { pos++; continue; }
    const d = mapToDigit(ch);
    if (!isDigit(d)) break;
    digits += d;
    if (d !== ch) digitSubs++;
    pos++;
  }
  if (digitSubs > 2) digits = ''; // mostly-guessed digits = garbage

  let expDay = '';
  let expYear = '';
  if (digits.length >= 2) {
    expDay = digits.slice(0, 2);
    const dayN = parseInt(expDay, 10);
    if (dayN < 1 || dayN > 31) warnings.push(`Exp day "${expDay}" is outside 01-31`);
  }
  if (digits.length === 4) {
    expYear = digits.slice(2, 4);
    if (!VALID_YEARS.includes(expYear)) {
      // First digit misread but decade digit valid → snap to 2X
      if (['6', '7', '8'].includes(expYear[1])) {
        expYear = '2' + expYear[1];
        inferred.push('expYear');
      } else {
        warnings.push(`Exp year "${expYear}" should be 26, 27, or 28`);
      }
    }
  }
  if (digitSubs > 0 && (expDay || expYear)) inferred.push('expDate');

  // ── Plant anchor "SC" + production weekday letter (A-G) ──
  let plantFound = false;
  let prodDay = '';
  for (let i = pos; i + 2 <= cleaned.length; i++) {
    const c1 = cleaned[i];
    const c2 = cleaned[i + 1];
    const sScore = c1 === 'S' ? 1 : (mapToLetter(c1) === 'S' ? 0.5 : 0);
    const cScore = c2 === 'C' ? 1 : (['G', 'O', '0', 'Q', 'U', 'E'].includes(c2) ? 0.5 : 0);
    if (sScore + cScore >= 1.5) {
      plantFound = true;
      if (sScore + cScore < 2) inferred.push('plant');
      const wd = cleaned[i + 2] || '';
      if (WEEKDAY_CODES[wd]) {
        prodDay = wd;
      } else if (TO_WEEKDAY[wd]) {
        prodDay = TO_WEEKDAY[wd];
        inferred.push('prodDay');
      }
      pos = i + 3;
      break;
    }
  }
  if (!plantFound) warnings.push('Plant code "SC" not found');

  // ── Time: HH:MM with hour ≤ 24 and minutes ≤ 59 ──
  const rem = cleaned.slice(pos);
  let time = '';
  let timeEnd = -1;
  let match = null;
  let timeInferred = false;
  for (const m of rem.matchAll(/(\d{1,2}):(\d{2})/g)) {
    if (+m[1] <= 24 && +m[2] <= 59) { match = m; break; }
  }
  if (!match) {
    for (const m of rem.matchAll(/(\d{1,2})[^0-9:](\d{2})/g)) {
      if (+m[1] <= 24 && +m[2] <= 59) { match = m; timeInferred = true; break; }
    }
  }
  if (!match) {
    const mappedRem = rem.split('').map(c => (c === ':' ? ':' : mapToDigit(c))).join('');
    for (const m of mappedRem.matchAll(/(\d{1,2}):?(\d{2})/g)) {
      if (+m[1] <= 24 && +m[2] <= 59) { match = m; timeInferred = true; break; }
    }
  }
  if (match) {
    time = `${match[1]}:${match[2]}`;
    timeEnd = match.index + match[0].length;
    if (timeInferred) inferred.push('time');
  }

  // ── Production line: 1 or 3 only ──
  let line = '';
  if (timeEnd >= 0) {
    const after = rem.slice(timeEnd);
    for (const ch of after) {
      const d = ({ I: '1', L: '1', J: '1', E: '3' })[ch] || ch;
      if (VALID_LINES.includes(d)) {
        line = d;
        if (d !== ch) inferred.push('line');
        break;
      }
    }
  }

  const core = month && expDay && expYear;
  const full = core && prodDay && time;
  let confidence;
  if (full) confidence = (inferred.length || warnings.length) ? 'medium' : 'high';
  else if (core) confidence = 'partial';
  else if (expDay) confidence = 'partial';
  else confidence = 'none';

  return {
    raw: cleaned,
    prefix: 'BB',
    month,
    monthFull: MONTHS[month],
    expDay,
    expYear,
    expYearFull: expYear ? '20' + expYear : '',
    plant: 'SC',
    prodDay,
    prodDayName: WEEKDAY_CODES[prodDay] || '',
    time,
    line,
    confidence,
    inferred,
    warnings,
  };
}

// Score a parse result so multi-pass OCR can pick the best attempt
export function scoreParse(parsed) {
  if (!parsed) return -1;
  let score = 0;
  if (parsed.month) score += 3;
  if (parsed.expDay) score += 2;
  if (parsed.expYear) score += 2;
  if (parsed.prodDay) score += 2;
  if (parsed.time) score += 1;
  if (parsed.line) score += 0.5;
  score -= (parsed.inferred?.length || 0) * 0.4;
  score -= (parsed.warnings?.length || 0) * 0.5;
  return score;
}

export function formatDateCodeSummary(parsed) {
  if (!parsed || parsed.confidence === 'none') return 'Could not parse date code';
  const parts = [];
  if (parsed.month && parsed.expDay) {
    parts.push(`Best By: ${parsed.monthFull || parsed.month} ${parsed.expDay}${parsed.expYearFull ? ', ' + parsed.expYearFull : ''}`);
  } else if (parsed.month) {
    parts.push(`Best By: ${parsed.monthFull || parsed.month}`);
  }
  if (parsed.prodDayName) parts.push(`Produced: ${parsed.prodDayName}${parsed.time ? ' @ ' + parsed.time : ''}`);
  else if (parsed.time) parts.push(`Time: ${parsed.time}`);
  if (parsed.line) parts.push(`Line ${parsed.line}`);
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
