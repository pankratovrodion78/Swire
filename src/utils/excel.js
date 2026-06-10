import * as XLSX from 'xlsx';

export function exportReportToExcel(report) {
  const wb = XLSX.utils.book_new();

  const summary = [
    ['Production Can Line Packer Report — FM273SC'],
    [],
    ['Date', report.date || ''],
    ['Operator', report.operator || ''],
    ['Shift', report.shift || ''],
    ['Line', report.line || ''],
    ['Status', report.status || ''],
    [],
    ['Notes', report.notes || ''],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summary);
  wsSummary['!cols'] = [{ wch: 15 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  const upcData = [['Time', 'Flavor', 'Package', 'Pass/Fail', 'Initials']];
  for (const t of report.upcTests || []) {
    upcData.push([t.time || '', t.flavor || '', t.pkg || '', t.result || '', t.initials || '']);
  }
  const wsUpc = XLSX.utils.aoa_to_sheet(upcData);
  wsUpc['!cols'] = [{ wch: 10 }, { wch: 20 }, { wch: 15 }, { wch: 10 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, wsUpc, 'UPC Tests');

  const perfData = [['Package', '# Good Reads']];
  for (const s of report.scannerPerformance || []) {
    perfData.push([s.pkg || '', s.goodReads || '']);
  }
  const wsPerf = XLSX.utils.aoa_to_sheet(perfData);
  XLSX.utils.book_append_sheet(wb, wsPerf, 'Scanner Performance');

  const inspData = [['Time', 'Primary Code', 'Secondary Code', 'Package Condition', 'Has Can Photo', 'Has Case Photo']];
  for (const ins of report.inspections || []) {
    inspData.push([
      ins.time || '',
      ins.primaryCode || '',
      ins.secondaryCode || '',
      ins.packageCondition || '',
      ins.canPhoto ? 'Yes' : 'No',
      ins.casePhoto ? 'Yes' : 'No',
    ]);
  }
  const wsInsp = XLSX.utils.aoa_to_sheet(inspData);
  wsInsp['!cols'] = [{ wch: 10 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsInsp, 'Inspections');

  const filename = `PackerReport_${report.date}_${report.shift || 'shift'}_${report.operator || 'op'}.xlsx`
    .replace(/\s+/g, '_');
  XLSX.writeFile(wb, filename);
}

export function exportAllReportsToExcel(reports) {
  const wb = XLSX.utils.book_new();

  const allData = [['Date', 'Operator', 'Shift', 'Line', 'Status', 'UPC Tests', 'Inspections', 'Notes']];
  for (const r of reports) {
    allData.push([
      r.date || '',
      r.operator || '',
      r.shift || '',
      r.line || '',
      r.status || '',
      (r.upcTests || []).length,
      (r.inspections || []).length,
      r.notes || '',
    ]);
  }
  const wsAll = XLSX.utils.aoa_to_sheet(allData);
  wsAll['!cols'] = [
    { wch: 12 }, { wch: 20 }, { wch: 8 }, { wch: 8 },
    { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, wsAll, 'All Reports');

  const upcAll = [['Report Date', 'Operator', 'Shift', 'Time', 'Flavor', 'Package', 'Pass/Fail', 'Initials']];
  for (const r of reports) {
    for (const t of r.upcTests || []) {
      upcAll.push([r.date, r.operator, r.shift, t.time || '', t.flavor || '', t.pkg || '', t.result || '', t.initials || '']);
    }
  }
  const wsUpcAll = XLSX.utils.aoa_to_sheet(upcAll);
  XLSX.utils.book_append_sheet(wb, wsUpcAll, 'All UPC Tests');

  const inspAll = [['Report Date', 'Operator', 'Shift', 'Time', 'Primary Code', 'Secondary Code', 'Condition', 'Can Photo', 'Case Photo']];
  for (const r of reports) {
    for (const ins of r.inspections || []) {
      inspAll.push([
        r.date, r.operator, r.shift,
        ins.time || '', ins.primaryCode || '', ins.secondaryCode || '',
        ins.packageCondition || '', ins.canPhoto ? 'Yes' : 'No', ins.casePhoto ? 'Yes' : 'No',
      ]);
    }
  }
  const wsInspAll = XLSX.utils.aoa_to_sheet(inspAll);
  XLSX.utils.book_append_sheet(wb, wsInspAll, 'All Inspections');

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `PackerReports_Export_${date}.xlsx`);
}
