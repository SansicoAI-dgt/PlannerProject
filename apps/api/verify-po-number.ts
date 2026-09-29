import * as xlsx from 'xlsx';
import { PrismaClient } from '@prisma/client';

/**
 * VERIFIKASI PARSER EXCEL "OUTSTANDING PO" (file sumber = hasil PIVOT TABLE).
 *
 * Yang diuji lewat HTTP API asli:
 *   1. FILL-DOWN kolom PO NO / PLAN_RECEIVED_Date / Supplier_Name / UNIT.
 *      Pivot hanya mengisi kolom itu di baris pertama sebuah grup.
 *   2. Reset nilai saat PO NO berubah, dan UNIT yang berubah di tengah PO.
 *   3. MERGED CELL: PO NO hasil merge TIDAK dianggap "PO baru" (kalau dianggap,
 *      tanggal/supplier/unit justru ter-reset jadi kosong).
 *   4. Satu baris Excel = satu record item (tidak digabung per PO).
 *   5. Kolom Qty Delivered dibaca dari POSISI (tanpa header), desimal benar,
 *      dan satuan delivered: kg -> kg, rim -> lembar.
 *   6. Baris "Grand Total" / baris tanpa ITEM_DESC dilewati, bukan error.
 *   7. PO NO wajib — tapi validasi dijalankan SETELAH fill-down.
 *
 * Periode uji dibuat sintetis lalu DIHAPUS lagi di akhir.
 */

const API = 'http://localhost:3001/api/v1';
const EMAIL = 'admin@pdits.com';
const PASSWORD = 'password123';

/** Bulan upload khusus uji; diberi nama jelas supaya tidak tertukar data produksi. */
const TEST_MONTH = '2030-07';

const prisma = new PrismaClient({
  datasourceUrl: 'mysql://root:@localhost:3306/planner_project',
});

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? 'OK   ' : 'GAGAL'} | ${label} -> ${JSON.stringify(actual)}${ok ? '' : `  (harusnya ${JSON.stringify(expected)})`}`,
  );
}

let token = '';
async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function uploadExcel(buffer: Buffer) {
  const form = new FormData();
  form.append('file', new Blob([buffer]), 'outstanding-po-test.xlsx');
  const res = await fetch(`${API}/outstanding-po/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

const HEADER = [
  'PO NO',
  'PLAN_RECEIVED_Date',
  'Supplier_Name',
  'UNIT',
  'ITEM_DESC',
  'Sum of QTY_ORDER',
  null, // Qty Delivered: TIDAK punya header (dibaca dari posisi)
];

function toBuffer(rows: unknown[][], merges?: xlsx.Range[]): Buffer {
  const sheet = xlsx.utils.aoa_to_sheet(rows);
  if (merges) sheet['!merges'] = merges;
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, sheet, 'Sheet1');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/**
 * Fixture utama — meniru file pivot di screenshot:
 *  - L1G000593 = 2 item, L1G000599 = 2 item, L1G000750 = 5 item (4 kg + 1 rim)
 *  - L1G000602 = 1 item dengan delivered desimal 4917.87
 * Kolom PO NO / tanggal / supplier / unit HANYA terisi di baris pertama tiap PO.
 */
function mainWorkbook(): Buffer {
  const M = 'PT. MEGA SURYA ERATAMA';
  const fill = (po: string, date: string, sup: string, unit: string, item: string, order: number, delivered: number) =>
    [po, date, sup, unit, item, order, delivered];

  return toBuffer([
    HEADER,
    // baris 2-3
    fill('L1G000593', '02 May 2026', M, 'rim', 'DUPLEX 270GSM/ 116X97CM', 84, 36200),
    fill('', '', '', '', 'DUPLEX 270GSM/ 86X76.5CM', 56, 26600),
    // baris 4-5
    fill('L1G000599', '02 May 2026', M, 'rim', 'DUPLEX 270 GSM/ 90X102CM', 39.2, 19300),
    fill('', '', '', '', 'DUPLEX 270GSM/ 93.5X132CM', 28, 6300),
    // baris 6-10 (unit berubah di tengah PO: kg -> rim)
    fill('L1G000750', '17 Jun 2026', M, 'kg', 'DUPLEX 270GSM/ 85 CM', 5000, 0),
    fill('', '', '', '', 'DUPLEX 270GSM/ 112CM', 5000, 0),
    fill('', '', '', '', 'DUPLEX 270 GSM/ 86CM', 5000, 0),
    fill('', '', '', '', 'DUPLEX 270GSM/ 87.5CM', 5000, 0),
    fill('', '', '', 'rim', 'DUPLEX 270GSM/ 78.5X70.5CM', 78.4, 0),
    // baris 11
    fill('L1G000602', '11 May 2026', M, 'kg', 'DUPLEX 270 GSM/ 142CM', 5000, 4917.87),
    // baris 12: baris pivot "Grand Total" -> dilewati
    ['Grand Total', '', '', '', null, null, null],
  ]);
}

/** Fixture tepi: baris data pertama tanpa PO NO (harus GAGAL) + merged cell. */
function edgeWorkbook(): Buffer {
  return toBuffer(
    [
      HEADER,
      ['', '02 May 2026', 'PT X', 'kg', 'ITEM-X1', 10, 0], // baris 2 -> GAGAL
      ['L1G9999', '03 May 2026', 'PT X', 'kg', 'ITEM-X2', 20, 5], // baris 3
      ['', '', '', '', 'ITEM-X3', 30, 7], // baris 4 (PO NO hasil merge)
      [null, null, null, null, null, null, null],
    ],
    // PO NO di-merge dari baris 3 ke baris 4 (0-based r=2..3, kolom 0)
    [{ s: { r: 2, c: 0 }, e: { r: 3, c: 0 } }],
  );
}

async function main() {
  console.log('==================================================');
  console.log('VERIFIKASI PARSER EXCEL PIVOT — OUTSTANDING PO');
  console.log('==================================================\n');

  const login = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  if (login.status !== 200 || !login.json?.accessToken) {
    console.error('Gagal login:', login.status, login.json);
    process.exitCode = 1;
    return;
  }
  token = login.json.accessToken;

  // Bersihkan sisa periode uji dari run sebelumnya (aman kalau belum ada).
  const stale = await prisma.planningCycle.findUnique({ where: { uploadMonth: TEST_MONTH } });
  if (stale && stale.id) {
    await prisma.outstandingPO.deleteMany({ where: { periodId: stale.id } });
    await prisma.planningCycle.delete({ where: { id: stale.id } });
  }

  const created = await api('POST', '/material-planning/cycles', {
    uploadMonth: TEST_MONTH,
    notes: 'periode uji parser PO',
  });
  if (created.status !== 201) {
    console.error('Gagal membuat periode uji:', created.status, created.json);
    process.exitCode = 1;
    return;
  }
  const periodId: string = created.json.data.id;

  try {
    // ────────────────────────────────────────────────────────────────
    console.log('--- A. FILL-DOWN (file pivot seperti di screenshot) ---');
    const a = await uploadExcel(mainWorkbook());
    const rowsA: any[] = a.json?.data ?? [];
    check('upload sukses (200)', a.status, 200);
    check('TIDAK ada baris gagal', a.json?.errors?.length, 0);
    check('10 baris data -> 10 record (1 baris = 1 record)', rowsA.length, 10);
    check('baris Grand Total TIDAK jadi record', rowsA.some((r) => /total/i.test(r.itemDesc)), false);

    console.log('\n  L1G000593 (2 item, fill-down tanggal/supplier/unit):');
    check('  item 1 = 116X97CM', rowsA[0]?.itemDesc, 'DUPLEX 270GSM/ 116X97CM');
    check('  item 1 PO Number', rowsA[0]?.poNumber, 'L1G000593');
    check('  item 1 qty order = 84 rim', [rowsA[0]?.qtyOrder, rowsA[0]?.qtyOrderUnit], [84, 'rim']);
    check('  item 1 delivered = 36200 lembar', [rowsA[0]?.qtyDelivered, rowsA[0]?.qtyDeliveredUnit], [36200, 'sheets']);
    check('  item 2 = 86X76.5CM', rowsA[1]?.itemDesc, 'DUPLEX 270GSM/ 86X76.5CM');
    check('  item 2 mewarisi PO Number', rowsA[1]?.poNumber, 'L1G000593');
    check('  item 2 mewarisi tanggal', String(rowsA[1]?.planReceivedDate).slice(0, 10), '2026-05-02');
    check('  item 2 mewarisi supplier', rowsA[1]?.supplierName, 'PT. MEGA SURYA ERATAMA');
    check('  item 2 mewarisi unit', rowsA[1]?.qtyOrderUnit, 'rim');
    check('  item 2 qty order = 56', rowsA[1]?.qtyOrder, 56);
    check('  item 2 delivered = 26600 lembar', [rowsA[1]?.qtyDelivered, rowsA[1]?.qtyDeliveredUnit], [26600, 'sheets']);

    console.log('\n  L1G000599 (2 item, desimal 39.2):');
    check('  item 1 PO Number', rowsA[2]?.poNumber, 'L1G000599');
    check('  item 1 desimal terbaca', rowsA[2]?.qtyOrder, 39.2);
    check('  item 1 delivered', rowsA[2]?.qtyDelivered, 19300);
    check('  item 2 = 93.5X132CM', rowsA[3]?.itemDesc, 'DUPLEX 270GSM/ 93.5X132CM');
    check('  item 2 desimal terbaca', rowsA[3]?.qtyOrder, 28);
    check('  item 2 delivered', rowsA[3]?.qtyDelivered, 6300);

    console.log('\n  L1G000750 (5 item, UNIT berubah kg -> rim di tengah PO):');
    check('  4 item pertama unit kg', rowsA.slice(4, 8).map((r) => r.qtyOrderUnit), ['kg', 'kg', 'kg', 'kg']);
    check('  item 5-9 PO Number sama', rowsA[4]?.poNumber, 'L1G000750');
    check('  item ke-5 unit berubah jadi rim', [rowsA[8]?.qtyOrderUnit, rowsA[8]?.qtyDeliveredUnit], ['rim', 'sheets']);
    check('  item ke-5 PO Number tetap', rowsA[8]?.poNumber, 'L1G000750');
    check('  item ke-5 tanggal tetap (tidak ter-reset)', String(rowsA[8]?.planReceivedDate).slice(0, 10), '2026-06-17');
    check('  item ke-5 qty order 78.4', rowsA[8]?.qtyOrder, 78.4);
    check('  semua item 750 delivered 0', rowsA.slice(4, 9).every((r) => r.qtyDelivered === 0), true);

    console.log('\n  L1G000602 (desimal delivered 4917.87):');
    check('  PO Number', rowsA[9]?.poNumber, 'L1G000602');
    check('  item desc', rowsA[9]?.itemDesc, 'DUPLEX 270 GSM/ 142CM');
    check('  qty order', rowsA[9]?.qtyOrder, 5000);
    check('  delivered desimal terbaca', rowsA[9]?.qtyDelivered, 4917.87);
    check('  unit delivered = kg (mengikuti unit order)', rowsA[9]?.qtyDeliveredUnit, 'kg');

    // ────────────────────────────────────────────────────────────────
    console.log('\n--- B. MERGED CELL + PO NO kosong (validasi setelah fill-down) ---');
    const b = await uploadExcel(edgeWorkbook());
    const rowsB: any[] = b.json?.data ?? [];
    check('baris tanpa PO NO (tidak ada di atasnya) GAGAL', b.json?.errors?.length, 1);
    check('error menyebut baris Excel 2', b.json?.errors?.[0]?.row, 2);
    check('baris valid tetap diproses', rowsB.length, 2);
    check('PO NO hasil MERGE tidak me-reset tanggal', String(rowsB[1]?.planReceivedDate).slice(0, 10), '2026-05-03');
    check('PO NO hasil MERGE tidak me-reset supplier', rowsB[1]?.supplierName, 'PT X');
    check('baris merge ikut terbaca sebagai item', rowsB[1]?.itemDesc, 'ITEM-X3');
    check('baris merge memakai PO Number yang sama', rowsB[1]?.poNumber, 'L1G9999');

    // ────────────────────────────────────────────────────────────────
    console.log('\n--- C. SIMPAN KE PERIODE + LIST (PO Number boleh berulang) ---');
    const goodImport = await api('POST', '/outstanding-po/import', {
      periodId,
      mode: 'overwrite',
      data: rowsA,
    });
    check('import 10 record berhasil (201)', goodImport.status, 201);
    check('10 baris tersimpan', goodImport.json?.count, 10);

    const missingPo = await api('POST', '/outstanding-po/import', {
      periodId,
      mode: 'add',
      data: [{ ...rowsA[0], poNumber: '  ' }],
    });
    check('import baris tanpa PO Number ditolak (400)', missingPo.status, 400);

    const list = await api('GET', `/outstanding-po?periodId=${periodId}`);
    const listRows: any[] = list.json?.data ?? [];
    check('list berisi 10 baris', listRows.length, 10);
    check('jumlah PO Number unik = 4', new Set(listRows.map((r) => r.poNumber)).size, 4);
    check('L1G000750 muncul di 5 baris', listRows.filter((r) => r.poNumber === 'L1G000750').length, 5);
    check('semua baris punya PO Number', listRows.every((r) => Boolean(r.poNumber)), true);

    console.log('\n--- D. ADD MANUAL & EDIT wajib PO Number ---');
    const manualNoPo = await api('POST', '/outstanding-po', {
      periodId,
      planReceivedDate: '2026-07-01',
      supplierName: 'PT. MEGA SURYA ERATAMA',
      itemDesc: 'DUPLEX 270GSM/ 85 CM',
      qtyOrder: 100,
      qtyOrderUnit: 'kg',
      qtyDelivered: 0,
      qtyDeliveredUnit: 'kg',
    });
    check('manual tanpa PO Number ditolak (400)', manualNoPo.status, 400);

    const manual = await api('POST', '/outstanding-po', {
      periodId,
      poNumber: 'L1G000750',
      planReceivedDate: '2026-07-01',
      supplierName: 'PT. MEGA SURYA ERATAMA',
      itemDesc: 'DUPLEX 270GSM/ 85 CM',
      qtyOrder: 100,
      qtyOrderUnit: 'kg',
      qtyDelivered: 0,
      qtyDeliveredUnit: 'kg',
    });
    check('manual dengan PO Number tersimpan (201)', manual.status, 201);
    check('PO Number boleh sama dengan baris lain', manual.json?.data?.poNumber, 'L1G000750');

    const emptyPoEdit = await api('PUT', `/outstanding-po/${listRows[0].id}`, { poNumber: '   ' });
    check('edit dengan PO Number kosong ditolak (400)', emptyPoEdit.status, 400);

    const edit = await api('PUT', `/outstanding-po/${listRows[0].id}`, { poNumber: 'L1G000999' });
    check('edit PO Number berhasil (200)', edit.status, 200);
    check('nilai PO Number terbarui', edit.json?.data?.poNumber, 'L1G000999');
  } finally {
    // Bersihkan periode uji (cascade menghapus baris Outstanding PO-nya).
    // PENGAMAN: `deleteMany({ where: { periodId: undefined } })` di Prisma
    // berarti TANPA filter -> seluruh tabel terhapus. Karena itu id diperiksa
    // lebih dulu.
    if (typeof periodId === 'string' && periodId.length > 0) {
      await prisma.outstandingPO.deleteMany({ where: { periodId } });
      await prisma.planningCycle.delete({ where: { id: periodId } }).catch(() => {});
    } else {
      console.error('PERINGATAN: periodId tidak valid, cleanup dilewati.');
    }
    console.log('\nPeriode uji dibersihkan.');
  }

  console.log('\n==================================================');
  if (failures === 0) console.log('SEMUA PEMERIKSAAN LULUS');
  else console.log(`${failures} PEMERIKSAAN GAGAL`);
  console.log('==================================================');
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error('ERROR:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
