import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getReport, saveReport } from '../utils/storage';
import { generatePDF, downloadPDF } from '../utils/pdf';
import { exportReportToExcel } from '../utils/excel';
import { shareToOutlook } from '../utils/share';

export default function Review() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const previewRef = useRef(null);

  useEffect(() => {
    const r = getReport(id);
    if (!r) return navigate('/');
    setReport(r);
  }, [id, navigate]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

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

  function showPreview() {
    try {
      setPreviewError('');
      const doc = generatePDF(report);
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(url);
      setTimeout(() => {
        previewRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err) {
      console.error('Preview failed:', err);
      setPreviewError('Could not generate preview: ' + err.message);
    }
  }

  function finalizeAndDownload() {
    const updated = { ...report, status: 'completed' };
    saveReport(updated);
    setReport(updated);
    downloadPDF(updated);
    navigate('/');
  }

  function saveDraft() {
    downloadPDF(report);
  }

  function saveWithoutPDF() {
    const updated = { ...report, status: 'completed' };
    saveReport(updated);
    setReport(updated);
    alert('Report saved successfully!');
    navigate('/');
  }

  function shareOrOpen() {
    if (previewUrl) {
      window.open(previewUrl, '_blank');
    }
  }

  async function handleShare() {
    const result = await shareToOutlook(report);
    if (result === 'mailto') {
      downloadPDF(report);
      exportReportToExcel(report);
      alert('PDF and Excel files downloaded. Please attach them to the email that just opened.');
    }
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

      <div className="card" ref={previewRef}>
        <h3>PDF Preview</h3>
        <button className="btn btn-primary btn-full" onClick={showPreview} style={{ marginBottom: 12 }}>
          Generate Preview
        </button>
        {previewError && <div className="alert alert-warning">{previewError}</div>}
        {previewUrl && (
          <div className="pdf-preview-container">
            <iframe
              src={previewUrl}
              className="pdf-preview-frame"
              title="Report Preview"
            />
            <button className="btn btn-outline btn-sm" onClick={shareOrOpen} style={{ marginTop: 8 }}>
              Open in New Tab
            </button>
          </div>
        )}
      </div>

      <div className="page-actions-stacked">
        <button className="btn btn-primary btn-lg btn-full" onClick={finalizeAndDownload}>
          Complete & Download PDF
        </button>
        <div className="page-actions-row">
          <button className="btn btn-outline" onClick={() => navigate(`/report/${id}/inspect`)}>
            ← Back
          </button>
          <button className="btn btn-outline" onClick={saveWithoutPDF}>
            Save Only
          </button>
        </div>
        <button className="btn btn-outline btn-full" onClick={() => exportReportToExcel(report)} style={{ marginTop: 8 }}>
          Export to Excel (.xlsx)
        </button>
        <button className="btn btn-outline btn-full btn-share" onClick={handleShare} style={{ marginTop: 8 }}>
          Email / Share Report
        </button>
      </div>
    </div>
  );
}
