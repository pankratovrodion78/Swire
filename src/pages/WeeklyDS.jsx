import { useState, useMemo, useCallback } from 'react';
import RunChart from '../components/RunChart';
import {
  ALL_GROUPS, SYSTEMS,
  loadWDS, saveWDS, getWeek, weekKeys, seriesFor,
  currentWeekKey, mondayOf, addWeeks, formatWeekLong,
  evalStatus, STATUS_COLORS, newActionId,
} from '../utils/wds';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'entry', label: 'Data Entry' },
  { id: 'charts', label: 'Run Charts' },
  { id: 'actions', label: 'Actions' },
];

export default function WeeklyDS() {
  const [data, setData] = useState(loadWDS);
  const [tab, setTab] = useState('overview');

  const existingWeeks = useMemo(() => weekKeys(data), [data]);
  const [week, setWeek] = useState(() => {
    const wk = weekKeys(loadWDS());
    return wk.length ? wk[wk.length - 1] : currentWeekKey();
  });

  // Ensure the selected week is always available in the dropdown
  const weekOptions = useMemo(() => {
    const set = new Set(existingWeeks);
    set.add(week);
    return [...set].sort();
  }, [existingWeeks, week]);

  const persist = useCallback((next) => {
    setData(next);
    saveWDS(next);
  }, []);

  const updateWeek = useCallback((wk, mutator) => {
    setData((prev) => {
      const next = { ...prev, weeks: { ...prev.weeks } };
      const cur = next.weeks[wk] ? JSON.parse(JSON.stringify(next.weeks[wk])) : { metrics: {}, health: {}, actions: [], notes: '' };
      mutator(cur);
      next.weeks[wk] = cur;
      saveWDS(next);
      return next;
    });
  }, []);

  function addWeek(startDate) {
    const wk = mondayOf(startDate);
    if (!data.weeks[wk]) {
      updateWeek(wk, () => {});
    }
    setWeek(wk);
    setTab('entry');
  }

  const cur = getWeek(data, week);
  const prevWeekKey = useMemo(() => {
    const before = existingWeeks.filter((w) => w < week);
    return before.length ? before[before.length - 1] : null;
  }, [existingWeeks, week]);
  const prev = prevWeekKey ? getWeek(data, prevWeekKey) : null;

  return (
    <div className="page wds-page">
      <IntroCard line={data.line} onLineChange={(v) => persist({ ...data, line: v })} />

      <div className="wds-toolbar card">
        <div className="wds-week-picker">
          <label className="wds-lbl">Week of</label>
          <select className="input wds-week-select" value={week} onChange={(e) => setWeek(e.target.value)}>
            {weekOptions.map((w) => (
              <option key={w} value={w}>{formatWeekLong(w)}{existingWeeks.includes(w) ? '' : ' (new)'}</option>
            ))}
          </select>
          <div className="wds-week-nav">
            <button className="btn btn-sm btn-outline" title="Previous week"
              onClick={() => setWeek(addWeeks(week, -1))}>‹</button>
            <button className="btn btn-sm btn-outline" title="Next week"
              onClick={() => setWeek(addWeeks(week, 1))}>›</button>
          </div>
        </div>
        <AddWeek onAdd={addWeek} />
      </div>

      <div className="wds-tabs">
        {TABS.map((t) => (
          <button key={t.id}
            className={`wds-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === 'actions' && cur.actions?.length ? <span className="wds-tab-count">{cur.actions.length}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview week={week} cur={cur} prev={prev} />}
      {tab === 'entry' && <DataEntry week={week} cur={cur} updateWeek={updateWeek} />}
      {tab === 'charts' && <Charts data={data} />}
      {tab === 'actions' && <Actions week={week} cur={cur} updateWeek={updateWeek} />}
    </div>
  );
}

/* ----------------------------- Intro / header ---------------------------- */
function IntroCard({ line, onLineChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card wds-intro">
      <div className="wds-intro-head">
        <div>
          <h2>Weekly Direction Setting</h2>
          <p className="card-desc" style={{ marginBottom: 0 }}>
            Weekly forum where the Line Structure Team steps back from daily execution to
            assess the health of the RTT systems and reliability results, then builds actions to close gaps.
          </p>
        </div>
        <div className="wds-line-box">
          <label className="wds-lbl">Line</label>
          <input className="input input-sm" value={line} onChange={(e) => onLineChange(e.target.value)} />
        </div>
      </div>
      <button className="wds-more" onClick={() => setOpen((o) => !o)}>
        {open ? '− Hide agenda' : '+ What happens in the WDS?'}
      </button>
      {open && (
        <ol className="wds-agenda">
          <li><strong>State of the Line</strong> — macro review of culture, safety, quality & business results (Line Mgr)</li>
          <li><strong>Weekly Loss Tree Review</strong> — micro review of themes & trends (Process Specialist)</li>
          <li><strong>Reliability Results</strong> — PR, ME, UPDT, PDT, Schedule Adherence (Line Mgr)</li>
          <li><strong>DMS System Health Review</strong> — output & in-process measures, health-check score, actions (DMS Owners)</li>
          <li><strong>90-Day Plan Review</strong> — what is due this & next week (Line Mgr)</li>
          <li><strong>Confirmation of Contract</strong> — followed agenda, reviewed results, decided actions, gave recognition</li>
        </ol>
      )}
    </div>
  );
}

function AddWeek({ onAdd }) {
  const [val, setVal] = useState(currentWeekKey());
  return (
    <div className="wds-addweek">
      <input type="date" className="input input-sm" value={val} onChange={(e) => setVal(e.target.value)} />
      <button className="btn btn-sm btn-primary" onClick={() => onAdd(val)}>+ Add / Open Week</button>
    </div>
  );
}

/* -------------------------------- Overview ------------------------------- */
function Overview({ week, cur, prev }) {
  // summary counts across measures with a goal
  const summary = { good: 0, warn: 0, bad: 0, none: 0 };
  ALL_GROUPS.forEach((g) => g.measures.forEach((m) => {
    const v = cur.metrics?.[m.key];
    const s = evalStatus(m, v);
    summary[s] = (summary[s] || 0) + 1;
  }));

  const hasAny = Object.values(cur.metrics || {}).some((v) => v !== '' && v !== null && v !== undefined);

  return (
    <div className="wds-overview">
      <div className="wds-summary">
        <SummaryPill label="On Target" n={summary.good} color={STATUS_COLORS.good} />
        <SummaryPill label="Watch" n={summary.warn} color={STATUS_COLORS.warn} />
        <SummaryPill label="Off Target" n={summary.bad} color={STATUS_COLORS.bad} />
        <SummaryPill label="No Data" n={summary.none} color={STATUS_COLORS.none} />
      </div>

      {!hasAny && (
        <div className="card wds-empty-hint">
          No data for <strong>{formatWeekLong(week)}</strong> yet. Head to the
          {' '}<em>Data Entry</em> tab to fill in this week's numbers.
        </div>
      )}

      {ALL_GROUPS.map((g) => (
        <div key={g.id} className="card wds-group-card">
          <div className="wds-group-head">
            <span className="wds-chip" style={{ background: g.color }}>{g.abbrev}</span>
            <h3>{g.name}</h3>
            {g.healthCheck && (
              <span className="wds-hc" title="Health-check score">
                HC: <strong style={{ color: hcColor(cur.health?.[g.id]) }}>
                  {cur.health?.[g.id] != null && cur.health?.[g.id] !== '' ? `${cur.health[g.id]}%` : '—'}
                </strong>
              </span>
            )}
          </div>
          <div className="wds-tiles">
            {g.measures.map((m) => (
              <Tile key={m.key} measure={m}
                value={cur.metrics?.[m.key]}
                prevValue={prev?.metrics?.[m.key]} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SummaryPill({ label, n, color }) {
  return (
    <div className="wds-sumpill">
      <span className="wds-sumdot" style={{ background: color }} />
      <span className="wds-sumn">{n}</span>
      <span className="wds-sumlbl">{label}</span>
    </div>
  );
}

function Tile({ measure, value, prevValue }) {
  const status = evalStatus(measure, value);
  const has = value !== '' && value !== null && value !== undefined;
  const suffix = measure.unit === '%' ? '%' : '';
  let trend = null;
  if (has && prevValue !== '' && prevValue !== null && prevValue !== undefined) {
    const d = Number(value) - Number(prevValue);
    if (Math.abs(d) > 1e-9) {
      const better = measure.goal === 'low' ? d < 0 : measure.goal === 'high' ? d > 0 : null;
      trend = { d, up: d > 0, better };
    }
  }
  return (
    <div className="wds-tile" style={{ borderLeftColor: STATUS_COLORS[status] }}>
      <div className="wds-tile-label">{measure.label}</div>
      <div className="wds-tile-row">
        <span className="wds-tile-val" style={{ color: has ? STATUS_COLORS[status] : '#bdbdbd' }}>
          {has ? `${round(value)}${suffix}` : '—'}
        </span>
        {trend && (
          <span className={`wds-trend ${trend.better === true ? 'up-good' : trend.better === false ? 'up-bad' : ''}`}>
            {trend.up ? '▲' : '▼'} {Math.abs(round(trend.d))}{suffix}
          </span>
        )}
      </div>
      {measure.target !== undefined && measure.target !== null && (
        <div className="wds-tile-target">Target {measure.goal === 'low' ? '≤' : measure.goal === 'high' ? '≥' : '≈'} {measure.target}{suffix}</div>
      )}
    </div>
  );
}

/* ------------------------------- Data Entry ------------------------------ */
function DataEntry({ week, cur, updateWeek }) {
  const setMetric = (key, val) => updateWeek(week, (w) => { w.metrics[key] = val; });
  const setHealth = (gid, val) => updateWeek(week, (w) => { w.health[gid] = val; });
  const setNotes = (val) => updateWeek(week, (w) => { w.notes = val; });

  return (
    <div className="wds-entry">
      <p className="wds-entry-hint">
        Entering data for <strong>{formatWeekLong(week)}</strong>. Changes save automatically.
        The date is the production start date of the week.
      </p>

      {ALL_GROUPS.map((g) => (
        <div key={g.id} className="card wds-group-card">
          <div className="wds-group-head">
            <span className="wds-chip" style={{ background: g.color }}>{g.abbrev}</span>
            <h3>{g.name}</h3>
            <span className="wds-owner">{g.owner}</span>
          </div>

          <EntrySection title="Output Measures" measures={g.measures.filter((m) => m.section === 'output')}
            metrics={cur.metrics} onChange={setMetric} />
          <EntrySection title="In-Process Measures" measures={g.measures.filter((m) => m.section === 'inprocess')}
            metrics={cur.metrics} onChange={setMetric} />

          {g.healthCheck && (
            <div className="wds-hc-row">
              <label className="wds-lbl">Health Check Score (%)</label>
              <input type="number" min="0" max="100" className="input input-sm"
                value={cur.health?.[g.id] ?? ''} placeholder="0–100"
                onChange={(e) => setHealth(g.id, e.target.value)} />
              <div className="wds-hc-bar">
                <div className="wds-hc-fill" style={{
                  width: `${Math.min(100, Math.max(0, Number(cur.health?.[g.id]) || 0))}%`,
                  background: hcColor(cur.health?.[g.id]),
                }} />
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Weekly Notes / Loss-Tree Themes</h3>
        <textarea className="input wds-notes" rows="4" value={cur.notes || ''}
          placeholder="Top losses, themes, decisions, recognition…"
          onChange={(e) => setNotes(e.target.value)} />
      </div>
    </div>
  );
}

function EntrySection({ title, measures, metrics, onChange }) {
  if (!measures.length) return null;
  return (
    <div className="wds-entry-section">
      <div className="wds-entry-section-title">{title}</div>
      <div className="wds-entry-grid">
        {measures.map((m) => {
          const status = evalStatus(m, metrics?.[m.key]);
          return (
            <div key={m.key} className="wds-field">
              <label className="wds-field-label" title={m.desc}>
                {m.label}
                {m.target !== undefined && m.target !== null && (
                  <span className="wds-field-target"> · tgt {m.goal === 'low' ? '≤' : m.goal === 'high' ? '≥' : '≈'}{m.target}{m.unit === '%' ? '%' : ''}</span>
                )}
              </label>
              <div className="wds-field-input">
                <input type="number" step="any" className="input"
                  value={metrics?.[m.key] ?? ''} placeholder="—"
                  onChange={(e) => onChange(m.key, e.target.value)}
                  style={{ borderColor: status !== 'none' ? STATUS_COLORS[status] : undefined }} />
                {m.unit === '%' && <span className="wds-unit">%</span>}
                {m.unit === 'min' && <span className="wds-unit">min</span>}
              </div>
              {m.desc && <div className="wds-field-desc">{m.desc}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------- Charts --------------------------------- */
function Charts({ data }) {
  const [groupId, setGroupId] = useState('all');
  const weeks = weekKeys(data);
  const groups = groupId === 'all' ? ALL_GROUPS : ALL_GROUPS.filter((g) => g.id === groupId);

  if (weeks.length === 0) {
    return <div className="card wds-empty-hint">No weeks recorded yet. Add a week and enter data to see run charts.</div>;
  }

  return (
    <div className="wds-charts">
      <div className="wds-chart-filter">
        <button className={`wds-fchip ${groupId === 'all' ? 'active' : ''}`} onClick={() => setGroupId('all')}>All</button>
        {ALL_GROUPS.map((g) => (
          <button key={g.id} className={`wds-fchip ${groupId === g.id ? 'active' : ''}`}
            onClick={() => setGroupId(g.id)}
            style={groupId === g.id ? { background: g.color, borderColor: g.color, color: '#fff' } : {}}>
            {g.abbrev}
          </button>
        ))}
      </div>

      {groups.map((g) => (
        <div key={g.id} className="card wds-group-card">
          <div className="wds-group-head">
            <span className="wds-chip" style={{ background: g.color }}>{g.abbrev}</span>
            <h3>{g.name}</h3>
          </div>
          <div className="wds-chart-grid">
            {g.measures.map((m) => (
              <div key={m.key} className="wds-chart-item">
                <div className="wds-chart-title">
                  {m.label}
                  <span className={`wds-sec-badge ${m.section}`}>{m.section === 'output' ? 'Output' : 'In-Process'}</span>
                </div>
                <RunChart measure={m} series={seriesFor(data, m.key)} color={g.color} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------- Actions -------------------------------- */
function Actions({ week, cur, updateWeek }) {
  const actions = cur.actions || [];
  const systemOpts = [{ id: 'RTT', name: 'Reliability' }, ...SYSTEMS.map((s) => ({ id: s.id, name: s.abbrev }))];

  const add = () => updateWeek(week, (w) => {
    w.actions = w.actions || [];
    w.actions.push({ id: newActionId(), system: 'CL', text: '', owner: '', priority: 'ML', status: 'open' });
  });
  const upd = (id, field, val) => updateWeek(week, (w) => {
    const a = (w.actions || []).find((x) => x.id === id);
    if (a) a[field] = val;
  });
  const del = (id) => updateWeek(week, (w) => { w.actions = (w.actions || []).filter((x) => x.id !== id); });

  const open = actions.filter((a) => a.status !== 'done').length;

  return (
    <div className="wds-actions">
      <div className="card">
        <div className="wds-actions-head">
          <div>
            <h3 style={{ margin: 0 }}>Weekly Actions List</h3>
            <p className="card-desc" style={{ margin: '4px 0 0' }}>
              Countermeasures for {formatWeekLong(week)} · {open} open / {actions.length} total
            </p>
          </div>
          <button className="btn btn-sm btn-primary" onClick={add}>+ Add Action</button>
        </div>

        {actions.length === 0 && <p className="wds-muted">No actions yet. Add countermeasures against negative trends.</p>}

        <div className="wds-action-list">
          {actions.map((a) => (
            <div key={a.id} className={`wds-action ${a.status === 'done' ? 'done' : ''}`}>
              <div className="wds-action-top">
                <select className="input input-sm wds-action-sys" value={a.system} onChange={(e) => upd(a.id, 'system', e.target.value)}>
                  {systemOpts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select className="input input-sm wds-action-pri" value={a.priority} onChange={(e) => upd(a.id, 'priority', e.target.value)}
                  title="Priority: PL=Plant, LL=Line, ML=Machine level">
                  <option value="PL">PL · Plant</option>
                  <option value="LL">LL · Line</option>
                  <option value="ML">ML · Machine</option>
                </select>
                <label className="wds-action-check">
                  <input type="checkbox" checked={a.status === 'done'}
                    onChange={(e) => upd(a.id, 'status', e.target.checked ? 'done' : 'open')} />
                  Done
                </label>
                <button className="btn btn-sm btn-danger wds-action-del" onClick={() => del(a.id)}>✕</button>
              </div>
              <input className="input wds-action-text" placeholder="Countermeasure / action…"
                value={a.text} onChange={(e) => upd(a.id, 'text', e.target.value)} />
              <input className="input input-sm wds-action-owner" placeholder="Owner"
                value={a.owner} onChange={(e) => upd(a.id, 'owner', e.target.value)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- helpers -------------------------------- */
function round(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return v;
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? r : r.toFixed(1);
}
function hcColor(v) {
  const n = Number(v);
  if (v == null || v === '' || Number.isNaN(n)) return '#9e9e9e';
  if (n >= 85) return STATUS_COLORS.good;
  if (n >= 70) return STATUS_COLORS.warn;
  return STATUS_COLORS.bad;
}
