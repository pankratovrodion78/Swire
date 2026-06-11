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

  const perfData = [['Package', '# Good Reads']];
  for (const s of report.scannerPerformance || []) {
    perfData.push([s.pkg || '', s.goodReads || '']);
  }
  const wsPerf = XLSX.utils.aoa_to_sheet(perfData);
  XLSX.utils.book_append_sheet(wb, wsPerf, 'Scanner Performance');

  const inspData = [['Time', 'Can Barcode', 'Can Match', 'Date Code', 'Pkg Barcode', 'Pkg Match', 'Condition', 'Rotation Photos', 'Pkg Photo', 'Date Code Photo']];
  for (const ins of report.inspections || []) {
    inspData.push([
      ins.time || '',
      ins.canBarcode || '',
      ins.canRecipeMatch || '',
      ins.dateCode || '',
      ins.pkgBarcode || '',
      ins.pkgRecipeMatch || '',
      ins.packageCondition || '',
      ins.rotationPhotos?.length || 0,
      ins.pkgPhoto ? 'Yes' : 'No',
      ins.dateCodePhoto ? 'Yes' : 'No',
    ]);
  }
  const wsInsp = XLSX.utils.aoa_to_sheet(inspData);
  wsInsp['!cols'] = [{ wch: 10 }, { wch: 18 }, { wch: 20 }, { wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsInsp, 'Inspections');

  const filename = `PackerReport_${report.date}_${report.shift || 'shift'}_${report.operator || 'op'}.xlsx`
    .replace(/\s+/g, '_');
  XLSX.writeFile(wb, filename);
}

export function exportAllReportsToExcel(reports) {
  const wb = XLSX.utils.book_new();

  const allData = [['Date', 'Operator', 'Shift', 'Line', 'Status', 'Inspections', 'Notes']];
  for (const r of reports) {
    allData.push([
      r.date || '',
      r.operator || '',
      r.shift || '',
      r.line || '',
      r.status || '',
      (r.inspections || []).length,
      r.notes || '',
    ]);
  }
  const wsAll = XLSX.utils.aoa_to_sheet(allData);
  wsAll['!cols'] = [
    { wch: 12 }, { wch: 20 }, { wch: 8 }, { wch: 8 },
    { wch: 12 }, { wch: 12 }, { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, wsAll, 'All Reports');

  const inspAll = [['Report Date', 'Operator', 'Shift', 'Time', 'Can Barcode', 'Can Match', 'Date Code', 'Pkg Barcode', 'Pkg Match', 'Condition']];
  for (const r of reports) {
    for (const ins of r.inspections || []) {
      inspAll.push([
        r.date, r.operator, r.shift,
        ins.time || '', ins.canBarcode || '', ins.canRecipeMatch || '',
        ins.dateCode || '', ins.pkgBarcode || '', ins.pkgRecipeMatch || '',
        ins.packageCondition || '',
      ]);
    }
  }
  const wsInspAll = XLSX.utils.aoa_to_sheet(inspAll);
  XLSX.utils.book_append_sheet(wb, wsInspAll, 'All Inspections');

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `PackerReports_Export_${date}.xlsx`);
}
