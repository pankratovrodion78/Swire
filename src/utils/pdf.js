import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  doc.text(`DATE: ${report.date || ''}`, margin, headerY);
  doc.text(`OPERATOR: ${report.operator || ''}`, margin + 70, headerY);
  doc.text(`SHIFT: ${report.shift || ''}`, margin + 150, headerY);
  doc.text(`LINE: ${report.line || ''}`, margin + 200, headerY);

  // Scanner Performance
  const spRows = (report.scannerPerformance || []).map(s => [s.pkg || '', s.goodReads || '']);
  if (spRows.length === 0) spRows.push(['', '']);

  autoTable(doc, {
    startY: 28,
    margin: { left: pageW / 2 + 5, right: margin },
    head: [['Scanner Performance — Pkg', '# of Good Reads']],
    body: spRows,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [200, 0, 0], textColor: 255, fontSize: 7 },
  });

  // Inspections header
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('PACKAGE INSPECTIONS (every 30 minutes)', margin, 28);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(
    'Guided verification: barcode scan, can rotation photos, date code, package scan & photo',
    margin, 32
  );

  const inspRows = (report.inspections || []).map(ins => [
    ins.time || '',
    ins.canBarcode || '',
    ins.canRecipeMatch || (ins.canBarcode ? 'No Match' : ''),
    ins.dateCode || (ins.dateCodeMonth ? `BB ${ins.dateCodeMonth} ${ins.dateCodeDate || ''} ${ins.dateCodeDayCode || ''}`.trim() : (ins.dateCodePhoto ? 'Photo' : '')),
    ins.pkgBarcode || '',
    ins.pkgRecipeMatch || (ins.pkgBarcode ? 'No Match' : ''),
    ins.packageCondition || '',
    `${ins.rotationPhotos?.length || 0} rot + ${ins.pkgPhoto ? '1' : '0'} pkg`,
  ]);
  while (inspRows.length < 8) inspRows.push(['', '', '', '', '', '', '', '']);

  autoTable(doc, {
    startY: 35,
    margin: { left: margin, right: pageW / 2 + 5 },
    head: [['TIME', 'CAN CODE', 'CAN MATCH', 'DATE CODE', 'PKG CODE', 'PKG MATCH', 'CONDITION', 'PHOTOS']],
    body: inspRows,
    theme: 'grid',
    styles: { fontSize: 6, cellPadding: 1.2 },
    headStyles: { fillColor: [200, 0, 0], textColor: 255, fontSize: 6 },
  });

  // Photo pages
  const hasPhotos = (report.inspections || []).some(ins =>
    (ins.rotationPhotos && ins.rotationPhotos.length > 0) || ins.pkgPhoto || ins.dateCodePhoto
  );

  if (hasPhotos) {
    doc.addPage('letter', 'portrait');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Inspection Photos', 105, 15, { align: 'center' });

    let yPos = 25;
    for (const ins of report.inspections || []) {
      const photos = [];
      if (ins.rotationPhotos) {
        ins.rotationPhotos.forEach((p, i) => photos.push({ data: p, label: `Rotation ${i + 1}` }));
      }
      if (ins.dateCodePhoto) photos.push({ data: ins.dateCodePhoto, label: 'Date Code' });
      if (ins.pkgPhoto) photos.push({ data: ins.pkgPhoto, label: 'Package' });
      if (photos.length === 0) continue;

      if (yPos > 240) {
        doc.addPage('letter', 'portrait');
        yPos = 15;
      }
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(`Inspection @ ${ins.time || ''}${ins.canRecipeMatch ? ' — ' + ins.canRecipeMatch : ''}`, 15, yPos);
      yPos += 5;

      for (const photo of photos) {
        if (yPos > 230) {
          doc.addPage('letter', 'portrait');
          yPos = 15;
        }
        try {
          doc.addImage(photo.data, 'JPEG', 15, yPos, 55, 40);
          doc.setFontSize(7);
          doc.setFont('helvetica', 'normal');
          doc.text(photo.label, 15, yPos + 43);
        } catch {}
        yPos += 47;
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
    doc.text(String(report.notes), margin + 15, bottomY - 4, { maxWidth: pageW - 2 * margin - 15 });
  }

  return doc;
}

export function downloadPDF(report) {
  try {
    const doc = generatePDF(report);
    const filename = `PackerReport_${report.date}_${report.shift || 'shift'}_${report.operator || 'op'}.pdf`;
    doc.save(filename.replace(/\s+/g, '_'));
  } catch (err) {
    console.error('PDF generation failed:', err);
    alert('Error generating PDF: ' + err.message);
  }
}
