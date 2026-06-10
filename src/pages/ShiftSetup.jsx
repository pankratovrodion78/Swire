import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getReport, saveReport } from '../utils/storage';

const SHIFTS = ['1st Shift (6AM–2PM)', '2nd Shift (2PM–10PM)', '3rd Shift (10PM–6AM)'];

export default function ShiftSetup() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);

  useEffect(() => {
    const r = getReport(id);
    if (!r) return navigate('/');
    setReport(r);
  }, [id, navigate]);

  if (!report) return null;

  function update(field, value) {
    const updated = { ...report, [field]: value };
    setReport(updated);
    saveReport(updated);
  }

  function canProceed() {
    return report.operator.trim() && report.shift && report.date;
  }

  return (
    <div className="page setup-page">
      <div className="step-indicator">
        <span className="step active">1. Shift Info</span>
        <span className="step">2. UPC Test</span>
        <span className="step">3. Inspections</span>
        <span className="step">4. Review</span>
      </div>

      <div className="card">
        <h2>Shift Information</h2>
        <p className="card-desc">Fill out shift details before starting inspections.</p>

        <div className="form-group">
          <label className="field-label required">Date</label>
          <input
            type="date"
            className="input"
            value={report.date}
            onChange={e => update('date', e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="field-label required">Operator Name</label>
          <input
            type="text"
            className="input"
            placeholder="Enter your name"
            value={report.operator}
            onChange={e => update('operator', e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="field-label required">Shift</label>
          <div className="shift-buttons">
            {SHIFTS.map(s => (
              <button
                key={s}
                className={`btn btn-shift ${report.shift === s ? 'selected' : ''}`}
                onClick={() => update('shift', s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label className="field-label">Line</label>
          <input
            type="text"
            className="input"
            placeholder="e.g. Line 1"
            value={report.line || ''}
            onChange={e => update('line', e.target.value)}
          />
        </div>
      </div>

      <div className="page-actions">
        <button className="btn btn-outline" onClick={() => navigate('/')}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          disabled={!canProceed()}
          onClick={() => navigate(`/report/${id}/upc`)}
        >
          Next: UPC Bar Code Test →
        </button>
      </div>
    </div>
  );
}
