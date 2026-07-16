import { useState, useMemo, useId } from 'react';
import { evalStatus, STATUS_COLORS, formatWeek } from '../utils/wds';

// Interactive SVG run chart for a single measure across weeks.
// props:
//   measure   - measure config { key, label, unit, target, goal, ... }
//   series    - [{ week, value }] (values may be '' / undefined)
//   color     - line color
export default function RunChart({ measure, series, color = '#1565c0' }) {
  const [hover, setHover] = useState(null); // index of hovered point
  const uid = useId().replace(/[:]/g, '');

  // Layout (SVG user units; CSS scales width to 100%)
  const W = 680;
  const H = 260;
  const M = { top: 22, right: 18, bottom: 40, left: 46 };
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;

  const points = useMemo(() => {
    return series.map((s) => ({
      week: s.week,
      value: s.value === '' || s.value === null || s.value === undefined ? null : Number(s.value),
    }));
  }, [series]);

  const numeric = points.map((p) => p.value).filter((v) => v !== null && !Number.isNaN(v));
  const hasData = numeric.length > 0;

  // Y domain — include target and 0 sensibly
  const candidates = [...numeric];
  if (measure.target !== undefined && measure.target !== null) candidates.push(measure.target);
  let yMin = candidates.length ? Math.min(...candidates) : 0;
  let yMax = candidates.length ? Math.max(...candidates) : 1;
  if (measure.min !== undefined) yMin = Math.min(yMin, measure.min);
  if (measure.unit === '%') {
    yMin = Math.min(yMin, 0);
    yMax = Math.max(yMax, measure.max ?? 100);
  }
  if (yMin === yMax) { yMax = yMin + 1; }
  // pad
  const pad = (yMax - yMin) * 0.12 || 1;
  yMax += pad;
  yMin = Math.max(measure.min ?? -Infinity, yMin - pad);
  if (measure.min !== undefined && yMin < measure.min) yMin = measure.min;

  const n = points.length;
  const x = (i) => M.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v) => M.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  // Y ticks (5)
  const yTicks = useMemo(() => {
    const t = [];
    for (let i = 0; i <= 4; i++) t.push(yMin + ((yMax - yMin) * i) / 4);
    return t;
  }, [yMin, yMax]);

  // Build path over the points that have values (skip gaps but connect across)
  const linePts = points.map((p, i) => (p.value === null ? null : { i, x: x(i), y: y(p.value) })).filter(Boolean);
  const linePath = linePts.map((p, k) => `${k === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const targetY = measure.target !== undefined && measure.target !== null ? y(measure.target) : null;

  const fmt = (v) => {
    if (v === null || v === undefined) return '—';
    const r = Math.round(v * 10) / 10;
    return `${Number.isInteger(r) ? r : r.toFixed(1)}${measure.unit === '%' ? '%' : ''}`;
  };

  return (
    <div className="runchart">
      <svg viewBox={`0 0 ${W} ${H}`} className="runchart-svg" role="img"
        aria-label={`Run chart for ${measure.label}`}>
        <defs>
          <linearGradient id={`fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* grid + y labels */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)}
              stroke="#e6e6e6" strokeWidth="1" />
            <text x={M.left - 8} y={y(t) + 4} textAnchor="end" className="rc-axis">
              {Math.round(t * 10) / 10}
            </text>
          </g>
        ))}

        {/* target line */}
        {targetY !== null && (
          <g>
            <line x1={M.left} x2={W - M.right} y1={targetY} y2={targetY}
              stroke="#c8102e" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.8" />
            <text x={W - M.right} y={targetY - 5} textAnchor="end" className="rc-target">
              Target {fmt(measure.target)}
            </text>
          </g>
        )}

        {/* area fill under line */}
        {hasData && linePts.length > 1 && (
          <path
            d={`${linePath} L${linePts[linePts.length - 1].x.toFixed(1)},${(M.top + plotH).toFixed(1)} L${linePts[0].x.toFixed(1)},${(M.top + plotH).toFixed(1)} Z`}
            fill={`url(#fill-${uid})`} stroke="none" />
        )}

        {/* line */}
        {hasData && <path d={linePath} fill="none" stroke={color} strokeWidth="2.5"
          strokeLinejoin="round" strokeLinecap="round" />}

        {/* x labels + points + hover targets */}
        {points.map((p, i) => {
          const showLabel = n <= 8 || i % Math.ceil(n / 8) === 0 || i === n - 1;
          return (
            <g key={i}>
              {showLabel && (
                <text x={x(i)} y={H - M.bottom + 18} textAnchor="middle" className="rc-axis">
                  {formatWeek(p.week)}
                </text>
              )}
              {p.value !== null && (
                <circle cx={x(i)} cy={y(p.value)} r={hover === i ? 6 : 4}
                  fill={STATUS_COLORS[evalStatus(measure, p.value)] || color}
                  stroke="#fff" strokeWidth="2" />
              )}
              {/* invisible hover zone */}
              <rect x={x(i) - (n > 1 ? plotW / (n - 1) / 2 : plotW / 2)} y={M.top}
                width={n > 1 ? plotW / (n - 1) : plotW} height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
            </g>
          );
        })}

        {/* tooltip */}
        {hover !== null && points[hover] && points[hover].value !== null && (() => {
          const px = x(hover);
          const py = y(points[hover].value);
          const tw = 108;
          const tx = Math.min(Math.max(px - tw / 2, M.left), W - M.right - tw);
          const ty = py - 46 < M.top ? py + 12 : py - 46;
          return (
            <g pointerEvents="none">
              <line x1={px} x2={px} y1={M.top} y2={M.top + plotH} stroke={color} strokeWidth="1" opacity="0.35" />
              <rect x={tx} y={ty} width={tw} height={38} rx="6" fill="#212121" opacity="0.94" />
              <text x={tx + tw / 2} y={ty + 15} textAnchor="middle" className="rc-tip-week">
                {formatWeek(points[hover].week)}
              </text>
              <text x={tx + tw / 2} y={ty + 31} textAnchor="middle" className="rc-tip-val">
                {fmt(points[hover].value)}
              </text>
            </g>
          );
        })()}
      </svg>
      {!hasData && <div className="runchart-empty">No data entered yet</div>}
    </div>
  );
}
