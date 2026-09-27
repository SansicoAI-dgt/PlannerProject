import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { resolveUploadPeriod, recordPeriodChange, touchPeriod } from '../lib/periodScope';
import * as xlsx from 'xlsx';

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
      
      const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
      
      let headerRowIdx = -1;
      let colIdx = {
        planReceivedDate: -1,
        supplierName: -1,
        unit: -1,
        itemDesc: -1,
        qtyOrder: -1,
        qtyDelivered: -1,
      };

      // Find the headers
      for (let i = 0; i < Math.min(20, rows.length); i++) {
        const row = rows[i];
        if (!row) continue;
        
        let foundHeaders = 0;
        for (let j = 0; j < row.length; j++) {
          const cell = String(row[j] || '').toUpperCase().trim();
          
          if (cell === 'PLAN_RECEIVED_DATE') { colIdx.planReceivedDate = j; foundHeaders++; }
          else if (cell === 'SUPPLIER_NAME') { colIdx.supplierName = j; foundHeaders++; }
          else if (cell === 'UNIT') { colIdx.unit = j; foundHeaders++; }
          else if (cell === 'ITEM_DESC') { colIdx.itemDesc = j; foundHeaders++; }
          else if (cell === 'SUM OF QTY_ORDER') { colIdx.qtyOrder = j; foundHeaders++; }
          else if (cell === 'SUM OF DELIVERED_QTY') { colIdx.qtyDelivered = j; foundHeaders++; }
        }
        
        if (foundHeaders >= 4) { // Found at least 4 required headers
          headerRowIdx = i;
          break;
        }
      }

      if (headerRowIdx === -1) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Could not find required columns in the file (PLAN_RECEIVED_Date, Supplier_Name, ITEM_DESC, etc).' });
      }

      const recordsToInsert = [];

      for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        let planReceivedDateStr = String(row[colIdx.planReceivedDate] || '').trim();
        const supplierName = String(row[colIdx.supplierName] || '').trim();
        const itemDesc = String(row[colIdx.itemDesc] || '').trim();
        const qtyOrderUnit = String(row[colIdx.unit] || '').trim().toLowerCase();
        
        // Skip empty rows or totals
        if (!planReceivedDateStr || planReceivedDateStr.toUpperCase().includes('TOTAL')) continue;
        
        const qtyOrderStr = String(row[colIdx.qtyOrder] || '').trim();
        const qtyDeliveredStr = String(row[colIdx.qtyDelivered] || '').trim();
        
        const qtyOrder = parseFloat(qtyOrderStr) || 0;
        const qtyDelivered = parseFloat(qtyDeliveredStr) || 0;

        let planReceivedDate: Date;
        const parsedDate = new Date(planReceivedDateStr);
        if (!isNaN(parsedDate.getTime())) {
          planReceivedDate = parsedDate;
        } else {
          // Attempt parsing Excel serial date if it's a number
          const serialDate = parseFloat(planReceivedDateStr);
          if (!isNaN(serialDate)) {
             planReceivedDate = new Date(Math.round((serialDate - 25569) * 86400 * 1000));
          } else {
             continue; // Unparseable date
          }
        }
        planReceivedDate.setHours(0, 0, 0, 0);

        let qtyDeliveredUnit = qtyOrderUnit;
        if (qtyOrderUnit === 'rim') {
          qtyDeliveredUnit = 'sheets';
        }

        recordsToInsert.push({
          planReceivedDate,
          supplierName,
          itemDesc,
          qtyOrder,
          qtyOrderUnit: qtyOrderUnit || 'kg',
          qtyDelivered,
          qtyDeliveredUnit: qtyDeliveredUnit || 'kg',
        });
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
    const { planReceivedDate, supplierName, itemDesc, qtyOrder, qtyOrderUnit, qtyDelivered, qtyDeliveredUnit } = body;

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
    const { planReceivedDate, supplierName, itemDesc, qtyOrder, qtyOrderUnit, qtyDelivered, qtyDeliveredUnit } = request.body as any;

    const existing = await prisma.outstandingPO.findUnique({ where: { id } });
    if (!existing) {
      return reply.code(404).send({ error: 'Not Found', message: 'Record not found' });
    }

    const updated = await prisma.outstandingPO.update({
      where: { id },
      data: {
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
