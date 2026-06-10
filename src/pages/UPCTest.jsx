import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getReport, saveReport } from '../utils/storage';
import BarcodeScanner from '../components/BarcodeScanner';

export default function UPCTest() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanTarget, setScanTarget] = useState(null);

  useEffect(() => {
    const r = getReport(id);
    if (!r) return navigate('/');
    if (r.upcTests.length === 0) {
      r.upcTests = [createTest()];
      saveReport(r);
    }
    setReport(r);
  }, [id, navigate]);

  function createTest() {
    return {
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      flavor: '',
      pkg: '',
      result: '',
      initials: '',
    };
  }

  function updateTest(idx, field, value) {
    const updated = { ...report };
    updated.upcTests = [...updated.upcTests];
    updated.upcTests[idx] = { ...updated.upcTests[idx], [field]: value };
    setReport(updated);
    saveReport(updated);
  }

  function addTest() {
    const updated = { ...report };
    updated.upcTests = [...updated.upcTests, createTest()];
    setReport(updated);
    saveReport(updated);
  }

  function removeTest(idx) {
    const updated = { ...report };
    updated.upcTests = updated.upcTests.filter((_, i) => i !== idx);
    setReport(updated);
    saveReport(updated);
  }

  function updateScannerPerf(idx, value) {
    const updated = { ...report };
    updated.scannerPerformance = [...updated.scannerPerformance];
    updated.scannerPerformance[idx] = { ...updated.scannerPerformance[idx], goodReads: value };
    setReport(updated);
    saveReport(updated);
  }

  const handleScan = useCallback((code) => {
    if (scanTarget !== null) {
      updateTest(scanTarget.idx, scanTarget.field, code);
    }
    setScanning(false);
    setScanTarget(null);
  }, [scanTarget, report]);

  function startScan(idx, field) {
    setScanTarget({ idx, field });
    setScanning(true);
  }

  if (!report) return null;

  return (
    <div className="page upc-page">
      <div className="step-indicator">
        <span className="step done">1. Shift Info</span>
        <span className="step active">2. UPC Test</span>
        <span className="step">3. Inspections</span>
        <span className="step">4. Review</span>
      </div>

      <div className="card">
        <h2>UPC — Bar Code Challenges</h2>
        <div className="alert alert-info">
          Test scanner at the beginning of each shift, flavor and package.
          If the test fails (line & packer doesn't stop), contact Line Lead, Manager or Lab tech.
        </div>

        {report.upcTests.map((test, idx) => (
          <div key={idx} className="test-entry">
            <div className="test-header">
              <span className="test-number">Test #{idx + 1}</span>
              <span className="test-time">{test.time}</span>
              {report.upcTests.length > 1 && (
                <button className="btn btn-sm btn-danger" onClick={() => removeTest(idx)}>Remove</button>
              )}
            </div>

            <div className="form-row">
              <div className="form-group flex-1">
                <label className="field-label">Flavor</label>
                <div className="input-with-scan">
                  <input
                    className="input"
                    placeholder="Scan or type flavor"
                    value={test.flavor}
                    onChange={e => updateTest(idx, 'flavor', e.target.value)}
                  />
                  <button className="btn btn-scan" onClick={() => startScan(idx, 'flavor')}>
                    Scan
                  </button>
                </div>
              </div>
              <div className="form-group flex-1">
                <label className="field-label">Package</label>
                <div className="input-with-scan">
                  <input
                    className="input"
                    placeholder="Scan or type pkg"
                    value={test.pkg}
                    onChange={e => updateTest(idx, 'pkg', e.target.value)}
                  />
                  <button className="btn btn-scan" onClick={() => startScan(idx, 'pkg')}>
                    Scan
                  </button>
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="field-label">Result</label>
                <div className="result-buttons">
                  <button
                    className={`btn btn-result pass ${test.result === 'Pass' ? 'selected' : ''}`}
                    onClick={() => updateTest(idx, 'result', 'Pass')}
                  >
                    PASS
                  </button>
                  <button
                    className={`btn btn-result fail ${test.result === 'Fail' ? 'selected' : ''}`}
                    onClick={() => updateTest(idx, 'result', 'Fail')}
                  >
                    FAIL
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label className="field-label">Initials</label>
                <input
                  className="input input-sm"
                  placeholder="Initials"
                  maxLength={5}
                  value={test.initials}
                  onChange={e => updateTest(idx, 'initials', e.target.value.toUpperCase())}
                />
              </div>
            </div>
          </div>
        ))}

        <button className="btn btn-outline btn-add" onClick={addTest}>
          + Add Another Test
        </button>
      </div>

      <div className="card">
        <h3>Scanner Performance</h3>
        <div className="scanner-perf-grid">
          {report.scannerPerformance.map((sp, idx) => (
            <div key={idx} className="form-row perf-row">
              <span className="perf-label">{sp.pkg}</span>
              <input
                className="input input-sm"
                type="number"
                placeholder="# Good Reads"
                value={sp.goodReads}
                onChange={e => updateScannerPerf(idx, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="page-actions">
        <button className="btn btn-outline" onClick={() => navigate(`/report/${id}/setup`)}>
          ← Back
        </button>
        <button className="btn btn-primary" onClick={() => navigate(`/report/${id}/inspect`)}>
          Next: 30-Min Inspections →
        </button>
      </div>

      {scanning && (
        <BarcodeScanner onScan={handleScan} onClose={() => setScanning(false)} />
      )}
    </div>
  );
}
