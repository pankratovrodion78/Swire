import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getReport, saveReport } from '../utils/storage';
import { downloadPDF } from '../utils/pdf';

export default function Review() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);

  useEffect(() => {
    const r = getReport(id);
    if (!r) return navigate('/');
    setReport(r);
  }, [id, navigate]);

  if (!report) return null;

  const issues = [];
  if (!report.operator) issues.push('Operator name is missing');
  if (!report.shift) issues.push('Shift not selected');
  if (report.upcTests.length === 0) issues.push('No UPC tests completed');
  if (report.upcTests.some(t => !t.result)) issues.push('Some UPC tests have no Pass/Fail result');
  if (report.inspections.length === 0) issues.push('No 30-min inspections recorded');
  report.inspections.forEach((ins, i) => {
    if (!ins.primaryCode) issues.push(`Inspection #${i + 1}: missing primary barcode`);
    if (!ins.canPhoto) issues.push(`Inspection #${i + 1}: missing can photo`);
    if (!ins.casePhoto) issues.push(`Inspection #${i + 1}: missing case photo`);
  });

  function finalizeAndDownload() {
    const updated = { ...report, status: 'completed' };
    saveReport(updated);
    setReport(updated);
    downloadPDF(updated);
  }

  function saveDraft() {
    downloadPDF(report);
  }

  return (
    <div className="page review-page">
      <div className="step-indicator">
        <span className="step done">1. Shift Info</span>
        <span className="step done">2. UPC Test</span>
        <span className="step done">3. Inspections</span>
        <span className="step active">4. Review</span>
      </div>

      <div className="card">
        <h2>Review Shift Report</h2>

        {issues.length > 0 && (
          <div className="alert alert-warning">
            <strong>Issues Found:</strong>
            <ul>
              {issues.map((issue, i) => <li key={i}>{issue}</li>)}
            </ul>
          </div>
        )}

        <div className="review-section">
          <h3>Shift Info</h3>
          <div className="review-grid">
            <div><strong>Date:</strong> {report.date}</div>
            <div><strong>Operator:</strong> {report.operator}</div>
            <div><strong>Shift:</strong> {report.shift}</div>
            <div><strong>Line:</strong> {report.line || '—'}</div>
          </div>
        </div>

        <div className="review-section">
          <h3>UPC Bar Code Tests ({report.upcTests.length})</h3>
          {report.upcTests.length > 0 ? (
            <table className="review-table">
              <thead>
                <tr><th>Time</th><th>Flavor</th><th>Pkg</th><th>Result</th><th>Init.</th></tr>
              </thead>
              <tbody>
                {report.upcTests.map((t, i) => (
                  <tr key={i}>
                    <td>{t.time}</td>
                    <td>{t.flavor || '—'}</td>
                    <td>{t.pkg || '—'}</td>
                    <td><span className={`badge ${t.result === 'Pass' ? 'badge-success' : t.result === 'Fail' ? 'badge-danger' : ''}`}>{t.result || '—'}</span></td>
                    <td>{t.initials || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-muted">No tests recorded</p>}
        </div>

        <div className="review-section">
          <h3>Scanner Performance</h3>
          <div className="review-grid perf-grid">
            {report.scannerPerformance.map((sp, i) => (
              <div key={i}><strong>{sp.pkg}:</strong> {sp.goodReads || '—'} good reads</div>
            ))}
          </div>
        </div>

        <div className="review-section">
          <h3>30-Min Inspections ({report.inspections.length})</h3>
          {report.inspections.length > 0 ? (
            <table className="review-table">
              <thead>
                <tr><th>Time</th><th>Primary</th><th>Secondary</th><th>Condition</th><th>Photos</th></tr>
              </thead>
              <tbody>
                {report.inspections.map((ins, i) => (
                  <tr key={i}>
                    <td>{ins.time}</td>
                    <td className="code-cell">{ins.primaryCode || '—'}</td>
                    <td className="code-cell">{ins.secondaryCode || '—'}</td>
                    <td>{ins.packageCondition || '—'}</td>
                    <td>
                      {ins.canPhoto ? '✓ Can' : '✗ Can'}{' '}
                      {ins.casePhoto ? '✓ Case' : '✗ Case'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-muted">No inspections recorded</p>}
        </div>

        <div className="form-group">
          <label className="field-label">Additional Notes</label>
          <textarea
            className="input textarea"
            placeholder="Any additional notes for this shift report..."
            value={report.notes || ''}
            onChange={e => {
              const updated = { ...report, notes: e.target.value };
              setReport(updated);
              saveReport(updated);
            }}
          />
        </div>
      </div>

      <div className="page-actions">
        <button className="btn btn-outline" onClick={() => navigate(`/report/${id}/inspect`)}>
          ← Back
        </button>
        <button className="btn btn-outline" onClick={saveDraft}>
          Save Draft PDF
        </button>
        <button className="btn btn-primary btn-lg" onClick={finalizeAndDownload}>
          Complete & Download PDF
        </button>
      </div>
    </div>
  );
}
