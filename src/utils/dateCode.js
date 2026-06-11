const MONTHS = {
  JAN: 'January', FEB: 'February', MAR: 'March', APR: 'April',
  MAY: 'May', JUN: 'June', JUL: 'July', AUG: 'August',
  SEP: 'September', OCT: 'October', NOV: 'November', DEC: 'December',
};

const DAY_CODES = {
  SUN: 'Sunday', MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday',
  THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday',
  // Swire production day codes (3-letter abbreviations seen on cans)
  SCD: 'SCD', MCD: 'MCD', TCD: 'TCD', WCD: 'WCD',
  RCD: 'RCD', FCD: 'FCD', ACD: 'ACD',
};

// BB MAR 0827 SCD 12:01
// Segments: prefix(BB) month(MAR) date(0827) dayCode(SCD) time(12:01)
const DATE_CODE_PATTERN =
  /\b(BB|UB)?\s*([A-Z]{3})\s+(\d{4})\s+([A-Z]{2,4})\s+(\d{1,2}:\d{2})\b/i;

// Looser fallback — just find month + 4-digit date
const LOOSE_PATTERN =
  /([A-Z]{3})\s+(\d{4})/i;

export function parseDateCode(raw) {
  if (!raw) return null;
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9:\s]/g, ' ').replace(/\s+/g, ' ').trim();

  const m = cleaned.match(DATE_CODE_PATTERN);
  if (m) {
    return {
      raw: cleaned,
      prefix: m[1] || 'BB',
      month: m[2],
      monthFull: MONTHS[m[2]] || m[2],
      date: m[3],
      dayCode: m[4],
      dayCodeFull: DAY_CODES[m[4]] || m[4],
      time: m[5],
      confidence: 'high',
    };
  }

  const loose = cleaned.match(LOOSE_PATTERN);
  if (loose && MONTHS[loose[1]]) {
    return {
      raw: cleaned,
      prefix: 'BB',
      month: loose[1],
      monthFull: MONTHS[loose[1]],
      date: loose[2],
      dayCode: '',
      dayCodeFull: '',
      time: '',
      confidence: 'partial',
    };
  }

  return { raw: cleaned, confidence: 'none' };
}

export function formatDateCodeSummary(parsed) {
  if (!parsed || parsed.confidence === 'none') return 'Could not parse date code';
  const parts = [];
  parts.push(`${parsed.prefix} ${parsed.monthFull}`);
  parts.push(`Date: ${parsed.date}`);
  if (parsed.dayCode) parts.push(`Day: ${parsed.dayCode}`);
  if (parsed.time) parts.push(`Time: ${parsed.time}`);
  return parts.join(' | ');
}

export function enhanceCanBottomImage(canvas) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    let gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

    // Increase contrast aggressively
    gray = ((gray / 255 - 0.5) * 3.0 + 0.5) * 255;
    gray = Math.max(0, Math.min(255, gray));

    // Invert so dark ink becomes white on black background (better for OCR)
    gray = 255 - gray;

    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}
