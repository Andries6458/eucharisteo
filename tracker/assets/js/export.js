/* ==========================================================================
   EUCHARISTEO INVOICE TRACKER — Excel / PDF export + clipboard parsing
   Libraries (SheetJS, jsPDF) are loaded on demand from CDN and cached by the
   service worker, so exports work offline after the first use.
   ========================================================================== */

import {
  PARTIES, computeInvoice, summarise, fmtMoney, fmtDate, STATUS_LABEL, fmtNumber,
} from './calc.js';
import { ENTITIES } from './config.js';

const CDN = {
  xlsx: 'https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js',
  jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  autotable: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
  pdfjs: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  pdfworker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if ([...document.scripts].some((s) => s.src === src)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load ' + src));
    document.head.appendChild(s);
  });
}

/* ------------------------------------------------------------------ EXCEL */

export async function exportExcel(invoices, refISO, partyFilter = null) {
  await loadScript(CDN.xlsx);
  const XLSX = window.XLSX;
  const { computed, byParty } = summarise(invoices, refISO);
  const rows = partyFilter ? computed.filter((i) => i.party === partyFilter) : computed;

  const wb = XLSX.utils.book_new();

  // --- Invoice rows ---
  const detail = rows.map((i) => ({
    Party: PARTIES[i.party]?.name || i.party,
    'Invoice No': i.invoiceNumber || '',
    'CT Numbers': (i.ctNumbers || []).join(', '),
    Currency: i.currency || '',
    'Issue Date': i.issueDate || '',
    'Due Date': i.dueDate || '',
    Status: STATUS_LABEL[i._status],
    Net: i._net,
    VAT: i._vat,
    Total: i._total,
    Paid: i._paid,
    Balance: i._balance,
    'Days Overdue': i._daysOverdue || '',
    'Days Since Issue': i._daysSinceIssue ?? '',
    'Days Since Last Payment': i._daysSinceLastPayment ?? '',
    Notes: i.notes || '',
  }));
  const wsDetail = XLSX.utils.json_to_sheet(detail);
  wsDetail['!cols'] = Object.keys(detail[0] || { a: 1 }).map(() => ({ wch: 16 }));
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Invoices');

  // --- Line items ---
  const lines = [];
  rows.forEach((i) => {
    (i.items || []).forEach((it) => {
      lines.push({
        Party: PARTIES[i.party]?.name || i.party,
        'Invoice No': i.invoiceNumber || '',
        Currency: i.currency || '',
        Description: it.description || '',
        Qty: Number(it.qty) || 0,
        'Unit Price': Number(it.unitPrice) || 0,
        'Line Total': (Number(it.qty) || 0) * (Number(it.unitPrice) || 0),
      });
    });
  });
  if (lines.length) {
    const wsLines = XLSX.utils.json_to_sheet(lines);
    wsLines['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 10 }, { wch: 36 }, { wch: 10 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsLines, 'Line Items');
  }

  // --- Summary ---
  const sum = [];
  Object.entries(byParty).forEach(([pk, p]) => {
    if (partyFilter && pk !== partyFilter) return;
    Object.entries(p.currencies).forEach(([cur, c]) => {
      sum.push({
        Party: PARTIES[pk]?.name || pk,
        Currency: cur,
        Invoices: c.count,
        'Overdue Count': c.overdue,
        Net: c.net, VAT: c.vat,
        'Total Invoiced': c.invoiced,
        'Total Paid': c.paid,
        Outstanding: c.outstanding,
      });
    });
  });
  const wsSum = XLSX.utils.json_to_sheet(sum);
  wsSum['!cols'] = Object.keys(sum[0] || { a: 1 }).map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, wsSum, 'Summary');

  const name = `Eucharisteo-Invoices-${partyFilter || 'All'}-${refISO}.xlsx`;
  XLSX.writeFile(wb, name);
}

/* -------------------------------------------------------------------- PDF */

export async function exportPDF(invoices, refISO, partyFilter = null) {
  await loadScript(CDN.jspdf);
  await loadScript(CDN.autotable);
  const { jsPDF } = window.jspdf;
  const { computed, byParty } = summarise(invoices, refISO);
  const rows = partyFilter ? computed.filter((i) => i.party === partyFilter) : computed;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const gold = [166, 129, 79];
  const navy = [10, 14, 26];
  const W = doc.internal.pageSize.getWidth();

  // header
  doc.setFillColor(...navy); doc.rect(0, 0, W, 70, 'F');
  doc.setTextColor(...gold); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text('Eucharisteo Trading', 40, 32);
  doc.setTextColor(245, 241, 235); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  const title = partyFilter
    ? `${PARTIES[partyFilter]?.name} — Invoice Statement`
    : 'Invoice Statement — All Parties';
  doc.text(title, 40, 50);
  doc.setFontSize(8);
  doc.text(`EC Trading LDA (Mozambique / Vulcan)  ·  Eucharisteo Trading (Pty) Ltd (RSA / AMSA)  ·  ${fmtDate(refISO)}`, 40, 62);

  // summary blocks
  let y = 90;
  doc.setTextColor(...navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text('Summary', 40, y); y += 8;

  const sumBody = [];
  Object.entries(byParty).forEach(([pk, p]) => {
    if (partyFilter && pk !== partyFilter) return;
    Object.entries(p.currencies).forEach(([cur, c]) => {
      sumBody.push([
        PARTIES[pk]?.name || pk, cur, String(c.count), String(c.overdue),
        fmtMoney(c.invoiced, cur), fmtMoney(c.paid, cur), fmtMoney(c.outstanding, cur),
      ]);
    });
  });
  doc.autoTable({
    startY: y + 4,
    head: [['Party', 'Cur', 'Invoices', 'Overdue', 'Invoiced', 'Paid', 'Outstanding']],
    body: sumBody,
    theme: 'grid',
    headStyles: { fillColor: navy, textColor: gold, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    margin: { left: 40, right: 40 },
  });

  // detail table
  const body = rows
    .sort((a, b) => (a.party + (a.dueDate || '')).localeCompare(b.party + (b.dueDate || '')))
    .map((i) => ([
      PARTIES[i.party]?.short || i.party,
      i.invoiceNumber || '',
      (i.ctNumbers || []).join(', '),
      i.currency || '',
      fmtDate(i.issueDate),
      fmtDate(i.dueDate),
      STATUS_LABEL[i._status] + (i._daysOverdue ? ` (${i._daysOverdue}d)` : ''),
      fmtMoney(i._total, i.currency),
      fmtMoney(i._paid, i.currency),
      fmtMoney(i._balance, i.currency),
    ]));

  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 18,
    head: [['Party', 'Invoice', 'CT Numbers', 'Cur', 'Issued', 'Due', 'Status', 'Total', 'Paid', 'Balance']],
    body,
    theme: 'striped',
    headStyles: { fillColor: navy, textColor: gold, fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    columnStyles: { 7: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'right' } },
    margin: { left: 40, right: 40 },
    didDrawPage: () => {
      const n = doc.internal.getNumberOfPages();
      doc.setFontSize(7); doc.setTextColor(120);
      doc.text(`Page ${n}`, W - 60, doc.internal.pageSize.getHeight() - 16);
    },
  });

  doc.save(`Eucharisteo-Statement-${partyFilter || 'All'}-${refISO}.pdf`);
}

/* ------------------------------------------------- single invoice as PDF */

export async function exportInvoicePDF(rawInvoice, refISO) {
  await loadScript(CDN.jspdf);
  await loadScript(CDN.autotable);
  const { jsPDF } = window.jspdf;
  const i = computeInvoice(rawInvoice, refISO);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const gold = [166, 129, 79], navy = [10, 14, 26];
  const W = doc.internal.pageSize.getWidth();

  const party = PARTIES[i.party] || {};
  const ent = ENTITIES[party.selfEntityKey] || {};
  const isRec = party.direction === 'RECEIVABLE';
  doc.setFillColor(...navy); doc.rect(0, 0, W, 80, 'F');
  doc.setTextColor(...gold); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text(ent.name || 'Eucharisteo Trading', 40, 34);
  doc.setTextColor(245, 241, 235); doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text(`${isRec ? 'Invoice to' : 'Invoice from'}: ${party.name || i.party}`, 40, 54);
  doc.setFontSize(8);
  const idLine = [
    ent.reg && `${ent.regLabel || 'Reg'} ${ent.reg}`,
    ent.vatNo && `VAT ${ent.vatNo}`,
    ent.taxNo && `NUIT ${ent.taxNo}`,
    ent.country, i.currency,
  ].filter(Boolean).join(' · ');
  doc.text(idLine, 40, 68);
  if (ent.address) {
    doc.setTextColor(150, 150, 150); doc.setFontSize(8);
    doc.text(ent.address, 40, 96);
  }

  let y = 110;
  doc.setTextColor(...navy); doc.setFontSize(10);
  const meta = [
    ['Invoice No', i.invoiceNumber || '—'],
    ['CT Numbers', (i.ctNumbers || []).join(', ') || '—'],
    ['Issue Date', fmtDate(i.issueDate)],
    ['Due Date', fmtDate(i.dueDate)],
    ['Status', STATUS_LABEL[i._status] + (i._daysOverdue ? ` (${i._daysOverdue} days overdue)` : '')],
  ];
  meta.forEach(([k, v]) => {
    doc.setFont('helvetica', 'bold'); doc.text(k + ':', 40, y);
    doc.setFont('helvetica', 'normal'); doc.text(String(v), 150, y);
    y += 16;
  });

  doc.autoTable({
    startY: y + 6,
    head: [['Description', 'Qty', 'Unit Price', 'Line Total']],
    body: (i.items || []).map((it) => ([
      it.description || '',
      fmtNumber(it.qty, 2),
      fmtMoney(it.unitPrice, i.currency),
      fmtMoney((Number(it.qty) || 0) * (Number(it.unitPrice) || 0), i.currency),
    ])),
    theme: 'grid',
    headStyles: { fillColor: navy, textColor: gold },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    margin: { left: 40, right: 40 },
  });

  let ty = doc.lastAutoTable.finalY + 16;
  const totals = [
    ['Net', fmtMoney(i._net, i.currency)],
    ['VAT', fmtMoney(i._vat, i.currency)],
    ['Total', fmtMoney(i._total, i.currency)],
    ['Paid', fmtMoney(i._paid, i.currency)],
    ['Balance Due', fmtMoney(i._balance, i.currency)],
  ];
  totals.forEach(([k, v], idx) => {
    doc.setFont('helvetica', idx >= 2 ? 'bold' : 'normal');
    doc.text(k, W - 220, ty);
    doc.text(v, W - 40, ty, { align: 'right' });
    ty += 16;
  });

  if ((rawInvoice.payments || []).length) {
    doc.autoTable({
      startY: ty + 10,
      head: [['Payment Date', 'Amount', 'Note']],
      body: rawInvoice.payments.map((p) => ([fmtDate(p.date), fmtMoney(p.amount, i.currency), p.note || ''])),
      theme: 'striped',
      headStyles: { fillColor: navy, textColor: gold },
      margin: { left: 40, right: 40 },
    });
  }

  doc.save(`Invoice-${i.invoiceNumber || i.id}.pdf`);
}

/* ------------------------------------------------- clipboard / paste parse */

/**
 * Read a dropped/selected spreadsheet file (.xlsx/.xls/.csv) into an array of
 * row arrays — same shape parseTable() returns, so the importer is shared.
 */
export async function readSpreadsheet(file) {
  const name = (file.name || '').toLowerCase();
  if (name.endsWith('.csv')) {
    return parseTable(await file.text());
  }
  await loadScript(CDN.xlsx);
  const XLSX = window.XLSX;
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' })
    .map((row) => row.map((c) => (c == null ? '' : String(c).trim())));
}

/** Extract the text layer from a PDF (returns '' for scanned/image-only PDFs). */
export async function readPdfText(file) {
  await loadScript(CDN.pdfjs);
  const pdfjsLib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
  pdfjsLib.GlobalWorkerOptions.workerSrc = CDN.pdfworker;
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    text += content.items.map((it) => it.str).join(' ') + '\n';
  }
  return text;
}

/**
 * Parse pasted spreadsheet text (TSV from Excel, or CSV). Returns array of
 * arrays. Handles quoted CSV cells.
 */
export function parseTable(text) {
  const rows = [];
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const hasTab = text.includes('\t');
  for (const line of lines) {
    if (line.trim() === '') continue;
    if (hasTab) {
      rows.push(line.split('\t').map((c) => c.trim()));
    } else {
      rows.push(parseCsvLine(line));
    }
  }
  return rows;
}

function parseCsvLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}
