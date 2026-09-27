import prisma from './prisma';

/**
 * Helper bersama untuk sistem PERIODE UPLOAD (lihat
 * migration 20260928000000_master_data_period).
 *
 * Semua halaman Master Data (26-Week Demand, WIP, Hot List, Stock Raw Material,
 * Outstanding PO) menyimpan datanya dengan `periodId`. Upload/add manual WAJIB
 * menyertakan periode, dan penimpaan hanya boleh terjadi DI DALAM periode itu.
 */

export const SOURCE_TYPES = ['MRP', 'HOTLIST', 'STOCK_RM', 'OUTSTANDING_PO', 'WIP'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const RETENTION_MONTHS = 18;

const MONTH_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

/** "2026-09" -> "September 2026" */
export function labelFromMonth(month: string): string {
  const [year, m] = month.split('-');
  const name = MONTH_NAMES_ID[Number(m) - 1] ?? month;
  return `${name} ${year}`;
}

/** Validasi "yyyy-MM"; null kalau tidak valid. */
export function parseMonth(value: unknown): string | null {
  const v = typeof value === 'string' ? value.trim() : '';
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : null;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export type PeriodResolution =
  | { ok: true; periodId: string; label: string; created: boolean }
  | { ok: false; code: number; message: string };

/**
 * Tentukan periode tujuan upload dari body request.
 * Prioritas: `periodId` (periode yang sudah ada) -> `periodMonth` ("2026-09",
 * dibuat kalau belum ada). Salah satu WAJIB ada.
 */
export async function resolveUploadPeriod(
  body: Record<string, unknown>,
  userId: string,
): Promise<PeriodResolution> {
  const periodId = typeof body.periodId === 'string' ? body.periodId.trim() : '';

  if (periodId) {
    const cycle = await prisma.planningCycle.findUnique({ where: { id: periodId } });
    if (!cycle) {
      return { ok: false, code: 404, message: 'Periode tidak ditemukan. Pilih periode lain.' };
    }
    if (cycle.isLocked) {
      return { ok: false, code: 409, message: `Periode "${cycle.label}" terkunci. Buka kunci dulu.` };
    }
    return { ok: true, periodId: cycle.id, label: cycle.label, created: false };
  }

  const month = parseMonth(body.periodMonth);
  if (!month) {
    return {
      ok: false,
      code: 400,
      message:
        'Periode wajib dipilih sebelum upload. Kirim `periodId` (periode yang sudah ada) atau `periodMonth` dalam format "YYYY-MM" (mis. "2026-09").',
    };
  }

  const existing = await prisma.planningCycle.findUnique({ where: { uploadMonth: month } });
  if (existing) {
    if (existing.isLocked) {
      return { ok: false, code: 409, message: `Periode "${existing.label}" terkunci. Buka kunci dulu.` };
    }
    return { ok: true, periodId: existing.id, label: existing.label, created: false };
  }

  const label = typeof body.periodLabel === 'string' && body.periodLabel.trim()
    ? body.periodLabel.trim()
    : labelFromMonth(month);

  const created = await prisma.planningCycle.create({
    data: {
      uploadMonth: month,
      label,
      mrpStartDate: null,
      mrpEndDate: null,
      weekCount: 26,
      retentionDueAt: addMonths(new Date(), RETENTION_MONTHS),
      createdBy: userId,
    },
  });

  await prisma.cycleAuditLog.create({
    data: {
      cycleId: created.id,
      userId,
      action: 'CREATE',
      sourceType: 'CYCLE',
      entityType: 'PlanningCycle',
      entityId: created.id,
      notes: `Periode dibuat otomatis saat upload: ${created.label} (bulan ${created.uploadMonth})`,
    },
  });

  return { ok: true, periodId: created.id, label: created.label, created: true };
}

/** Periode yang boleh ditulis (ada + tidak terkunci). Untuk endpoint non-upload. */
export async function requireWritablePeriod(
  periodId: string,
): Promise<{ ok: true; label: string } | { ok: false; code: number; message: string }> {
  const cycle = await prisma.planningCycle.findUnique({ where: { id: periodId } });
  if (!cycle) return { ok: false, code: 404, message: 'Periode tidak ditemukan.' };
  if (cycle.isLocked) {
    return { ok: false, code: 409, message: `Periode "${cycle.label}" terkunci. Buka kunci dulu.` };
  }
  return { ok: true, label: cycle.label };
}

/**
 * Tandai periode berubah (dipakai edit/hapus manual). WAJIB dipanggil setiap ada
 * perubahan data periode, supaya hasil perhitungan yang lama ditandai "perlu
 * dihitung ulang" (STALE).
 */
export async function touchPeriod(periodId: string) {
  await prisma.planningCycle.update({
    where: { id: periodId },
    data: { lastDataChangeAt: new Date() },
  });
}

// ============================================================
// CHECKSUM DATA MASTER PER PERIODE
// ============================================================
// Ringkasan murah (5 query agregat) yang cukup untuk mendeteksi perubahan:
// jumlah baris, total nilai, dan waktu update terakhir. Disimpan di
// `CycleResult.dataSignature` saat perhitungan, lalu dibandingkan saat folder
// periode dibuka kembali.

export interface SourceSignature {
  rows: number;
  sum: number;
  lastUpdatedAt: string | null;
}

export type PeriodSignature = Record<SourceType, SourceSignature>;

function packSignature(
  agg: { _count: { _all: number }; _sum: Record<string, unknown> | null; _max: { updatedAt: Date | null } },
  sumKey: string,
): SourceSignature {
  const raw = agg._sum?.[sumKey];
  return {
    rows: agg._count._all,
    sum: Number(raw ?? 0),
    lastUpdatedAt: agg._max.updatedAt ? agg._max.updatedAt.toISOString() : null,
  };
}

/** Hitung checksum data master untuk SATU periode (5 query, tanpa ambil baris). */
export async function computePeriodSignature(periodId: string): Promise<PeriodSignature> {
  const [mrp, hotlist, stock, po, wip] = await Promise.all([
    prisma.weeklySchedule.aggregate({
      where: { periodId },
      _count: { _all: true },
      _sum: { quantity: true },
      _max: { updatedAt: true },
    }),
    prisma.hotlist.aggregate({
      where: { periodId },
      _count: { _all: true },
      _sum: { biTotal: true },
      _max: { updatedAt: true },
    }),
    prisma.stockRawMaterial.aggregate({
      where: { periodId },
      _count: { _all: true },
      _sum: { qty: true },
      _max: { updatedAt: true },
    }),
    prisma.outstandingPO.aggregate({
      where: { periodId },
      _count: { _all: true },
      _sum: { qtyOrder: true },
      _max: { updatedAt: true },
    }),
    prisma.wIP.aggregate({
      where: { periodId },
      _count: { _all: true },
      _sum: { quantity: true },
      _max: { updatedAt: true },
    }),
  ]);

  return {
    MRP: packSignature(mrp as never, 'quantity'),
    HOTLIST: packSignature(hotlist as never, 'biTotal'),
    STOCK_RM: packSignature(stock as never, 'qty'),
    OUTSTANDING_PO: packSignature(po as never, 'qtyOrder'),
    WIP: packSignature(wip as never, 'quantity'),
  };
}

/**
 * Bandingkan checksum tersimpan dengan kondisi data master sekarang.
 * `comparable = false` bila perhitungan lama belum punya checksum.
 */
export function compareSignature(stored: unknown, current: PeriodSignature) {
  const saved = (stored ?? null) as PeriodSignature | null;
  const changedSources: SourceType[] = [];

  for (const key of SOURCE_TYPES) {
    const a = saved?.[key];
    if (!a) continue;
    const b = current[key];
    if (a.rows !== b.rows || Math.abs(a.sum - b.sum) > 1e-6 || a.lastUpdatedAt !== b.lastUpdatedAt) {
      changedSources.push(key);
    }
  }

  return {
    comparable: Boolean(saved),
    changedSources,
    anyChanged: changedSources.length > 0,
  };
}

/**
 * Catat hasil upload/penghapusan ke jejak periode:
 *  - CycleSourceUpload  (kapan, file apa, berapa baris, oleh siapa)
 *  - perbarui cap waktu PlanningCycle
 *  - CycleAuditLog      (satu baris ringkas per aksi, bukan per baris data)
 */
export async function recordPeriodChange(params: {
  periodId: string;
  userId: string;
  sourceType: SourceType;
  rowCount: number;
  replaced?: number;
  fileName?: string | null;
  mode?: string;
  mrpStartDate?: Date | null;
  mrpEndDate?: Date | null;
  notes?: string;
}) {
  const now = new Date();
  const replaced = params.replaced ?? 0;

  await prisma.cycleSourceUpload.create({
    data: {
      cycleId: params.periodId,
      sourceType: params.sourceType,
      fileName: params.fileName ?? null,
      rowCount: params.rowCount,
      mode: params.mode ?? 'replace',
      uploadedBy: params.userId,
    },
  });

  await prisma.planningCycle.update({
    where: { id: params.periodId },
    data: {
      lastUploadedAt: now,
      lastDataChangeAt: now,
      ...(params.mrpStartDate && params.mrpEndDate
        ? { mrpStartDate: params.mrpStartDate, mrpEndDate: params.mrpEndDate }
        : {}),
    },
  });

  await prisma.cycleAuditLog.create({
    data: {
      cycleId: params.periodId,
      userId: params.userId,
      action: replaced > 0 ? 'UPDATE' : 'CREATE',
      sourceType: params.sourceType,
      entityType: 'CycleSourceUpload',
      notes:
        params.notes ??
        `Upload ${params.sourceType}: ${params.rowCount} baris masuk, ${replaced} baris lama di periode ini diganti. Periode lain tidak terpengaruh.`,
    },
  });
}
