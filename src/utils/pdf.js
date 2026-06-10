import jsPDF from 'jspdf';
import 'jspdf-autotable';

export function generatePDF(report) {
  const doc = new jsPDF('landscape', 'mm', 'letter');
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 10;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Production Can Line Packer Report — FM273SC', pageW / 2, 12, { align: 'center' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const headerY = 20;
  doc.text(`DATE: ${report.date}`, margin, headerY);
  doc.text(`OPERATOR: ${report.operator}`, margin + 70, headerY);
  doc.text(`SHIFT: ${report.shift}`, margin + 150, headerY);
  doc.text(`LINE: ${report.line || ''}`, margin + 200, headerY);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('UPC — BAR CODE CHALLENGES', margin, 28);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(
    "Test scanner at the beginning of each shift, flavor and package. If the test fails (line & packer doesn't stop), contact Line Lead, Manager or Lab tech.",
    margin, 32
  );

  const upcRows = report.upcTests.map(t => [
    t.time || '',
    t.flavor || '',
    t.pkg || '',
    t.result || '',
    t.initials || '',
  ]);
  if (upcRows.length === 0) upcRows.push(['', '', '', '', '']);

  doc.autoTable({
    startY: 35,
    margin: { left: margin, right: pageW / 2 + 5 },
    head: [['Time', 'Flavor', 'Pkg', 'Pass / Fail', 'Initials']],
    body: upcRows,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [200, 0, 0], textColor: 255, fontSize: 7 },
  });

  const spRows = report.scannerPerformance.map(s => [s.pkg, s.goodReads || '']);
  doc.autoTable({
    startY: 35,
    margin: { left: pageW / 2 + 5, right: margin },
    head: [['Scanner Performance — Pkg', '# of Good Reads']],
    body: spRows,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [200, 0, 0], textColor: 255, fontSize: 7 },
  });

  const inspY = Math.max(doc.lastAutoTable.finalY, 75) + 6;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('PACKAGE VISUAL INSPECTIONS (every 30 minutes)', margin, inspY);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(
    'FULL SECONDARY PKG TEAR DOWN required at the TOP OF EACH HOUR (Inspect all cans, wrap/tray, film)',
    margin, inspY + 4
  );

  const inspRows = report.inspections.map(ins => [
    ins.time || '',
    ins.primaryCode || '',
    ins.secondaryCode || '',
    ins.packageCondition || '',
  ]);
  while (inspRows.length < 10) inspRows.push(['', '', '', '']);

  const halfInsp = Math.ceil(inspRows.length / 2);
  const leftRows = inspRows.slice(0, halfInsp);
  const rightRows = inspRows.slice(halfInsp);

  doc.autoTable({
    startY: inspY + 7,
    margin: { left: margin, right: pageW / 2 + 5 },
    head: [['TIME', 'PRIMARY CODE', 'SECONDARY CODE', 'PKG CONDITION']],
    body: leftRows,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [200, 0, 0], textColor: 255, fontSize: 7 },
  });

  doc.autoTable({
    startY: inspY + 7,
    margin: { left: pageW / 2 + 5, right: margin },
    head: [['TIME', 'PRIMARY CODE', 'SECONDARY CODE', 'PKG CONDITION']],
    body: rightRows.length ? rightRows : [['', '', '', '']],
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [200, 0, 0], textColor: 255, fontSize: 7 },
  });

  if (report.inspections.some(ins => ins.canPhoto || ins.casePhoto)) {
    doc.addPage('letter', 'portrait');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Inspection Photos', 105, 15, { align: 'center' });

    let yPos = 25;
    for (const ins of report.inspections) {
      if (!ins.canPhoto && !ins.casePhoto) continue;
      if (yPos > 240) {
        doc.addPage('letter', 'portrait');
        yPos = 15;
      }
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(`Inspection @ ${ins.time}`, 15, yPos);
      yPos += 5;

      if (ins.canPhoto) {
        try {
          doc.addImage(ins.canPhoto, 'JPEG', 15, yPos, 80, 60);
          doc.setFontSize(7);
          doc.setFont('helvetica', 'normal');
          doc.text('Can Photo', 15, yPos + 63);
        } catch {}
        yPos += 68;
      }
      if (ins.casePhoto) {
        try {
          doc.addImage(ins.casePhoto, 'JPEG', 15, yPos, 80, 60);
          doc.setFontSize(7);
          doc.setFont('helvetica', 'normal');
          doc.text('Case Photo', 15, yPos + 63);
        } catch {}
        yPos += 68;
      }
    }
  }

  if (report.notes) {
    const lastPage = doc.getNumberOfPages();
    doc.setPage(lastPage);
    const bottomY = doc.internal.pageSize.getHeight() - 15;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('NOTES:', margin, bottomY - 4);
    doc.setFont('helvetica', 'normal');
    doc.text(report.notes, margin + 15, bottomY - 4, { maxWidth: pageW - 2 * margin - 15 });
  }

  return doc;
}

export function downloadPDF(report) {
  const doc = generatePDF(report);
  const filename = `PackerReport_${report.date}_${report.shift || 'shift'}_${report.operator || 'op'}.pdf`;
  doc.save(filename.replace(/\s+/g, '_'));
}
