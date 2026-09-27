import { PrismaClient } from '@prisma/client';

/**
 * TEST ISOLASI ANTAR PERIODE (Fase 10).
 *
 * Membuktikan janji utama rancangan: mengupload / mengubah data di satu periode
 * TIDAK boleh mengubah periode lain.
 *
 * Diuji lewat HTTP API yang asli (bukan memanggil fungsi internal), supaya
 * route, hak akses, query, dan constraint database ikut teruji.
 *
 * Perbandingan angka memakai TOLERANSI, bukan kecocokan persis, karena kolom
 * JSON MySQL merapikan notasi bilangan (mis. 0.30000000000000004 menjadi 0.3).
 * Selisihnya ~1e-16 dan tidak berarti; yang penting jumlah part, flag
 * kecukupan, dan nilai kg tidak berubah secara nyata.
 *
 * Periode uji dibuat lalu DIHAPUS lagi di akhir, jadi tidak meninggalkan sampah.
 */

// ⚠️ SKRIP INI BELUM DIPERBARUI (2026-09-28) — JANGAN DIPAKAI DULU.
//
// Alasan:
//  1. Ia memakai endpoint `POST /material-planning/cycles/:id/import` yang sudah
//     DIHAPUS. Upload sekarang lewat halaman Master Data:
//       MRP          -> POST /weekly-schedule/bulk   { records, saveMode, periodId }
//       HOTLIST      -> POST /hotlist/import         { data, mode, periodId }
//       STOCK_RM     -> POST /stock-raw-material/import   { data, mode, periodId }
//       OUTSTANDING_PO -> POST /outstanding-po/import     { data, mode, periodId }
//       WIP          -> POST /wip/bulk               { records, saveMode, periodId }
//  2. Fixture di bawah dibaca dari tabel Master Data, yang sejak migrasi
//     20260928000000_master_data_period SUDAH DIKOSONGKAN. Fixture harus dibuat
//     sintetis (mis. 3 part x 4 minggu) supaya tes ini jalan di DB kosong.
//
// Yang MASIH valid dan berguna untuk dipertahankan: struktur pemeriksaan
// (check 1..10) — isolasi antar periode, re-upload menimpa bukan menumpuk,
// tanda STALE, audit, hanya satu hasil current, NPOF tidak tersentuh.
//
const API = 'http://localhost:3001/api/v1';
const EMAIL = 'admin@pdits.com';
const PASSWORD = 'password123';

/** Toleransi perbandingan kg. 1e-6 kg = 1 mikrogram. */
const TOL = 1e-6;

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
      // Content-Type hanya dikirim kalau memang ada body. Kalau tidak,
      // Fastify menolak dengan "Body cannot be empty".
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

interface Row {
  kgNet2: number;
  allocatedKg: number;
  shortageKg: number;
  isSufficient: boolean;
}

/** Ubah hasil menjadi peta partNumber -> angka pentingnya. */
function rowMapOf(result: any): Map<string, Row> {
  const out = new Map<string, Row>();
  for (const g of result?.groups ?? []) {
    for (const d of g.details ?? []) {
      out.set(String(d.partNumber), {
        kgNet2: Number(d.kgNet2 ?? 0),
        allocatedKg: Number(d.allocatedKg ?? 0),
        shortageKg: Number(d.shortageKg ?? 0),
        isSufficient: Boolean(d.isSufficient),
      });
    }
  }
  return out;
}

/** Bandingkan dua hasil dengan toleransi; laporkan penyimpangan terbesar. */
function compareResults(label: string, expected: any, actual: any) {
  const a = rowMapOf(expected);
  const b = rowMapOf(actual);

  const missing = [...a.keys()].filter((k) => !b.has(k));
  const extra = [...b.keys()].filter((k) => !a.has(k));
  let maxDelta = 0;
  let flagDiff = 0;
  let overTol = 0;

  for (const [k, va] of a) {
    const vb = b.get(k);
    if (!vb) continue;
    const delta = Math.max(
      Math.abs(va.kgNet2 - vb.kgNet2),
      Math.abs(va.allocatedKg - vb.allocatedKg),
      Math.abs(va.shortageKg - vb.shortageKg),
    );
    if (delta > maxDelta) maxDelta = delta;
    if (va.isSufficient !== vb.isSufficient) flagDiff += 1;
    if (delta > TOL) overTol += 1;
  }

  const ok = missing.length === 0 && extra.length === 0 && flagDiff === 0 && overTol === 0;
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'OK   ' : 'GAGAL'} | ${label} -> ${a.size} part, selisih maks ${maxDelta.toExponential(2)} kg` +
      `${ok ? '' : `  (hilang=${missing.length} tambahan=${extra.length} beda-flag=${flagDiff} lewat-toleransi=${overTol})`}`,
  );
}

/** Apakah dua hasil berbeda secara nyata (dipakai untuk membuktikan perubahan). */
function resultsDiffer(x: any, y: any): boolean {
  const a = rowMapOf(x);
  const b = rowMapOf(y);
  if (a.size !== b.size) return true;
  for (const [k, va] of a) {
    const vb = b.get(k);
    if (!vb) return true;
    if (va.isSufficient !== vb.isSufficient) return true;
    if (Math.abs(va.kgNet2 - vb.kgNet2) > TOL) return true;
    if (Math.abs(va.allocatedKg - vb.allocatedKg) > TOL) return true;
  }
  return false;
}

async function main() {
  console.log('==================================================');
  console.log('TEST ISOLASI ANTAR PERIODE');
  console.log('==================================================\n');

  const login = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  if (login.status !== 200 || !login.json?.accessToken) {
    console.error('Gagal login:', login.status, login.json);
    process.exitCode = 1;
    return;
  }
  token = login.json.accessToken;
  console.log('Login berhasil.\n');

  // ── Siapkan data uji dari tabel live (pakai data penuh) ────────────────
  const [mrpRaw, hotlistRaw, stockRaw, poRaw, wipRaw] = await Promise.all([
    prisma.weeklySchedule.findMany({ include: { item: true } }),
    prisma.hotlist.findMany(),
    prisma.stockRawMaterial.findMany(),
    prisma.outstandingPO.findMany(),
    prisma.wIP.findMany({ include: { item: true } }),
  ]);

  const mrpFixture = mrpRaw.map((r) => ({
    partNumber: r.item.partNumber,
    description: r.item.itemName,
    year: r.year,
    weekNumber: r.weekNumber,
    weekStartDate: r.weekStartDate,
    weekEndDate: r.weekEndDate,
    quantity: r.quantity,
  }));
  const hotlistFixture = hotlistRaw.map((h) => ({ partNumber: h.partNumber, biTotal: h.biTotal }));
  const stockFixture = stockRaw.map((s) => ({
    itemDesc: s.itemDesc,
    supplier: s.supplier,
    qty: s.qty,
    unit: s.unit,
    date: s.date,
  }));
  const poFixture = poRaw.map((p) => ({
    itemDesc: p.itemDesc,
    supplierName: p.supplierName,
    qtyOrder: p.qtyOrder,
    qtyOrderUnit: p.qtyOrderUnit,
    qtyDelivered: p.qtyDelivered,
    qtyDeliveredUnit: p.qtyDeliveredUnit,
    planReceivedDate: p.planReceivedDate,
  }));
  const wipFixture = wipRaw.map((w) => ({
    partNumber: w.item.partNumber,
    location: w.location,
    quantity: w.quantity,
  }));
  const mrpFixtureB = mrpFixture.map((r) => ({ ...r, quantity: r.quantity / 2 }));

  console.log(`Data uji: MRP ${mrpFixture.length} baris, WIP ${wipFixture.length}, HOTLIST ${hotlistFixture.length}\n`);

  const createdIds: string[] = [];
  const cleanup = async () => {
    for (const id of createdIds) await api('DELETE', `/material-planning/cycles/${id}`);
  };

  try {
    // ── 1. Periode A ──────────────────────────────────────────────────────
    const createA = await api('POST', '/material-planning/cycles', {
      uploadMonth: '2030-01',
      notes: 'periode uji isolasi A',
    });
    if (createA.status !== 201) {
      console.error('Gagal membuat periode A:', createA.status, createA.json);
      process.exitCode = 1;
      return;
    }
    const cycleA = createA.json.data.id;
    createdIds.push(cycleA);

    for (const [source, data] of [
      ['MRP', mrpFixture],
      ['HOTLIST', hotlistFixture],
      ['STOCK_RM', stockFixture],
      ['OUTSTANDING_PO', poFixture],
      ['WIP', wipFixture],
    ] as const) {
      const imp = await api('POST', `/material-planning/cycles/${cycleA}/import`, { source, data });
      if (imp.status !== 200) {
        console.error(`Gagal import ${source}:`, imp.status, imp.json);
        process.exitCode = 1;
        return;
      }
    }

    const detailA1 = await api('GET', `/material-planning/cycles/${cycleA}`);
    const countsA1 = detailA1.json.data.rowCounts;

    const calcA1 = await api('POST', `/material-planning/cycles/${cycleA}/calculate`);
    if (calcA1.status !== 201) {
      console.error('Gagal menghitung periode A:', calcA1.status, calcA1.json);
      process.exitCode = 1;
      return;
    }
    console.log('── Periode A (2030-01) dibuat & dihitung ──');
    console.log(`   baris: MRP=${countsA1.MRP} WIP=${countsA1.WIP} HOTLIST=${countsA1.HOTLIST}`);
    console.log(`   hasil: ${calcA1.json.data.totals.partCount} part, ${calcA1.json.data.totals.partsWithStock} dapat stok\n`);

    // ── 2. Periode B dengan data berbeda ──────────────────────────────────
    const createB = await api('POST', '/material-planning/cycles', {
      uploadMonth: '2030-02',
      notes: 'periode uji isolasi B',
    });
    if (createB.status !== 201) {
      console.error('Gagal membuat periode B:', createB.status, createB.json);
      process.exitCode = 1;
      return;
    }
    const cycleB = createB.json.data.id;
    createdIds.push(cycleB);

    for (const [source, data] of [
      ['MRP', mrpFixtureB],
      ['HOTLIST', hotlistFixture],
      ['STOCK_RM', stockFixture],
      ['OUTSTANDING_PO', poFixture],
      ['WIP', wipFixture],
    ] as const) {
      await api('POST', `/material-planning/cycles/${cycleB}/import`, { source, data });
    }
    const calcB1 = await api('POST', `/material-planning/cycles/${cycleB}/calculate`);
    console.log('── Periode B (2030-02) dibuat dengan MRP berbeda ──');
    console.log(`   hasil: ${calcB1.json.data.totals.partCount} part\n`);

    // ── 3. Cek ulang A: TIDAK BOLEH berubah ───────────────────────────────
    const detailA2 = await api('GET', `/material-planning/cycles/${cycleA}`);
    check('3a. Baris data periode A tidak berubah setelah periode B dibuat', detailA2.json.data.rowCounts, countsA1);

    const resultA2 = await api('GET', `/material-planning/cycles/${cycleA}/results`);
    const currentA2 = resultA2.json.data.find((r: any) => r.isCurrent);
    const fullA2 = await api('GET', `/material-planning/cycles/${cycleA}/results/${currentA2.id}`);
    compareResults('3b. Hasil periode A tetap sama', calcA1.json.data, fullA2.json.data.resultSnapshot);
    check('3c. Hasil periode B berbeda dari A (data memang beda)', resultsDiffer(calcA1.json.data, calcB1.json.data), true);

    // ── 4. Ubah data di A, hitung ulang: B TIDAK BOLEH berubah ────────────
    const mrpHalf = mrpFixture.map((r) => ({ ...r, quantity: r.quantity * 0.25 }));
    await api('POST', `/material-planning/cycles/${cycleA}/import`, { source: 'MRP', data: mrpHalf });
    const calcA3 = await api('POST', `/material-planning/cycles/${cycleA}/calculate`);
    check('4a. Hasil periode A BERUBAH setelah datanya diubah', resultsDiffer(calcA1.json.data, calcA3.json.data), true);

    const resultB2 = await api('GET', `/material-planning/cycles/${cycleB}/results`);
    const currentB2 = resultB2.json.data.find((r: any) => r.isCurrent);
    const fullB2 = await api('GET', `/material-planning/cycles/${cycleB}/results/${currentB2.id}`);
    compareResults('4b. Hasil periode B TIDAK berubah setelah periode A diubah', calcB1.json.data, fullB2.json.data.resultSnapshot);

    const detailB2 = await api('GET', `/material-planning/cycles/${cycleB}`);
    check('4c. Baris data periode B tidak tersentuh', detailB2.json.data.rowCounts.MRP, mrpFixtureB.length);

    // ── 5. Re-upload menimpa, bukan menambah ──────────────────────────────
    const detailA3 = await api('GET', `/material-planning/cycles/${cycleA}`);
    check('5a. Re-upload MRP MENIMPA (tidak menumpuk)', detailA3.json.data.rowCounts.MRP, mrpFixture.length);

    // ── 6. Tanda STALE ────────────────────────────────────────────────────
    await api('POST', `/material-planning/cycles/${cycleA}/import`, { source: 'HOTLIST', data: hotlistFixture });
    const list = await api('GET', '/material-planning/cycles');
    const rowA = list.json.data.find((c: any) => c.id === cycleA);
    check('6a. Periode A ditandai STALE setelah data berubah', rowA.isStale, true);

    // ── 7. Jejak upload & audit ───────────────────────────────────────────
    const audit = await api('GET', `/material-planning/cycles/${cycleA}/audit`);
    check('7a. Audit log periode A terisi', audit.json.data.length > 0, true);
    const sources = await api('GET', `/material-planning/cycles/${cycleA}/sources`);
    check('7b. Kelengkapan 5 sumber terbaca', sources.json.data.length, 5);

    // ── 8. Siklus hidup hasil ─────────────────────────────────────────────
    const resultsA = await api('GET', `/material-planning/cycles/${cycleA}/results`);
    check('8a. Hanya ada SATU hasil current di periode A', resultsA.json.data.filter((r: any) => r.isCurrent).length, 1);
    check('8b. Hasil lama yang tidak disimpan ikut dibersihkan', resultsA.json.data.length, 1);

    // ── 9. NPOF tidak boleh terhapus bersama periode ──────────────────────
    const npofCount = await prisma.npofMaterial.count();
    check('9a. NPOF (sumber global) tetap utuh', npofCount > 0, true);
  } finally {
    await cleanup();
    const leftovers = await prisma.planningCycle.count({ where: { uploadMonth: { in: ['2030-01', '2030-02'] } } });
    console.log(`\nPembersihan: periode uji tersisa = ${leftovers}`);
    check('10. Periode uji terhapus bersih', leftovers, 0);
  }

  console.log('\n==================================================');
  console.log(failures === 0 ? 'SEMUA PEMERIKSAAN ISOLASI LULUS' : `${failures} PEMERIKSAAN GAGAL`);
  console.log('==================================================');
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error('ERROR:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
