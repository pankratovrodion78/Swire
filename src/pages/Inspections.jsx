import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getReport, saveReport } from '../utils/storage';
import BarcodeScanner from '../components/BarcodeScanner';
import CameraCapture from '../components/CameraCapture';

export default function Inspections() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanTarget, setScanTarget] = useState(null);
  const [expandedIdx, setExpandedIdx] = useState(null);

  useEffect(() => {
    const r = getReport(id);
    if (!r) return navigate('/');
    setReport(r);
  }, [id, navigate]);

  function createInspection() {
    return {
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      primaryCode: '',
      secondaryCode: '',
      packageCondition: '',
      canPhoto: null,
      casePhoto: null,
      notes: '',
    };
  }

  function addInspection() {
    const updated = { ...report };
    updated.inspections = [...updated.inspections, createInspection()];
    setReport(updated);
    saveReport(updated);
    setExpandedIdx(updated.inspections.length - 1);
  }

  function updateInspection(idx, field, value) {
    const updated = { ...report };
    updated.inspections = [...updated.inspections];
    updated.inspections[idx] = { ...updated.inspections[idx], [field]: value };
    setReport(updated);
    saveReport(updated);
  }

  function removeInspection(idx) {
    if (!confirm('Remove this inspection entry?')) return;
    const updated = { ...report };
    updated.inspections = updated.inspections.filter((_, i) => i !== idx);
    setReport(updated);
    saveReport(updated);
    setExpandedIdx(null);
  }

  const handleScan = useCallback((code) => {
    if (scanTarget !== null) {
      updateInspection(scanTarget.idx, scanTarget.field, code);
    }
    setScanning(false);
    setScanTarget(null);
  }, [scanTarget, report]);

  function startScan(idx, field) {
    setScanTarget({ idx, field });
    setScanning(true);
  }

  if (!report) return null;

  const CONDITIONS = ['Good', 'Damaged', 'Misaligned', 'Missing Label', 'Other'];

  return (
    <div className="page inspect-page">
      <div className="step-indicator">
        <span className="step done">1. Shift Info</span>
        <span className="step done">2. UPC Test</span>
        <span className="step active">3. Inspections</span>
        <span className="step">4. Review</span>
      </div>

      <div className="card">
        <h2>Package Visual Inspections</h2>
        <div className="alert alert-info">
          Every 30 minutes: scan barcode of the Can and Cardboard package.
          Take a photo showing the WHOLE can and WHOLE case.
          <br /><br />
          <strong>FULL SECONDARY PKG TEAR DOWN required at the TOP OF EACH HOUR</strong>
          (Inspect all cans, wrap/tray, film)
        </div>

        <button className="btn btn-primary btn-lg btn-add-inspection" onClick={addInspection}>
          + New 30-Min Inspection
        </button>

        {report.inspections.length === 0 && (
          <div className="empty-state">
            <p>No inspections yet. Tap the button above to start your first 30-minute inspection.</p>
          </div>
        )}

        {report.inspections.map((ins, idx) => (
          <div key={idx} className={`inspection-entry ${expandedIdx === idx ? 'expanded' : ''}`}>
            <div
              className="inspection-header"
              onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
            >
              <div className="inspection-summary">
                <span className="inspection-number">#{idx + 1}</span>
                <span className="inspection-time">{ins.time}</span>
                <span className={`badge ${ins.primaryCode && ins.canPhoto && ins.casePhoto ? 'badge-success' : 'badge-warning'}`}>
                  {ins.primaryCode && ins.canPhoto && ins.casePhoto ? 'Complete' : 'Incomplete'}
                </span>
              </div>
              <span className="expand-arrow">{expandedIdx === idx ? '▼' : '▶'}</span>
            </div>

            {expandedIdx === idx && (
              <div className="inspection-body">
                <div className="form-group">
                  <label className="field-label">Primary Code (Can Barcode)</label>
                  <div className="input-with-scan">
                    <input
                      className="input"
                      placeholder="Scan can barcode"
                      value={ins.primaryCode}
                      onChange={e => updateInspection(idx, 'primaryCode', e.target.value)}
                    />
                    <button className="btn btn-scan" onClick={() => startScan(idx, 'primaryCode')}>
                      Scan
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="field-label">Secondary Code (Case/Cardboard Barcode)</label>
                  <div className="input-with-scan">
                    <input
                      className="input"
                      placeholder="Scan case barcode"
                      value={ins.secondaryCode}
                      onChange={e => updateInspection(idx, 'secondaryCode', e.target.value)}
                    />
                    <button className="btn btn-scan" onClick={() => startScan(idx, 'secondaryCode')}>
                      Scan
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="field-label">Package Condition</label>
                  <div className="condition-buttons">
                    {CONDITIONS.map(c => (
                      <button
                        key={c}
                        className={`btn btn-condition ${ins.packageCondition === c ? 'selected' : ''}`}
                        onClick={() => updateInspection(idx, 'packageCondition', c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="photo-section">
                  <h4>Required Photos</h4>
                  <p className="photo-hint">Ensure the ENTIRE product is visible in frame</p>
                  <CameraCapture
                    label="Can Photo (show whole can)"
                    existingPhoto={ins.canPhoto}
                    onCapture={data => updateInspection(idx, 'canPhoto', data)}
                  />
                  <CameraCapture
                    label="Case/Cardboard Photo (show whole case)"
                    existingPhoto={ins.casePhoto}
                    onCapture={data => updateInspection(idx, 'casePhoto', data)}
                  />
                </div>

                <div className="form-group">
                  <label className="field-label">Notes (optional)</label>
                  <textarea
                    className="input textarea"
                    placeholder="Any observations..."
                    value={ins.notes || ''}
                    onChange={e => updateInspection(idx, 'notes', e.target.value)}
                  />
                </div>

                <button className="btn btn-sm btn-danger" onClick={() => removeInspection(idx)}>
                  Remove Inspection
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="page-actions">
        <button className="btn btn-outline" onClick={() => navigate(`/report/${id}/upc`)}>
          ← Back
        </button>
        <button className="btn btn-primary" onClick={() => navigate(`/report/${id}/review`)}>
          Next: Review & Submit →
        </button>
      </div>

      {scanning && (
        <BarcodeScanner onScan={handleScan} onClose={() => setScanning(false)} />
      )}
    </div>
  );
}
