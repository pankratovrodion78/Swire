import { useNavigate } from 'react-router-dom';
import { createNewReport, getAllReports, deleteReport, saveReport } from '../utils/storage';
import { downloadPDF } from '../utils/pdf';
import { exportReportToExcel, exportAllReportsToExcel } from '../utils/excel';
import { useState } from 'react';

export default function Home() {
  const navigate = useNavigate();
  const [reports, setReports] = useState(getAllReports);

  function startNewReport() {
    const report = createNewReport();
    saveReport(report);
    navigate(`/report/${report.id}/setup`);
  }

  function handleDelete(id) {
    if (confirm('Delete this report?')) {
      deleteReport(id);
      setReports(getAllReports());
    }
  }

  const inProgress = reports.filter(r => r.status === 'in-progress');
  const completed = reports.filter(r => r.status === 'completed');

  return (
    <div className="page home-page">
      <div className="home-hero">
        <h2>Production Can Line Packer Report</h2>
        <p>FM273SC — Shift Documentation & Inspection</p>
        <button className="btn btn-primary btn-lg" onClick={startNewReport}>
          + Start New Shift Report
        </button>
        <button className="btn btn-outline btn-wds" onClick={() => navigate('/wds')} style={{ marginTop: 10 }}>
          📊 Weekly Direction Setting
        </button>
        <button className="btn btn-outline" onClick={() => navigate('/admin')} style={{ marginTop: 10 }}>
          Recipe Management (Admin)
        </button>
        <button className="btn btn-outline" onClick={() => navigate('/vision')} style={{ marginTop: 10, marginLeft: 8 }}>
          Camera Recognition (Beta)
        </button>
      </div>

      {inProgress.length > 0 && (
        <section className="report-section">
          <h3>In Progress</h3>
          <div className="report-list">
            {inProgress.map(r => (
              <div key={r.id} className="report-card active">
                <div className="report-card-info">
                  <strong>{r.date}</strong>
                  <span>{r.operator || 'No operator'} — {r.shift || 'No shift'}</span>
                  <span className="badge badge-warning">In Progress</span>
                </div>
                <div className="report-card-actions">
                  <button className="btn btn-sm btn-primary" onClick={() => navigate(`/report/${r.id}/setup`)}>
                    Continue
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(r.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <section className="report-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Completed Reports</h3>
            <button className="btn btn-sm btn-outline" onClick={() => exportAllReportsToExcel(completed)}>
              Export All to Excel
            </button>
          </div>
          <div className="report-list">
            {completed.map(r => (
              <div key={r.id} className="report-card">
                <div className="report-card-info">
                  <strong>{r.date}</strong>
                  <span>{r.operator} — {r.shift}</span>
                  <span className="badge badge-success">Completed</span>
                </div>
                <div className="report-card-actions">
                  <button className="btn btn-sm btn-outline" onClick={() => downloadPDF(r)}>
                    PDF
                  </button>
                  <button className="btn btn-sm btn-outline" onClick={() => exportReportToExcel(r)}>
                    Excel
                  </button>
                  <button className="btn btn-sm" onClick={() => navigate(`/report/${r.id}/setup`)}>
                    View
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(r.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
