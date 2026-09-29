import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { resolveUploadPeriod, recordPeriodChange, touchPeriod } from '../lib/periodScope';
import * as xlsx from 'xlsx';

// ============================================
// Helper pembacaan Excel (file sumber adalah hasil PIVOT TABLE)
// ============================================

/** Sel -> teks bersih. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * Baca angka dari sel Excel dengan benar.
 * Mendukung angka asli, desimal titik ("4917.87"), desimal koma ("89,6"),
 * dan pemisah ribuan ("4,917.87" / "4.917,87").
 */
export function parseExcelNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  let s = cellText(value).replace(/\s/g, '');
  if (!s) return 0;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // "1.234,56" (id) vs "1,234.56" (en) — desimal = pemisah paling belakang.
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (hasComma) {
    const parts = s.split(',');
    // "89,6" -> 89.6 ; "4,917" -> 4917 (pemisah ribuan)
    s = parts.length === 2 && parts[1].length <= 2 ? s.replace(',', '.') : s.replace(/,/g, '');
  }

  const n = parseFloat(s.replace(/[^0-9.eE+-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Nama bulan Inggris + Indonesia (dipotong 3 huruf). */
const MONTH_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, mei: 4, jun: 5, jul: 6,
  aug: 7, agu: 7, sep: 8, oct: 9, okt: 9, nov: 10, dec: 11, des: 11,
};

/** Serial date Excel -> Date (UTC tengah malam). Epoch 1899-12-30. */
function excelSerialToDate(serial: number): Date {
  return new Date(Math.round((serial - 25569) * 86400 * 1000));
}

/**
 * Baca tanggal dari sel Excel secara DETERMINISTIK (tanpa bergantung timezone
 * mesin): serial Excel, "02 May 2026", "2 Mei 2026", "2026-05-02", "02/05/2026".
 */
export function parseExcelDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value >= 1 && value <= 73050 ? excelSerialToDate(value) : null;
  }

  const s = cellText(value);
  if (!s) return null;

  // Angka murni = serial date Excel (1 = 1900-01-01, 73050 ≈ 2100).
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    return n >= 1 && n <= 73050 ? excelSerialToDate(n) : null;
  }

  const named = s.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,})[\s-]+(\d{2,4})$/);
  if (named) {
    const month = MONTH_INDEX[named[2].slice(0, 3).toLowerCase()];
    if (month !== undefined) {
      const year = Number(named[3].length === 2 ? `20${named[3]}` : named[3]);
      return new Date(Date.UTC(year, month, Number(named[1])));
    }
  }

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));

  // dd/mm/yyyy (locale Indonesia) — hanya dipakai kalau bukan ISO/nama bulan.
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (dmy) {
    const year = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]);
    return new Date(Date.UTC(year, Number(dmy[2]) - 1, Number(dmy[1])));
  }

  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export default async function outstandingPoRoutes(server: FastifyInstance) {
  // Get all outstanding POs. Bisa difilter per periode: ?periodId=...
  server.get('/api/v1/outstanding-po', { preValidation: [authenticate] }, async (request, reply) => {
    const { periodId } = request.query as { periodId?: string };
    const data = await prisma.outstandingPO.findMany({
      where: periodId ? { periodId } : undefined,
      orderBy: { planReceivedDate: 'desc' },
    });
    return reply.send({ data });
  });

  // Upload Excel
  server.post('/api/v1/outstanding-po/upload', { preValidation: [authenticate] }, async (request, reply) => {
    try {
      const data = await request.file();
      if (!data) {
        return reply.code(400).send({ error: 'Bad Request', message: 'No file uploaded' });
      }

      const buffer = await data.toBuffer();
      const workbook = xlsx.read(buffer, { type: 'buffer' });
      
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        return reply.code(400).send({ error: 'Bad Request', message: 'No sheets found in the Excel file' });
      }
      const sheet = workbook.Sheets[sheetName];

      // ── Bangun grid 2D mentah + perluas MERGED CELL ──────────────────────
      // File sumber adalah hasil pivot: kolom PO NO / PLAN_RECEIVED_Date /
      // Supplier_Name / UNIT hanya terisi di baris pertama sebuah grup, baris
      // item berikutnya kosong (merged atau blank).
      const range = xlsx.utils.decode_range(sheet['!ref'] || 'A1');
      const grid: unknown[][] = [];
      for (let r = range.s.r; r <= range.e.r; r++) {
        const row: unknown[] = [];
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cell = sheet[xlsx.utils.encode_cell({ r, c })];
          row[c - range.s.c] = cell ? cell.v : null;
        }
        grid.push(row);
      }

      // Catat sel yang isinya berasal dari PERLUASAN merge (bukan tulisan asli
      // di baris itu). Tanpa ini, PO NO hasil merge akan dianggap "PO baru"
      // sehingga tanggal/supplier/unit justru ter-reset jadi kosong.
      const mergeFilled = new Set<string>();
      for (const m of sheet['!merges'] || []) {
        const anchor = grid[m.s.r - range.s.r]?.[m.s.c - range.s.c];
        for (let r = m.s.r; r <= m.e.r; r++) {
          for (let c = m.s.c; c <= m.e.c; c++) {
            const gr = r - range.s.r;
            const gc = c - range.s.c;
            if (gr === m.s.r - range.s.r && gc === m.s.c - range.s.c) continue;
            if (!grid[gr]) grid[gr] = [];
            grid[gr][gc] = anchor;
            mergeFilled.add(`${gr}|${gc}`);
          }
        }
      }

      let headerRowIdx = -1;
      let colIdx = {
        poNumber: -1,
        planReceivedDate: -1,
        supplierName: -1,
        unit: -1,
        itemDesc: -1,
        qtyOrder: -1,
        qtyDelivered: -1,
      };

      /** Cocokkan nama kolom tanpa peduli spasi/underscore, mis. "PO NO" == "PO_NO". */
      const normalizeHeader = (value: unknown) =>
        String(value || '').toUpperCase().replace(/[\s_]+/g, '').trim();

      const HEADER_FIELDS: Record<string, keyof typeof colIdx> = {
        PONO: 'poNumber',
        PONUMBER: 'poNumber',
        NOPO: 'poNumber',
        PURCHASEORDERNO: 'poNumber',
        PLANRECEIVEDDATE: 'planReceivedDate',
        TGLRENCANA: 'planReceivedDate',
        TANGGALRENCANA: 'planReceivedDate',
        SUPPLIERNAME: 'supplierName',
        SUPPLIER: 'supplierName',
        UNIT: 'unit',
        SATUAN: 'unit',
        ITEMDESC: 'itemDesc',
        ITEMDESCRIPTION: 'itemDesc',
        SUMOFQTYORDER: 'qtyOrder',
        QTYORDER: 'qtyOrder',
        SUMOFDELIVEREDQTY: 'qtyDelivered',
        QTYDELIVERED: 'qtyDelivered',
      };

      // Find the headers
      for (let i = 0; i < Math.min(20, grid.length); i++) {
        const row = grid[i];
        if (!row) continue;

        let foundHeaders = 0;
        const candidate: typeof colIdx = {
          poNumber: -1,
          planReceivedDate: -1,
          supplierName: -1,
          unit: -1,
          itemDesc: -1,
          qtyOrder: -1,
          qtyDelivered: -1,
        };
        for (let j = 0; j < row.length; j++) {
          const field = HEADER_FIELDS[normalizeHeader(row[j])];
          if (field && candidate[field] === -1) {
            candidate[field] = j;
            foundHeaders++;
          }
        }

        if (foundHeaders >= 4) { // Found at least 4 required headers
          headerRowIdx = i;
          colIdx = candidate;
          break;
        }
      }

      if (headerRowIdx === -1) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Could not find required columns in the file (PO NO, PLAN_RECEIVED_Date, Supplier_Name, ITEM_DESC, etc).' });
      }

      if (colIdx.poNumber === -1) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Kolom "PO NO" tidak ditemukan di file. PO Number wajib ada pada setiap baris Outstanding PO.',
        });
      }

      if (colIdx.itemDesc === -1 || colIdx.qtyOrder === -1) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Kolom "ITEM_DESC" dan/atau "Sum of QTY_ORDER" tidak ditemukan di file.',
        });
      }

      // Qty Delivered TIDAK punya header di template aslinya, jadi dibaca
      // berdasarkan POSISI: kolom tepat setelah "Sum of QTY_ORDER".
      // Fallback: kalau template nanti menambahkan header, pakai kolom itu.
      const deliveredIdx = colIdx.qtyDelivered !== -1 ? colIdx.qtyDelivered : colIdx.qtyOrder + 1;

      const recordsToInsert: Array<Record<string, unknown>> = [];
      const errors: Array<{ row: number; poNumber?: string; message: string }> = [];
      let skippedNonData = 0;

      // Nilai berjalan untuk FILL-DOWN kolom pivot yang dikosongkan.
      let curPo = '';
      let curDate: Date | null = null;
      let curDateRaw = '';
      let curSupplier = '';
      let curUnit = '';

      for (let i = headerRowIdx + 1; i < grid.length; i++) {
        const row = grid[i] || [];
        // Nomor baris Excel: 1-based, termasuk baris judul.
        const excelRow = i + 1;

        const itemDesc = cellText(row[colIdx.itemDesc]);
        // Baris tanpa ITEM_DESC = bukan baris data (baris kosong, subtotal,
        // "Grand Total" pivot) -> dilewati tanpa dianggap gagal.
        if (!itemDesc || /^(grand\s*)?total/i.test(itemDesc)) {
          skippedNonData++;
          continue;
        }

        const poRaw = cellText(row[colIdx.poNumber]);
        const dateRaw = cellText(row[colIdx.planReceivedDate]);
        const supplierRaw = cellText(row[colIdx.supplierName]);
        const unitRaw = colIdx.unit === -1 ? '' : cellText(row[colIdx.unit]);

        // ── FILL-DOWN ───────────────────────────────────────────────────────
        const poFromMerge = mergeFilled.has(`${i}|${colIdx.poNumber}`);
        if (poRaw && !poFromMerge) {
          // PO baru: tanggal, supplier, dan unit ikut di-reset ke baris ini.
          curPo = poRaw;
          curDateRaw = dateRaw;
          curDate = parseExcelDate(row[colIdx.planReceivedDate]);
          curSupplier = supplierRaw;
          curUnit = unitRaw;
        } else {
          // Lanjutan PO yang sama: pakai nilai terakhir dari baris di atasnya.
          if (dateRaw) {
            curDateRaw = dateRaw;
            curDate = parseExcelDate(row[colIdx.planReceivedDate]);
          }
          if (supplierRaw) curSupplier = supplierRaw;
          // UNIT boleh berubah di tengah PO yang sama (mis. kg -> rim).
          if (unitRaw) curUnit = unitRaw;
        }

        // Validasi dijalankan SETELAH fill-down: baris hanya gagal kalau
        // PO NO tetap kosong (tidak ada nilai di baris mana pun di atasnya).
        if (!curPo) {
          errors.push({
            row: excelRow,
            message: `Baris ${excelRow}: kolom "PO NO" kosong. PO Number wajib diisi.`,
          });
          continue;
        }

        if (!curDate) {
          errors.push({
            row: excelRow,
            poNumber: curPo,
            message: `Baris ${excelRow} (PO ${curPo}): tanggal rencana (PLAN_RECEIVED_Date) kosong atau tidak bisa dibaca${curDateRaw ? `: "${curDateRaw}"` : ''}.`,
          });
          continue;
        }

        const unit = (curUnit || 'kg').toLowerCase();

        // SATU BARIS EXCEL = SATU RECORD ITEM. Tidak ada dedup berdasarkan PO.
        recordsToInsert.push({
          poNumber: curPo,
          planReceivedDate: curDate,
          supplierName: curSupplier,
          itemDesc,
          qtyOrder: parseExcelNumber(row[colIdx.qtyOrder]),
          qtyOrderUnit: unit,
          qtyDelivered: parseExcelNumber(row[deliveredIdx]),
          // Satuan delivered mengikuti satuan order: kg -> kg, rim -> lembar.
          qtyDeliveredUnit: unit === 'rim' ? 'sheets' : unit,
        });
      }

      if (recordsToInsert.length === 0) {
        return reply.code(400).send({
          error: 'Bad Request',
          message:
            errors.length > 0
              ? `Tidak ada baris yang bisa diimpor. ${errors.length} baris gagal — lihat daftar kesalahan.`
              : 'No valid data found in Excel.',
          errors,
        });
      }

      return reply.code(200).send({ 
        message:
          errors.length > 0
            ? `File dibaca: ${recordsToInsert.length} baris siap diimpor, ${errors.length} baris gagal.`
            : 'File parsed successfully',
        data: recordsToInsert,
        errors,
        summary: {
          total: recordsToInsert.length + errors.length + skippedNonData,
          valid: recordsToInsert.length,
          failed: errors.length,
        },
      });
    } catch (error) {
      server.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error', message: 'Failed to process file' });
    }
  });

  // Import (Save) dengan mode Add atau Overwrite — WAJIB menyertakan periode.
  server.post('/api/v1/outstanding-po/import', { preValidation: [authenticate] }, async (request, reply) => {
    const body = (request.body || {}) as {
      data?: any[];
      mode?: 'add' | 'overwrite';
      periodId?: string;
      periodMonth?: string;
      periodLabel?: string;
      fileName?: string;
    };
    const data = body.data;

    if (!data || !Array.isArray(data) || data.length === 0) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Valid data array is required' });
    }

    const resolved = await resolveUploadPeriod(body as Record<string, unknown>, request.user!.id);
    if (!resolved.ok) {
      return reply.code(resolved.code).send({ error: 'Bad Request', message: resolved.message });
    }
    const { periodId } = resolved;
    const mode: 'add' | 'overwrite' = body.mode === 'add' ? 'add' : 'overwrite';

    // PO Number WAJIB. Tolak seluruh permintaan kalau ada baris tanpa PO Number,
    // supaya tidak ada data yang tersimpan diam-diam tanpa nomor PO.
    const invalidRows: Array<{ row: number; message: string }> = [];
    data.forEach((record: any, index: number) => {
      const poNumber = String(record?.poNumber ?? '').trim();
      if (!poNumber) {
        invalidRows.push({
          row: index + 1,
          message: `Data ke-${index + 1}: PO Number kosong (item "${record?.itemDesc || '-'}").`,
        });
      }
    });
    if (invalidRows.length > 0) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: `${invalidRows.length} baris tidak punya PO Number. Semua baris wajib punya PO Number.`,
        errors: invalidRows,
      });
    }

    try {
      const previousCount = await prisma.outstandingPO.count({ where: { periodId } });

      await prisma.$transaction(
        async (tx) => {
          if (mode === 'overwrite') {
            // HANYA periode ini yang dikosongkan.
            await tx.outstandingPO.deleteMany({ where: { periodId } });
          }
          const recordsToInsert = data.map((record) => ({
            periodId,
            poNumber: String(record.poNumber).trim(),
            planReceivedDate: new Date(record.planReceivedDate),
            supplierName: record.supplierName,
            itemDesc: record.itemDesc,
            qtyOrder: Number(record.qtyOrder) || 0,
            qtyOrderUnit: record.qtyOrderUnit,
            qtyDelivered: Number(record.qtyDelivered) || 0,
            qtyDeliveredUnit: record.qtyDeliveredUnit,
          }));
          for (let i = 0; i < recordsToInsert.length; i += 1000) {
            await tx.outstandingPO.createMany({ data: recordsToInsert.slice(i, i + 1000) });
          }
        },
        { timeout: 180000, maxWait: 30000 },
      );

      await recordPeriodChange({
        periodId,
        userId: request.user!.id,
        sourceType: 'OUTSTANDING_PO',
        rowCount: data.length,
        replaced: previousCount,
        fileName: body.fileName ?? null,
        mode,
      });

      return reply.code(201).send({
        message:
          mode === 'overwrite'
            ? `Periode "${resolved.label}" ditimpa dengan ${data.length} baris PO.`
            : `Ditambahkan ${data.length} baris PO ke periode "${resolved.label}".`,
        count: data.length,
        periodId,
        label: resolved.label,
        replaced: previousCount,
        created: resolved.created,
      });
    } catch (error) {
      server.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error', message: 'Failed to import data' });
    }
  });

  // Add Manual — WAJIB menyertakan periode.
  server.post('/api/v1/outstanding-po', { preValidation: [authenticate] }, async (request, reply) => {
    const body = (request.body || {}) as any;
    const { poNumber, planReceivedDate, supplierName, itemDesc, qtyOrder, qtyOrderUnit, qtyDelivered, qtyDeliveredUnit } = body;

    if (!String(poNumber ?? '').trim()) {
      return reply.code(400).send({ error: 'Bad Request', message: 'PO Number wajib diisi' });
    }
    if (!planReceivedDate || !supplierName || !itemDesc || qtyOrder === undefined || qtyDelivered === undefined) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Required fields are missing' });
    }

    const resolved = await resolveUploadPeriod(body, request.user!.id);
    if (!resolved.ok) {
      return reply.code(resolved.code).send({ error: 'Bad Request', message: resolved.message });
    }

    const result = await prisma.outstandingPO.create({
      data: {
        periodId: resolved.periodId,
        poNumber: String(poNumber).trim(),
        planReceivedDate: new Date(planReceivedDate),
        supplierName,
        itemDesc,
        qtyOrder: parseFloat(qtyOrder),
        qtyOrderUnit,
        qtyDelivered: parseFloat(qtyDelivered),
        qtyDeliveredUnit,
      },
    });

    await touchPeriod(resolved.periodId);
    return reply.code(201).send({ data: result });
  });

  // Update
  server.put('/api/v1/outstanding-po/:id', { preValidation: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { poNumber, planReceivedDate, supplierName, itemDesc, qtyOrder, qtyOrderUnit, qtyDelivered, qtyDeliveredUnit } = request.body as any;

    if (poNumber !== undefined && !String(poNumber).trim()) {
      return reply.code(400).send({ error: 'Bad Request', message: 'PO Number wajib diisi' });
    }

    const existing = await prisma.outstandingPO.findUnique({ where: { id } });
    if (!existing) {
      return reply.code(404).send({ error: 'Not Found', message: 'Record not found' });
    }

    const updated = await prisma.outstandingPO.update({
      where: { id },
      data: {
        ...(poNumber !== undefined && { poNumber: String(poNumber).trim() }),
        ...(planReceivedDate && { planReceivedDate: new Date(planReceivedDate) }),
        ...(supplierName && { supplierName }),
        ...(itemDesc && { itemDesc }),
        ...(qtyOrder !== undefined && { qtyOrder: parseFloat(qtyOrder) }),
        ...(qtyOrderUnit && { qtyOrderUnit }),
        ...(qtyDelivered !== undefined && { qtyDelivered: parseFloat(qtyDelivered) }),
        ...(qtyDeliveredUnit && { qtyDeliveredUnit }),
      },
    });

    await touchPeriod(existing.periodId);
    return reply.send({ data: updated });
  });

  // Delete
  server.delete('/api/v1/outstanding-po/:id', { preValidation: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.outstandingPO.findUnique({ where: { id } });
    if (!existing) {
      return reply.code(404).send({ error: 'Not Found', message: 'Record not found' });
    }

    await prisma.outstandingPO.delete({ where: { id } });

    await touchPeriod(existing.periodId);
    return reply.send({ message: 'Record deleted successfully' });
  });

  // Bulk Delete
  server.post('/api/v1/outstanding-po/bulk-delete', { preValidation: [authenticate] }, async (request, reply) => {
    const { ids } = request.body as { ids: string[] };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Valid ids array is required' });
    }

    try {
      const affected = await prisma.outstandingPO.findMany({
        where: { id: { in: ids } },
        select: { periodId: true },
      });
      const result = await prisma.outstandingPO.deleteMany({
        where: { id: { in: ids } },
      });

      for (const pid of [...new Set(affected.map((r) => r.periodId))]) await touchPeriod(pid);

      return reply.send({ message: `Successfully deleted ${result.count} records.`, count: result.count });
    } catch (error) {
      server.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error', message: 'Failed to delete records' });
    }
  });
}
