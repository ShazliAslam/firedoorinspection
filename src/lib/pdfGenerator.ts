import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ReportDataset {
  organization: any;
  client: any;
  buildings: any[];
  doors: any[];
  inspections: any[];
  inspectionItems: any[];
  deficiencies: any[];
  remediations: any[];
  evidence: any[];
}

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Generates a branded, audit-ready fire door inspection / remediation / evidence PDF.
 * Returns both the base64 PDF (for private Supabase Storage upload) and the jsPDF instance.
 */
export async function generateBrandedPdf(
  reportType: string,
  title: string,
  dataset: ReportDataset
): Promise<{ pdfBase64: string; doc: jsPDF }> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const org = dataset.organization || {};
  const client = dataset.client || {};
  const accentHex = org.primary_color || '#1d4ed8';

  // Header Banner
  doc.setFillColor(15, 23, 42); // Slate-900 deep navy
  doc.rect(0, 0, pageWidth, 88, 'F');
  doc.setFillColor(accentHex);
  doc.rect(0, 84, pageWidth, 4, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(org.name || 'DoorProof AI Contractor', 40, 36);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(203, 213, 225);
  const subline = [org.address, org.phone, org.license_number ? `License: ${org.license_number}` : null]
    .filter(Boolean)
    .join('  •  ');
  doc.text(subline || 'Fire Door Inspection & Remediation Services', 40, 54);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(reportType.toUpperCase(), pageWidth - 40, 36, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text(`Generated ${new Date().toLocaleDateString('en-US', { dateStyle: 'medium' })}`, pageWidth - 40, 52, {
    align: 'right',
  });

  // Title & Client Metadata Box
  let y = 112;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(title, 40, y);
  y += 18;

  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(40, y, pageWidth - 80, 68, 4, 4, 'FD');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('CLIENT PORTFOLIO', 54, y + 18);
  doc.text('FACILITIES COVERED', 260, y + 18);
  doc.text('SUMMARY METRICS', 430, y + 18);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.text(client.name || 'N/A', 54, y + 34);
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(client.contact_name ? `Attn: ${client.contact_name}` : '', 54, y + 48);
  doc.text(client.contact_email || '', 54, y + 60);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9.5);
  const bldSummary =
    dataset.buildings.length === 1
      ? dataset.buildings[0].name
      : `${dataset.buildings.length} Buildings`;
  doc.text(bldSummary, 260, y + 34);
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  if (dataset.buildings[0]?.address) {
    doc.text(dataset.buildings[0].address.slice(0, 34), 260, y + 48);
  }

  const passed = dataset.doors.filter((d) => d.status === 'Pass').length;
  const openDefs = dataset.deficiencies.filter((d) => !['Verified', 'Closed'].includes(d.status)).length;
  const verifiedDefs = dataset.deficiencies.filter((d) => ['Verified', 'Closed'].includes(d.status)).length;
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(8.5);
  doc.text(`Doors: ${dataset.doors.length} (${passed} Pass)`, 430, y + 34);
  doc.text(`Open Deficiencies: ${openDefs}`, 430, y + 47);
  doc.text(`Verified Repairs: ${verifiedDefs}`, 430, y + 60);

  y += 88;

  // Section 1: Fire Door Inventory Table
  if (dataset.doors.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('Fire Door Assembly Register', 40, y);
    y += 8;

    const bldLookup = Object.fromEntries(dataset.buildings.map((b) => [b.id, b.name]));
    autoTable(doc, {
      startY: y,
      margin: { left: 40, right: 40 },
      head: [['Door ID', 'Building', 'Location', 'Type / Rating', 'Status', 'Last Inspected']],
      body: dataset.doors.slice(0, 50).map((d) => [
        d.door_code,
        bldLookup[d.building_id] || '-',
        `${d.floor || ''} ${d.room_location || ''}`.trim(),
        `${d.door_type || '-'} (${d.fire_rating || '-'})`,
        d.status,
        d.last_inspection_date ? new Date(d.last_inspection_date).toLocaleDateString() : 'Pending',
      ]),
      styles: { fontSize: 8, cellPadding: 5, textColor: [30, 41, 59] },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
    y = (doc as any).lastAutoTable.finalY + 22;
  }

  // Section 2: Checklist Results (when an inspection is targeted)
  if (dataset.inspectionItems.length > 0) {
    if (y > 650) {
      doc.addPage();
      y = 48;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('Inspection Checklist Results', 40, y);
    y += 8;

    const doorLookup = Object.fromEntries(dataset.doors.map((d) => [d.id, d.door_code]));
    autoTable(doc, {
      startY: y,
      margin: { left: 40, right: 40 },
      head: [['Door', 'Category', 'Checklist Criterion', 'Result', 'Observation']],
      body: dataset.inspectionItems.map((it) => [
        doorLookup[it.fire_door_id] || '-',
        it.category,
        it.item_label,
        it.result,
        it.observation || '-',
      ]),
      styles: { fontSize: 7.5, cellPadding: 4 },
      headStyles: { fillColor: [29, 78, 216], textColor: [255, 255, 255] },
      columnStyles: { 2: { cellWidth: 180 }, 4: { cellWidth: 130 } },
    });
    y = (doc as any).lastAutoTable.finalY + 22;
  }

  // Section 3: Deficiencies & Remediation Status
  if (dataset.deficiencies.length > 0) {
    if (y > 650) {
      doc.addPage();
      y = 48;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(
      reportType === 'Outstanding Deficiencies'
        ? 'Outstanding Deficiencies Requiring Remediation'
        : 'Deficiency & Remediation Log',
      40,
      y
    );
    y += 8;

    const doorLookup = Object.fromEntries(dataset.doors.map((d) => [d.id, d.door_code]));
    autoTable(doc, {
      startY: y,
      margin: { left: 40, right: 40 },
      head: [['Code', 'Door', 'Category & Description', 'Severity', 'Status', 'Verification']],
      body: dataset.deficiencies.map((df) => [
        df.deficiency_code,
        doorLookup[df.fire_door_id] || '-',
        `${df.category}: ${df.description}`.slice(0, 140),
        `${df.severity} (${df.priority})`,
        df.status,
        df.verified_by
          ? `Verified by ${df.verified_by}`
          : df.assigned_technician_name
          ? `Tech: ${df.assigned_technician_name}`
          : 'Unassigned',
      ]),
      styles: { fontSize: 7.5, cellPadding: 4.5 },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
      columnStyles: { 2: { cellWidth: 195 } },
    });
    y = (doc as any).lastAutoTable.finalY + 22;
  }

  // Section 4: Photographic Evidence (Inspection + Before/After)
  const photoEvidence = dataset.evidence.filter(
    (e) => e.signed_url && (e.mime_type || '').startsWith('image/')
  );
  if (photoEvidence.length > 0) {
    if (y > 580) {
      doc.addPage();
      y = 48;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('Photographic Evidence Package', 40, y);
    y += 14;

    let col = 0;
    for (const ev of photoEvidence.slice(0, 8)) {
      const dataUrl = await fetchImageAsDataUrl(ev.signed_url);
      if (!dataUrl) continue;
      const x = col === 0 ? 40 : 316;
      if (y > 630) {
        doc.addPage();
        y = 48;
      }
      try {
        const format = (ev.mime_type || '').includes('png') ? 'PNG' : 'JPEG';
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(x, y, 256, 154, 4, 4, 'S');
        doc.addImage(dataUrl, format, x + 6, y + 6, 244, 114);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        doc.text(
          `${ev.evidence_type.replace('_', ' ').toUpperCase()}${ev.immutable ? ' (IMMUTABLE)' : ''}`,
          x + 8,
          y + 132
        );
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text((ev.caption || ev.file_name || '').slice(0, 46), x + 8, y + 144);
      } catch {
        // Skip unsupported image decode
      }
      if (col === 1) {
        col = 0;
        y += 168;
      } else {
        col = 1;
      }
    }
    if (col === 1) y += 168;
  }

  // Professional Review Disclaimer Footer on every page
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const h = doc.internal.pageSize.getHeight();
    doc.setDrawColor(226, 232, 240);
    doc.line(40, h - 42, pageWidth - 40, h - 42);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      'Notice: Inspection records and remediation evidence must be reviewed and certified by qualified fire-door inspection professionals. Software does not independently certify regulatory compliance.',
      40,
      h - 28,
      { maxWidth: pageWidth - 130 }
    );
    doc.text(`Page ${p} of ${pageCount}`, pageWidth - 40, h - 24, { align: 'right' });
  }

  const dataUri = doc.output('datauristring');
  const pdfBase64 = dataUri.split(',')[1];
  return { pdfBase64, doc };
}
