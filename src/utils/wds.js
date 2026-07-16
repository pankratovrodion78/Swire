// Weekly Direction Setting (WDS) — data model & config
//
// The WDS ("Weekly DS") is the P&G IWS forum where the Line Structure Team steps
// back from daily tactical execution to assess the health of the key RTT systems
// (the 8 DMS systems below) and the line's reliability results, then builds actions
// to close system gaps. This module is the single source of truth that drives the
// data-entry forms, the scorecard, and the run charts.
//
// Data is bucketed by WEEK. The date on a run chart is the *production start date*
// of the week the data is for (weeks start Monday). Ex: data from 6/1 - 6/7 is
// logged in the 6/1 bucket.

const STORAGE_KEY = 'swire_wds_data';

// goal: how to color a value against its target
//   'high'   -> higher is better (green when value >= target)
//   'low'    -> lower is better  (green when value <= target)
//   'target' -> on-target band is best (green when within tolerance of target)
//   null     -> informational, no pass/fail coloring

// ---------------------------------------------------------------------------
// Reliability Results (line-level output measures reviewed at the top of the WDS)
// ---------------------------------------------------------------------------
export const RELIABILITY = {
  id: 'reliability',
  name: 'Reliability Results',
  abbrev: 'RTT',
  color: '#c8102e',
  owner: 'Line Manager',
  measures: [
    { key: 'prPct', label: 'Weekly PR % (Tactical)', section: 'output', unit: '%', target: 95, goal: 'high', min: 0, max: 100 },
    { key: 'mePct', label: 'Weekly ME %', section: 'output', unit: '%', target: 80, goal: 'high', min: 0, max: 100 },
    { key: 'updtPct', label: 'Weekly UPDT Loss %', section: 'output', unit: '%', target: 12, goal: 'low', min: 0, max: 100 },
    { key: 'pdtPct', label: 'Weekly PDT Loss %', section: 'output', unit: '%', target: 8, goal: 'low', min: 0, max: 100 },
    { key: 'scheduleAdherencePct', label: 'Schedule Adherence %', section: 'output', unit: '%', target: 100, goal: 'target', tolerance: 5, min: 0, max: 150 },
  ],
  healthCheck: false,
};

// ---------------------------------------------------------------------------
// The 8 DMS systems (RTT systems)
// ---------------------------------------------------------------------------
export const SYSTEMS = [
  {
    id: 'CL',
    name: 'Centerline',
    abbrev: 'CL',
    color: '#1565c0',
    owner: 'Process Specialist',
    measures: [
      { key: 'mtbf', label: 'MTBF (mins)', desc: 'Mean Time Between Failures — sum uptime / sum # stops', section: 'output', unit: 'min', target: 20, goal: 'high', min: 0 },
      { key: 'clCompletion', label: 'CL % Completion', desc: '# CL done / # CL required (daily avg)', section: 'inprocess', unit: '%', target: 85, goal: 'high', min: 0, max: 100 },
      { key: 'outOfLimits', label: '# Out of Limits (OOL)', desc: 'Sum OOL reports for week', section: 'inprocess', unit: '', goal: null, min: 0 },
    ],
    healthCheck: true,
  },
  {
    id: 'CIL',
    name: 'Clean, Inspect, Lubricate',
    abbrev: 'CIL',
    color: '#00838f',
    owner: 'Line Manager',
    measures: [
      { key: 'stopsPerDay', label: 'Stops / Day', desc: 'Sum filler stops / (schedule time / 1440) — weekly avg', section: 'output', unit: '', target: 100, goal: 'low', min: 0 },
      { key: 'cilCompletion', label: 'CIL % Completion', desc: '# tasks done / # tasks required (daily avg)', section: 'inprocess', unit: '%', target: 85, goal: 'high', min: 0, max: 100 },
      { key: 'timeToFirstStop', label: 'Time to First Stop (min)', desc: 'Planned stop — daily avg of TT1S across shifts', section: 'inprocess', unit: 'min', goal: 'high', min: 0 },
    ],
    healthCheck: true,
  },
  {
    id: 'DH',
    name: 'Defect Handling',
    abbrev: 'DH',
    color: '#6a1b9a',
    owner: 'Control Specialist',
    measures: [
      { key: 'equipmentBreakdowns', label: '# Equipment Breakdowns', desc: 'Sum breakdowns for week', section: 'output', unit: '', target: 0, goal: 'low', min: 0 },
      { key: 'defectsFound', label: '# Defects Found', desc: 'Sum defects found for week', section: 'inprocess', unit: '', goal: 'high', min: 0 },
      { key: 'defectsFixed', label: '# Defects Fixed', desc: 'Sum defects fixed for week', section: 'inprocess', unit: '', goal: 'high', min: 0 },
    ],
    healthCheck: true,
  },
  {
    id: 'IE',
    name: 'Incident Elimination',
    abbrev: 'IE',
    color: '#2e7d32',
    owner: 'Line Manager',
    measures: [
      { key: 'hseIncidents', label: '# HSE Incidents', desc: 'Sum HSE incidents for week', section: 'output', unit: '', target: 0, goal: 'low', min: 0 },
      { key: 'hseNearMiss', label: '# HSE Near Miss', desc: 'Sum HSE near misses for week', section: 'inprocess', unit: '', goal: null, min: 0 },
      { key: 'hseBehaviorObs', label: '# HSE Behavior Observations', desc: 'Sum HSE BOS for week', section: 'inprocess', unit: '', goal: 'high', min: 0 },
    ],
    healthCheck: true,
  },
  {
    id: 'BDE',
    name: 'Breakdown Elimination',
    abbrev: 'BDE',
    color: '#ad1457',
    owner: 'Maintenance Specialist',
    measures: [
      { key: 'repeatBreakdowns', label: '# Repeat Breakdowns', desc: 'Repeat BDE in last 90 days (week total)', section: 'output', unit: '', target: 0, goal: 'low', min: 0 },
      { key: 'idaCompleted', label: '% IDA Completed', desc: 'In-Depth Analysis — # closed / # open', section: 'inprocess', unit: '%', target: 100, goal: 'high', min: 0, max: 100 },
    ],
    healthCheck: true,
  },
  {
    id: 'FPQ',
    name: 'Finished Product Quality',
    abbrev: 'FPQ',
    color: '#ef6c00',
    owner: 'Line Manager',
    measures: [
      { key: 'qualityHolds', label: '# Quality Holds', desc: 'Number of quality holds (week total)', section: 'output', unit: '', target: 0, goal: 'low', min: 0 },
      { key: 'qualityAlerts', label: '# Quality Alerts', desc: 'Number of quality alerts (week total)', section: 'inprocess', unit: '', goal: 'low', min: 0 },
    ],
    healthCheck: true,
  },
  {
    id: 'CO',
    name: 'Changeover',
    abbrev: 'CO',
    color: '#5d4037',
    owner: 'Process Specialist',
    measures: [
      { key: 'coTimeVariance', label: 'CO Time Variance (min)', desc: 'abs(CO time − CO standard) — weekly avg', section: 'output', unit: 'min', target: 0, goal: 'low', min: 0 },
      { key: 'coTimeToFirstStop', label: 'Time to First Stop (min)', desc: 'After changeover start-up — weekly avg', section: 'inprocess', unit: 'min', goal: 'high', min: 0 },
    ],
    healthCheck: true,
  },
  {
    id: 'MPS',
    name: 'Maintenance Planning & Scheduling',
    abbrev: 'MP&S',
    color: '#37474f',
    owner: 'Maintenance Specialist',
    measures: [
      { key: 'plannedMaintenance', label: '# Planned Maintenance', desc: 'Number of planned PMs (week total)', section: 'output', unit: '', goal: null, min: 0 },
      { key: 'pmExecuted', label: "% PM's Executed", desc: 'ZP01 executed / planned (week total)', section: 'inprocess', unit: '%', target: 100, goal: 'high', min: 0, max: 100 },
      { key: 'pmsCreatedModified', label: "# PM's Created / Modified", desc: 'Target: 1 PM modified / week', section: 'inprocess', unit: '', target: 1, goal: 'high', min: 0 },
    ],
    healthCheck: true,
  },
];

// Flat list of every group (reliability first, then the 8 systems)
export const ALL_GROUPS = [RELIABILITY, ...SYSTEMS];

// Flat list of every measure with its owning group attached (handy for charts/scorecard)
export const ALL_MEASURES = ALL_GROUPS.flatMap((g) =>
  g.measures.map((m) => ({ ...m, groupId: g.id, groupName: g.name, groupColor: g.color }))
);

export function getMeasure(key) {
  return ALL_MEASURES.find((m) => m.key === key) || null;
}

// ---------------------------------------------------------------------------
// Week helpers (weeks start Monday, keyed by ISO date string YYYY-MM-DD)
// ---------------------------------------------------------------------------
export function mondayOf(dateInput) {
  const d = new Date(dateInput);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day; // shift back to Monday
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function currentWeekKey() {
  return mondayOf(new Date());
}

export function addWeeks(weekKey, n) {
  const d = new Date(weekKey);
  d.setDate(d.getDate() + n * 7);
  return d.toISOString().slice(0, 10);
}

export function formatWeek(weekKey) {
  const d = new Date(weekKey);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatWeekLong(weekKey) {
  const start = new Date(weekKey);
  const end = new Date(weekKey);
  end.setDate(end.getDate() + 6);
  const opts = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, { ...opts, year: 'numeric' })}`;
}

// ---------------------------------------------------------------------------
// Pass / fail evaluation against target
// ---------------------------------------------------------------------------
// Returns 'good' | 'bad' | 'warn' | 'none'
export function evalStatus(measure, value) {
  if (value === '' || value === null || value === undefined || Number.isNaN(Number(value))) return 'none';
  if (!measure.goal || measure.target === undefined) return 'none';
  const v = Number(value);
  const t = measure.target;
  if (measure.goal === 'high') {
    if (v >= t) return 'good';
    if (v >= t * 0.9) return 'warn';
    return 'bad';
  }
  if (measure.goal === 'low') {
    if (v <= t) return 'good';
    if (v <= t * 1.15 + 0.5) return 'warn';
    return 'bad';
  }
  if (measure.goal === 'target') {
    const tol = measure.tolerance ?? 5;
    if (Math.abs(v - t) <= tol) return 'good';
    if (Math.abs(v - t) <= tol * 2) return 'warn';
    return 'bad';
  }
  return 'none';
}

export const STATUS_COLORS = {
  good: '#2e7d32',
  warn: '#e65100',
  bad: '#c8102e',
  none: '#9e9e9e',
};

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------
// Shape:
// {
//   line: 'L3',
//   weeks: {
//     '2026-01-05': {
//       metrics: { mtbf: 18, clCompletion: 92, ... },
//       health:  { CL: 80, CIL: 75, ... },     // health-check score % per system
//       actions: [ { id, system, text, owner, status, priority } ],
//       notes: 'string'
//     }
//   }
// }
export function loadWDS() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { line: 'L3', weeks: {} };
    const data = JSON.parse(raw);
    if (!data.weeks) data.weeks = {};
    return data;
  } catch {
    return { line: 'L3', weeks: {} };
  }
}

export function saveWDS(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function emptyWeek() {
  return { metrics: {}, health: {}, actions: [], notes: '' };
}

export function getWeek(data, weekKey) {
  return data.weeks[weekKey] || emptyWeek();
}

// Sorted list of week keys that have any data
export function weekKeys(data) {
  return Object.keys(data.weeks).sort();
}

// Build a series [{ week, value }] for a measure across all weeks (sorted)
export function seriesFor(data, measureKey) {
  return weekKeys(data).map((wk) => ({
    week: wk,
    value: data.weeks[wk]?.metrics?.[measureKey],
  }));
}

export function newActionId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
