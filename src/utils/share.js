import { generatePDF } from './pdf';
import * as XLSX from 'xlsx';

function buildExcelBlob(report) {
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
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary');

  const upcData = [['Time', 'Flavor', 'Package', 'Pass/Fail', 'Initials']];
  for (const t of report.upcTests || []) {
    upcData.push([t.time || '', t.flavor || '', t.pkg || '', t.result || '', t.initials || '']);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(upcData), 'UPC Tests');

  const inspData = [['Time', 'Primary Code', 'Secondary Code', 'Condition', 'Can Photo', 'Case Photo']];
  for (const ins of report.inspections || []) {
    inspData.push([ins.time || '', ins.primaryCode || '', ins.secondaryCode || '', ins.packageCondition || '', ins.canPhoto ? 'Yes' : 'No', ins.casePhoto ? 'Yes' : 'No']);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(inspData), 'Inspections');

  const arrayBuf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([arrayBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function buildReportText(report) {
  let text = `PACKER REPORT — FM273SC\n`;
  text += `Date: ${report.date || 'N/A'}\n`;
  text += `Operator: ${report.operator || 'N/A'}\n`;
  text += `Shift: ${report.shift || 'N/A'}\n`;
  text += `Line: ${report.line || 'N/A'}\n\n`;

  text += `UPC TESTS (${(report.upcTests || []).length}):\n`;
  for (const t of report.upcTests || []) {
    text += `  ${t.time} — ${t.flavor || '?'} ${t.pkg || '?'} — ${t.result || '?'}\n`;
  }

  text += `\nINSPECTIONS (${(report.inspections || []).length}):\n`;
  for (const ins of report.inspections || []) {
    text += `  ${ins.time} — Primary: ${ins.primaryCode || 'N/A'}, Secondary: ${ins.secondaryCode || 'N/A'}, Condition: ${ins.packageCondition || 'N/A'}\n`;
  }

  if (report.notes) text += `\nNOTES: ${report.notes}\n`;
  return text;
}

function getFilenameBase(report) {
  return `PackerReport_${report.date}_${report.shift || 'shift'}_${report.operator || 'op'}`.replace(/\s+/g, '_');
}

export async function shareToOutlook(report) {
  const canShare = navigator.canShare && navigator.share;
  const fname = getFilenameBase(report);

  if (canShare) {
    try {
      const pdfBlob = generatePDF(report).output('blob');
      const xlsxBlob = buildExcelBlob(report);
      const files = [
        new File([pdfBlob], `${fname}.pdf`, { type: 'application/pdf' }),
        new File([xlsxBlob], `${fname}.xlsx`, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      ];

      if (navigator.canShare({ files })) {
        await navigator.share({
          title: `Packer Report — ${report.date} ${report.shift}`,
          text: buildReportText(report),
          files,
        });
        return 'shared';
      }
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled';
    }
  }

  const subject = encodeURIComponent(`Packer Report — ${report.date} ${report.shift || ''} — ${report.operator || ''}`);
  const body = encodeURIComponent(buildReportText(report) + '\n\n(PDF and Excel files were downloaded — please attach them to this email)');
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
  return 'mailto';
}
