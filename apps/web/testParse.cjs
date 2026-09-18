const fs = require('fs');
const XLSX = require('xlsx');
const wb = XLSX.readFile('../../../NEXT Week Daily Production Schedule.xlsm');
const ws = wb.Sheets['FA_Attach'];
const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
let headerRow = -1;
for(let r=0; r<=Math.min(20, range.e.r); r++){
  const cellB = ws[XLSX.utils.encode_cell({r, c:1})];
  if(cellB && String(cellB.v).trim().toLowerCase() === 'toy name') {
    headerRow = r;
    break;
  }
}
const shiftColumns = [];
let lastDateStr = '';
for (let c = 2; c <= range.e.c; c++) {
  const headerCell = ws[XLSX.utils.encode_cell({ r: headerRow, c })];
  if (headerCell && headerCell.v != null) {
    let dateStr = '';
    if (typeof headerCell.v === 'number' && headerCell.v > 40000) {
      const utcDays = Math.floor(headerCell.v - 25569);
      const d = new Date(utcDays * 86400 * 1000);
      dateStr = d.toISOString().split('T')[0];
    } else if (typeof headerCell.v === 'string') {
      const trimmed = headerCell.v.trim();
      if (trimmed.match(/^\d{1,2}-[A-Za-z]{3}-\d{2,4}$/) || trimmed.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/)) {
        const d = new Date(trimmed);
        if (!isNaN(d.getTime())) { dateStr = d.toISOString().split('T')[0]; }
      }
    }
    if (dateStr) lastDateStr = dateStr;
  }
  const subCell = ws[XLSX.utils.encode_cell({ r: headerRow + 1, c })];
  if (subCell && typeof subCell.v === 'string') {
    const subTrim = subCell.v.trim().toLowerCase();
    if (subTrim.includes('shift 1')) shiftColumns.push({ col: c, date: lastDateStr, shiftNum: 1 });
    else if (subTrim.includes('shift 2')) shiftColumns.push({ col: c, date: lastDateStr, shiftNum: 2 });
    else if (subTrim.includes('shift 3')) shiftColumns.push({ col: c, date: lastDateStr, shiftNum: 3 });
  }
}
const results = [];
const dataStartRow = headerRow + 2;
let currentToyName = '';
for (let r = dataStartRow; r <= range.e.r; r++) {
  const cellB = ws[XLSX.utils.encode_cell({ r, c: 1 })];
  const cellC = ws[XLSX.utils.encode_cell({ r, c: 3 })]; // Column D (Part Number is at index 3)
  const colBVal = cellB && cellB.v != null ? String(cellB.v).trim() : '';
  const colCVal = cellC && cellC.v != null ? String(cellC.v).trim() : '';
  if (!colBVal && !colCVal) continue;
  if (colBVal.toLowerCase() === 'total') continue;
  let totalQty = 0;
  for (const sc of shiftColumns) {
    const qtyCell = ws[XLSX.utils.encode_cell({ r, c: sc.col })];
    if (qtyCell && typeof qtyCell.v === 'number') totalQty += qtyCell.v;
  }
  const isCValEmpty = !colCVal || colCVal === '0' || colCVal === '0.0' || colCVal === '0.00';
  if (colBVal && isCValEmpty && totalQty === 0) {
    currentToyName = colBVal;
    continue;
  }
  if (colBVal) {
    const hasPartNumber = !isCValEmpty;
    const partNumber = hasPartNumber ? colCVal : colBVal;
    for (const sc of shiftColumns) {
      const qtyCell = ws[XLSX.utils.encode_cell({ r, c: sc.col })];
      const qty = qtyCell && typeof qtyCell.v === 'number' ? qtyCell.v : 0;
      if (qty > 0) {
        results.push({ toyName: currentToyName, masterCarton: colBVal, itemCode: partNumber, date: sc.date, shift: sc.shiftNum, quantity: Math.round(qty * 1000) });
      }
    }
  }
}
console.log('Parsed FA_Attach:', results.length);
if (results.length > 0) console.log(results[0]);

