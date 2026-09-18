import type { MaterialCalcResponse } from '../hooks/useMaterialCalc';

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function num(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function weekLabel(date: string): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '-';
  return `${parsed.getMonth() + 1}/${parsed.getDate()}`;
}

function valueCell(value: number): string {
  const cls = value < 0 ? ' class="neg"' : '';
  return `<td${cls}>${num(value)}</td>`;
}

function summaryRow(label: string, values: number[], width: number): string {
  const cells = values.map(valueCell).join('');
  const dashes = new Array(Math.max(0, width - values.length))
    .fill(0)
    .map(() => '<td>—</td>')
    .join('');
  return `<tr><td colspan="7" class="label">${esc(label)}</td>${cells}${dashes}</tr>`;
}

function stockRow(stockAsOf: number, width: number): string {
  const rest = new Array(Math.max(0, width - 1))
    .fill(0)
    .map(() => '<td>—</td>')
    .join('');
  return `<tr><td colspan="7" class="label">Stock As Of</td><td>${num(stockAsOf)}</td>${rest}</tr>`;
}

function groupTableHtml(group: NonNullable<MaterialCalcResponse['groups']>[number]): string {
  const matrix = group.weeklyMatrix;
  if (!matrix || !matrix.columns.length) return '';

  const weekHeaders = matrix.columns
    .map(
      (col) =>
        `<th>${esc(col.poMonthLabel)}<br/><span class="muted">${weekLabel(col.weekStartDate)}</span></th>`,
    )
    .join('');

  const partRows = matrix.rows
    .map(
      (row) => `<tr>
        <td>${esc(row.partNumber)}</td>
        <td>${esc(row.productName)}</td>
        <td>${esc(row.gsm)}</td>
        <td>${esc(row.width)}</td>
        <td>${esc(row.length)}</td>
        <td>${row.up}</td>
        <td>${num(row.kgPerSheet, 4)}</td>
        ${row.weeks.map(valueCell).join('')}
      </tr>`,
    )
    .join('');

  const summary = matrix.summary;
  const width = matrix.columns.length;
  const summaryHtml = [
    summaryRow('Total Req', summary.totalReq, width),
    summaryRow('Allowance (5%)', summary.allowance, width),
    summaryRow('Total + Allowance', summary.totalPlusAllowance, width),
    stockRow(summary.stockAsOf, width),
    summaryRow('Outstanding PO', summary.outstandingPo, width),
    summaryRow('End Ind', summary.endInd, width),
  ].join('');

  return `<section class="group">
    <h2>${esc(group.ukuran)}</h2>
    <div class="meta">Gramatur: ${esc(group.gramatur || '—')} &middot; Supplier: ${esc(
      group.supplier,
    )} &middot; Lead Time: ${group.leadTimeMonths} bln &middot; ${group.details.length} part</div>
    <table>
      <thead>
        <tr>
          <th>Part Number</th>
          <th>Description</th>
          <th>GSM</th>
          <th>Width</th>
          <th>Length</th>
          <th>Up</th>
          <th>Kg</th>
          ${weekHeaders}
        </tr>
      </thead>
      <tbody>
        ${partRows}
        ${summaryHtml}
      </tbody>
    </table>
  </section>`;
}

export function printMaterialCalculation(data: MaterialCalcResponse): void {
  const groupsHtml = data.groups.map(groupTableHtml).join('');

  const html = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<title>Material Calculation</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 9px;
    color: #111;
    margin: 18px;
  }
  h1 { font-size: 16px; margin: 0 0 4px; }
  .subtitle { font-size: 10px; color: #555; margin-bottom: 14px; }
  h2 { font-size: 12px; margin: 14px 0 2px; }
  .meta { font-size: 9px; color: #555; margin-bottom: 4px; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 10px; }
  th, td { border: 1px solid #ccc; padding: 3px 5px; text-align: right; white-space: nowrap; }
  th { background: #eef0f3; font-weight: 600; text-align: center; }
  thead th:nth-child(1), thead th:nth-child(2) { text-align: left; }
  td:nth-child(1), td:nth-child(2) { text-align: left; }
  .neg { color: #c00; font-weight: 600; }
  .label { text-align: left; font-weight: 600; background: #f7f8fa; }
  .muted { color: #777; font-weight: 400; }
  .group { page-break-inside: auto; }
  @page { size: A4 landscape; margin: 12mm; }
</style>
</head>
<body>
  <h1>Material Calculation</h1>
  <div class="subtitle">
    Periode MRP: ${esc(new Date(data.periodStartDate).toLocaleDateString('id-ID'))} - ${esc(
      new Date(data.periodEndDate).toLocaleDateString('id-ID'),
    )} &middot; Dihitung pada: ${esc(new Date(data.calculatedAt).toLocaleString('id-ID'))}
  </div>
  ${groupsHtml}
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    alert('Pop-up diblokir. Izinkan pop-up untuk halaman ini agar bisa export PDF.');
    return;
  }

  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    try {
      win.focus();
      setTimeout(() => win.print(), 300);
    } catch {
      /* the print dialog may already be handled by the browser */
    }
  };

  win.addEventListener('load', triggerPrint);
  // Fallback if load already fired before the listener attached.
  setTimeout(() => {
    if (win.document.readyState === 'complete') triggerPrint();
  }, 500);
}
