import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';
import { config } from '../config';
import { authenticate } from '../middleware/auth';
import { resolveUploadPeriod, recordPeriodChange, touchPeriod } from '../lib/periodScope';
import * as xlsx from 'xlsx';

export default async function stockRawMaterialRoutes(server: FastifyInstance) {
  // Get all stock raw materials. Bisa difilter per periode: ?periodId=...
  server.get('/api/v1/stock-raw-material', { preValidation: [authenticate] }, async (request, reply) => {
    const { periodId } = request.query as { periodId?: string };
    const data = await prisma.stockRawMaterial.findMany({
      where: periodId ? { periodId } : undefined,
      orderBy: { date: 'desc' },
    });
    return reply.send({ data });
  });

  /**
   * Ringkasan stok: total per itemDesc + supplier, beserta JUMLAH LOT.
   *
   * Tabel stok menyimpan satu baris per lot, sehingga tampilan lama membuat
   * user mengira jumlahnya sedikit. Endpoint ini memperlihatkan total sebenarnya
   * sekaligus berapa lot yang menyusunnya (rancangan §8.6).
   */
  server.get('/api/v1/stock-raw-material/summary', { preValidation: [authenticate] }, async (request, reply) => {
    // Ringkasan WAJIB per periode — tanpa ini stok beberapa bulan akan tercampur.
    const { periodId } = request.query as { periodId?: string };
    if (!periodId) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Parameter periodId wajib diisi. Pilih periode dulu.',
      });
    }

    const stocks = await prisma.stockRawMaterial.findMany({
      where: { periodId },
      select: { itemDesc: true, supplier: true, qty: true, unit: true, date: true },
    });

    const map = new Map<
      string,
      {
        itemDesc: string;
        supplier: string;
        kg: number;
        sheet: number;
        rim: number;
        lots: number;
        firstDate: Date | null;
        lastDate: Date | null;
        unknownUnits: Set<string>;
      }
    >();

    const SHEET_UNIT_LIST = ['sheet', 'sheets', 'sht', 'lbr', 'lembar'];
    const RIM_UNIT_LIST = ['rim', 'ream'];

    for (const s of stocks) {
      const key = `${s.itemDesc}||${s.supplier || ''}`;
      const agg =
        map.get(key) ||
        {
          itemDesc: s.itemDesc,
          supplier: s.supplier || '',
          kg: 0,
          sheet: 0,
          rim: 0,
          lots: 0,
          firstDate: null as Date | null,
          lastDate: null as Date | null,
          unknownUnits: new Set<string>(),
        };

      const rawUnit = String(s.unit || '').trim();
      const unit = rawUnit.toLowerCase();
      if (SHEET_UNIT_LIST.includes(unit)) {
        agg.sheet += s.qty;
      } else if (RIM_UNIT_LIST.includes(unit)) {
        agg.rim += s.qty;
        agg.sheet += s.qty * config.materialCalc.sheetsPerRim;
      } else if (unit === 'kg') {
        agg.kg += s.qty;
      } else {
        // Satuan kosong / tidak dikenal. Sementara diperlakukan sebagai kg
        // (meniru perilaku lama), TAPI dilaporkan lewat `unknownUnits` supaya
        // user sadar ada baris yang satuannya perlu dibetulkan.
        agg.kg += s.qty;
        agg.unknownUnits.add(rawUnit === '' ? '(kosong)' : rawUnit);
      }

      agg.lots += 1;
      const d = new Date(s.date);
      if (!agg.firstDate || d < agg.firstDate) agg.firstDate = d;
      if (!agg.lastDate || d > agg.lastDate) agg.lastDate = d;
      map.set(key, agg);
    }

    const data = [...map.values()]
      .map((a) => ({
        itemDesc: a.itemDesc,
        supplier: a.supplier,
        lots: a.lots,
        totalKg: a.kg,
        totalSheet: a.sheet,
        totalRim: a.rim,
        primaryUnit: a.kg > 0 ? ('kg' as const) : ('sheet' as const),
        firstDate: a.firstDate,
        lastDate: a.lastDate,
        /** Satuan yang tidak dikenali pada grup ini; angkanya sementara dihitung sebagai kg. */
        unknownUnits: [...a.unknownUnits],
        hasUnknownUnit: a.unknownUnits.size > 0,
      }))
      .sort((x, y) => y.totalKg + y.totalSheet - (x.totalKg + x.totalSheet));

    return reply.send({ data, sheetsPerRim: config.materialCalc.sheetsPerRim });
  });

  /** Detail per lot untuk satu itemDesc + supplier. */
  server.get('/api/v1/stock-raw-material/lots', { preValidation: [authenticate] }, async (request, reply) => {
    const { itemDesc, supplier, periodId } = request.query as {
      itemDesc?: string;
      supplier?: string;
      periodId?: string;
    };
    if (!itemDesc) {
      return reply.code(400).send({ error: 'Bad Request', message: 'itemDesc wajib diisi' });
    }
    if (!periodId) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Parameter periodId wajib diisi. Pilih periode dulu.',
      });
    }

    // `supplier` kosong harus cocok dengan baris NULL **maupun** string kosong,
    // karena data nyata memakai keduanya. Kalau parameter tidak dikirim sama
    // sekali, tampilkan semua lot untuk item tersebut.
    const supplierFilter =
      supplier === undefined
        ? {}
        : supplier === ''
          ? { OR: [{ supplier: null }, { supplier: '' }] }
          : { supplier };

    const data = await prisma.stockRawMaterial.findMany({
      where: { periodId, itemDesc, ...supplierFilter },
      orderBy: { date: 'desc' },
    });

    return reply.send({
      data,
      lots: data.length,
      total: data.reduce((sum, r) => sum + r.qty, 0),
    });
  });

  // Upload Excel
  server.post('/api/v1/stock-raw-material/upload', { preValidation: [authenticate] }, async (request, reply) => {
    try {
      const data = await request.file();
      if (!data) {
        return reply.code(400).send({ error: 'Bad Request', message: 'No file uploaded' });
      }

      const buffer = await data.toBuffer();
      const workbook = xlsx.read(buffer, { type: 'buffer' });
      
      const sheetName = 'StockOnhandByLot';
      if (!workbook.Sheets[sheetName]) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Sheet "StockOnhandByLot" not found in the Excel file' });
      }
      const sheet = workbook.Sheets[sheetName];
      
      const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
      
      let namaItemIdx = -1;
      let trxDateIdx = -1;
      let digit1LotIdx = -1;
      let totalIdx = -1;
      let unitIdx = -1;
      let headerRowIdx = -1;

      // Find the headers
      for (let i = 0; i < Math.min(20, rows.length); i++) {
        const row = rows[i];
        if (!row) continue;
        
        for (let j = 0; j < row.length; j++) {
          const cell = String(row[j] || '').trim();
          
          if (cell === 'Nama Item') namaItemIdx = j;
          else if (cell === 'Trx Date') trxDateIdx = j;
          else if (cell === 'Digit1_Lot') digit1LotIdx = j;
          else if (cell === 'Total') totalIdx = j;
          else if (cell === 'Unit') unitIdx = j;
        }
        
        if (namaItemIdx !== -1 && trxDateIdx !== -1 && digit1LotIdx !== -1 && totalIdx !== -1 && unitIdx !== -1) {
          headerRowIdx = i;
          break; // Found all headers
        }
      }

      if (headerRowIdx === -1) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Could not find required columns in the file.' });
      }

      const recordsToInsert = [];
      
      const parseExcelDate = (excelDate: any) => {
        if (!excelDate) return new Date();
        if (typeof excelDate === 'number') {
          return new Date(Math.round((excelDate - 25569) * 86400 * 1000));
        }
        const parsed = new Date(excelDate);
        return isNaN(parsed.getTime()) ? new Date() : parsed;
      };

      const getSupplierName = (code: string) => {
        const map: Record<string, string> = {
          'P': 'HANCHANG',
          'M': 'MEGA SURYA ERATAMA',
          'X': 'XSD',
          'F': 'FAJAR',
          'H': 'HANSOL',
          'TX': 'HANCHANG ORDERED FROM XSD',
          'SF': 'FAJAR OREDERED FROM SONA',
          'CH': 'HANSOL ORDERED FROM CATUR',
          'CX': 'XSD ORDERED FROM CINJOE',
          'SM': 'MEGA ORDERED FROM SONA'
        };
        return map[code.toUpperCase()] || code;
      };

      let currentItemDesc = '';
      let currentDate = new Date();

      for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const rawItem = row[namaItemIdx];
        if (rawItem !== undefined && rawItem !== null && String(rawItem).trim() !== '') {
          currentItemDesc = String(rawItem).trim();
        }

        if (!currentItemDesc || currentItemDesc.toUpperCase().includes('TOTAL')) {
          continue;
        }

        const rawDate = row[trxDateIdx];
        if (rawDate !== undefined && rawDate !== null && String(rawDate).trim() !== '') {
          currentDate = parseExcelDate(rawDate);
        }

        const digit1Lot = String(row[digit1LotIdx] || '').trim();
        const totalRaw = String(row[totalIdx] || '').replace(/,/g, '').trim();
        const unit = String(row[unitIdx] || '').trim();

        if (totalRaw !== '' && !isNaN(parseFloat(totalRaw))) {
          const qty = parseFloat(totalRaw);
          const supplier = getSupplierName(digit1Lot);

          recordsToInsert.push({
            itemDesc: currentItemDesc,
            date: currentDate,
            supplier,
            qty,
            unit,
          });
        }
      }

      if (recordsToInsert.length === 0) {
        return reply.code(400).send({ error: 'Bad Request', message: 'No valid data found in Excel.' });
      }

      return reply.code(200).send({ 
        message: 'File parsed successfully',
        data: recordsToInsert
      });
    } catch (error) {
      server.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error', message: 'Failed to process file' });
    }
  });

  // Import (Save) dengan mode Add atau Overwrite — WAJIB menyertakan periode.
  server.post('/api/v1/stock-raw-material/import', { preValidation: [authenticate] }, async (request, reply) => {
    const body = (request.body || {}) as {
      data?: { itemDesc: string; supplier: string; qty: number; unit: string; date: string | Date }[];
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

    try {
      const previousCount = await prisma.stockRawMaterial.count({ where: { periodId } });

      const recordsToInsert = data.map((record) => ({
        periodId,
        itemDesc: record.itemDesc,
        supplier: record.supplier || null,
        qty: Number(record.qty) || 0,
        unit: record.unit,
        date: new Date(record.date),
      }));

      await prisma.$transaction(
        async (tx) => {
          if (mode === 'overwrite') {
            // HANYA periode ini yang dikosongkan.
            await tx.stockRawMaterial.deleteMany({ where: { periodId } });
          }
          for (let i = 0; i < recordsToInsert.length; i += 1000) {
            await tx.stockRawMaterial.createMany({ data: recordsToInsert.slice(i, i + 1000) });
          }
        },
        { timeout: 180000, maxWait: 30000 },
      );

      await recordPeriodChange({
        periodId,
        userId: request.user!.id,
        sourceType: 'STOCK_RM',
        rowCount: recordsToInsert.length,
        replaced: previousCount,
        fileName: body.fileName ?? null,
        mode,
      });

      return reply.code(201).send({
        message:
          mode === 'overwrite'
            ? `Periode "${resolved.label}" ditimpa dengan ${recordsToInsert.length} baris stok.`
            : `Ditambahkan ${recordsToInsert.length} baris stok ke periode "${resolved.label}".`,
        count: recordsToInsert.length,
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
  server.post('/api/v1/stock-raw-material', { preValidation: [authenticate] }, async (request, reply) => {
    const body = (request.body || {}) as any;
    const { itemDesc, supplier, unit, qty, date } = body;

    if (!itemDesc || !unit || qty === undefined || !date) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Required fields are missing' });
    }

    const resolved = await resolveUploadPeriod(body, request.user!.id);
    if (!resolved.ok) {
      return reply.code(resolved.code).send({ error: 'Bad Request', message: resolved.message });
    }

    const result = await prisma.stockRawMaterial.create({
      data: {
        periodId: resolved.periodId,
        itemDesc,
        supplier: supplier || null,
        unit,
        qty: parseFloat(qty),
        date: new Date(date),
      },
    });

    await touchPeriod(resolved.periodId);
    return reply.code(201).send({ data: result });
  });

  // Update
  server.put('/api/v1/stock-raw-material/:id', { preValidation: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { itemDesc, supplier, unit, qty, date } = request.body as any;

    const existing = await prisma.stockRawMaterial.findUnique({ where: { id } });
    if (!existing) {
      return reply.code(404).send({ error: 'Not Found', message: 'Record not found' });
    }

    const updated = await prisma.stockRawMaterial.update({
      where: { id },
      data: {
        ...(itemDesc && { itemDesc }),
        ...(supplier !== undefined && { supplier }),
        ...(unit && { unit }),
        ...(qty !== undefined && { qty: parseFloat(qty) }),
        ...(date && { date: new Date(date) }),
      },
    });

    await touchPeriod(existing.periodId);
    return reply.send({ data: updated });
  });

  // Delete
  server.delete('/api/v1/stock-raw-material/:id', { preValidation: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.stockRawMaterial.findUnique({ where: { id } });
    if (!existing) {
      return reply.code(404).send({ error: 'Not Found', message: 'Record not found' });
    }

    await prisma.stockRawMaterial.delete({ where: { id } });

    await touchPeriod(existing.periodId);
    return reply.send({ message: 'Record deleted successfully' });
  });

  // Bulk Delete
  server.post('/api/v1/stock-raw-material/bulk-delete', { preValidation: [authenticate] }, async (request, reply) => {
    const { ids } = request.body as { ids: string[] };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Valid ids array is required' });
    }

    try {
      const affected = await prisma.stockRawMaterial.findMany({
        where: { id: { in: ids } },
        select: { periodId: true },
      });
      const result = await prisma.stockRawMaterial.deleteMany({
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
