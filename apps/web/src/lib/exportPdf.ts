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

/** Sel minggu: baris atas = sheet (lembar), baris bawah = kg (+ nomor PO kecil). */
function unitCell(
  sheet: number | undefined,
  kg: number | undefined,
  hasKg: boolean,
  poNumbers?: string[],
): string {
  const cls = (value: number) => (value < 0 ? ' class="neg"' : '');
  const sheetValue = sheet ?? 0;
  const kgValue = kg ?? 0;
  const kgLine = hasKg
    ? `<span class="sub${kgValue < 0 ? ' neg' : ''}">${num(kgValue)} kg</span>`
    : '<span class="sub muted">—</span>';
  // Nomor PO: caption kecil berwarna sekunder di bawah baris kg.
  const poLine =
    poNumbers && poNumbers.length > 0
      ? `<span class="sub" style="font-size:9px;color:#818cf8">${esc(poNumbers.join(', '))}</span>`
      : '';
  return `<td${cls(sheetValue)}>${num(sheetValue, 0)} lbr${kgLine}${poLine}</td>`;
}

function summaryRow(
  label: string,
  sheetValues: number[] | undefined,
  kgValues: number[] | undefined,
  hasKg: boolean,
  width: number,
  poNumbersPerWeek?: string[][],
): string {
  const cells = new Array(Math.max(0, width))
    .fill(0)
    .map((_, i) => unitCell(sheetValues?.[i], kgValues?.[i], hasKg, poNumbersPerWeek?.[i]))
    .join('');
  return `<tr><td colspan="7" class="label">${esc(label)}</td>${cells}</tr>`;
}

function stockRow(stockAsOfSheet: number | undefined, stockAsOfKg: number | undefined, hasKg: boolean, width: number): string {
  const first = unitCell(stockAsOfSheet, stockAsOfKg, hasKg);
  const rest = new Array(Math.max(0, width - 1))
    .fill(0)
    .map(() => '<td>—</td>')
    .join('');
  return `<tr><td colspan="7" class="label">Stock As Of</td>${first}${rest}</tr>`;
}

const MATERIAL_LABELS: Record<string, string> = {
  Paper: 'Paper',
  PET: 'PET (R-PET)',
  Flute: 'Flute / Duplek',
  Lainnya: 'Tanpa Data NPOF / Lainnya',
};

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
        <td>${row.hasKg === false ? '—' : num(row.kgPerSheet, 4)}</td>
        ${row.weeks.map((value, index) => unitCell(row.weeksSheet?.[index], value, row.hasKg !== false)).join('')}
      </tr>`,
    )
    .join('');

  const summary = matrix.summary;
  const width = matrix.columns.length;
  const hasKg = Boolean(group.hasKg ?? matrix.rows.some((row) => row.hasKg));
  const summaryHtml = [
    summaryRow('Total Req (lbr / kg)', summary.totalReqSheet, summary.totalReq, hasKg, width),
    summaryRow('Allowance (5%)', summary.allowanceSheet, summary.allowance, hasKg, width),
    summaryRow('Total + Allowance', summary.totalPlusAllowanceSheet, summary.totalPlusAllowance, hasKg, width),
    stockRow(summary.stockAsOfSheet, summary.stockAsOf, hasKg, width),
    summaryRow('Outstanding PO', summary.outstandingPoSheet, summary.outstandingPo, hasKg, width, summary.outstandingPoNumbers),
    summaryRow('End Ind', summary.endIndSheet, summary.endInd, hasKg, width),
  ].join('');

  const status = group.isSufficient
    ? `Tercukupi, sisa ${num(group.surplusSheet, 0)} lbr${group.hasKg ? ` / ${num(group.surplusKg)} kg` : ''}`
    : `Kurang ${num(group.totalShortageSheet, 0)} lbr${group.hasKg ? ` / ${num(group.totalShortageKg)} kg` : ''}`;

  return `<section class="group">
    <h2>${esc(group.ukuran)}</h2>
    <div class="meta">Material: ${esc(
      MATERIAL_LABELS[group.materialType || 'Lainnya'] || group.materialType || '—',
    )} &middot; Gramatur: ${esc(group.gramatur || '—')} &middot; Supplier: ${esc(
      group.supplier,
    )} &middot; Lead Time: ${group.leadTimeMonths} bln &middot; ${group.details.length} part &middot; ${esc(status)}</div>
    <div class="meta muted">Setiap kolom minggu: baris atas = sheet (lembar), baris bawah = kg.</div>
    <table>
      <thead>
        <tr>
          <th>Part Number</th>
          <th>Description</th>
          <th>GSM</th>
          <th>Width</th>
          <th>Length</th>
          <th>Up</th>
          <th>Kg/Lembar</th>
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
  const folders = new Map<string, NonNullable<MaterialCalcResponse['groups']>>();
  for (const group of data.groups) {
    const family = group.materialType || 'Lainnya';
    const list = folders.get(family);
    if (list) list.push(group);
    else folders.set(family, [group]);
  }

  const groupsHtml = [...folders.entries()]
    .sort((a, b) => {
      const order = ['Paper', 'PET', 'Flute', 'Lainnya'];
      const ai = order.indexOf(a[0]);
      const bi = order.indexOf(b[0]);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })
    .map(
      ([family, groups]) => `<section class="folder">
        <h1 class="folder-title">Folder: ${esc(MATERIAL_LABELS[family] || family)} (${groups.length} grup)</h1>
        ${groups.map(groupTableHtml).join('')}
      </section>`,
    )
    .join('');

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
  .sub { display: block; font-size: 8px; color: #666; font-weight: 400; }
  .sub.neg { color: #c00; font-weight: 600; }
  .label { text-align: left; font-weight: 600; background: #f7f8fa; }
  .muted { color: #777; font-weight: 400; }
  .folder-title { font-size: 13px; background: #e8eefc; border: 1px solid #c8d6f5; padding: 5px 8px; border-radius: 4px; margin: 18px 0 6px; }
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
