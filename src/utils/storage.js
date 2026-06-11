const STORAGE_KEY = 'swire_shift_reports';

export function saveReport(report) {
  const reports = getAllReports();
  const idx = reports.findIndex(r => r.id === report.id);
  if (idx >= 0) {
    reports[idx] = report;
  } else {
    reports.push(report);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
}

export function getAllReports() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function getReport(id) {
  return getAllReports().find(r => r.id === id) || null;
}

export function deleteReport(id) {
  const reports = getAllReports().filter(r => r.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
}

export function createNewReport() {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    date: new Date().toISOString().slice(0, 10),
    operator: '',
    shift: '',
    line: '',
    status: 'in-progress',
    createdAt: new Date().toISOString(),
    scannerPerformance: [
      { pkg: 'Pkg 1', goodReads: '' },
      { pkg: 'Pkg 2', goodReads: '' },
      { pkg: 'Pkg 3', goodReads: '' },
      { pkg: 'Pkg 4', goodReads: '' },
      { pkg: 'Pkg 5', goodReads: '' },
    ],
    inspections: [],
    notes: '',
  };
}
