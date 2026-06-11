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
    if (!r.scannerPerformance) {
      r.scannerPerformance = [
        { pkg: 'Pkg 1', goodReads: '' },
        { pkg: 'Pkg 2', goodReads: '' },
        { pkg: 'Pkg 3', goodReads: '' },
        { pkg: 'Pkg 4', goodReads: '' },
        { pkg: 'Pkg 5', goodReads: '' },
      ];
    }
    setReport(r);
  }, [id, navigate]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (!report) return null;

  function update(field, value) {
    const updated = { ...report, [field]: value };
    setReport(updated);
    saveReport(updated);
  }

  function updatePerformance(idx, value) {
    const perf = [...report.scannerPerformance];
    perf[idx] = { ...perf[idx], goodReads: value };
    update('scannerPerformance', perf);
  }

  const issues = [];
  if (!report.operator) issues.push('Operator name is missing');
  if (!report.shift) issues.push('Shift not selected');
  if (report.inspections.length === 0) issues.push('No 30-min inspections recorded');
  report.inspections.forEach((ins, i) => {
    if (!ins.canBarcode) issues.push(`Inspection #${i + 1}: missing can barcode`);
    if (!ins.rotationPhotos || ins.rotationPhotos.length === 0) issues.push(`Inspection #${i + 1}: missing rotation photos`);
    if (!ins.pkgBarcode) issues.push(`Inspection #${i + 1}: missing package barcode`);
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
        <span className="step done">2. Inspections</span>
        <span className="step active">3. Review</span>
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
          <h3>30-Min Inspections ({report.inspections.length})</h3>
          {report.inspections.length > 0 ? (
            <table className="review-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Can Barcode</th>
                  <th>Can Match</th>
                  <th>Pkg Barcode</th>
                  <th>Pkg Match</th>
                  <th>Condition</th>
                  <th>Photos</th>
                </tr>
              </thead>
              <tbody>
                {report.inspections.map((ins, i) => (
                  <tr key={i}>
                    <td>{ins.time}</td>
                    <td className="code-cell">{ins.canBarcode || '—'}</td>
                    <td>
                      {ins.canRecipeMatch ? (
                        <span className="badge badge-success">Match</span>
                      ) : ins.canBarcode ? (
                        <span className="badge badge-danger">No Match</span>
                      ) : '—'}
                    </td>
                    <td className="code-cell">{ins.pkgBarcode || '—'}</td>
                    <td>
                      {ins.pkgRecipeMatch ? (
                        <span className="badge badge-success">Match</span>
                      ) : ins.pkgBarcode ? (
                        <span className="badge badge-danger">No Match</span>
                      ) : '—'}
                    </td>
                    <td>{ins.packageCondition || '—'}</td>
                    <td>{(ins.rotationPhotos?.length || 0) + (ins.pkgPhoto ? 1 : 0) + (ins.dateCodePhoto ? 1 : 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-muted">No inspections recorded</p>}
        </div>

        <div className="review-section">
          <h3>Scanner Performance — Good Reads</h3>
          <p className="field-hint">Enter the number of good reads for each package tested this shift</p>
          <div className="scanner-perf-grid">
            {report.scannerPerformance.map((sp, i) => (
              <div key={i} className="form-row perf-row">
                <span className="perf-label">{sp.pkg}</span>
                <input
                  className="input input-sm"
                  type="number"
                  placeholder="# good reads"
                  value={sp.goodReads}
                  onChange={e => updatePerformance(i, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label className="field-label">Additional Notes</label>
          <textarea
            className="input textarea"
            placeholder="Any additional notes for this shift report..."
            value={report.notes || ''}
            onChange={e => update('notes', e.target.value)}
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
