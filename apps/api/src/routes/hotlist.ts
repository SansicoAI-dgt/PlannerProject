import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import * as xlsx from 'xlsx';

export default async function hotlistRoutes(server: FastifyInstance) {
  // Get all hotlist items
  server.get('/api/v1/hotlist', { preValidation: [authenticate] }, async (request, reply) => {
    const data = await prisma.hotlist.findMany({
      orderBy: { date: 'desc' },
    });
    return reply.send({ data });
  });

  // Upload Excel
  server.post('/api/v1/hotlist/upload', { preValidation: [authenticate] }, async (request, reply) => {
    try {
      const data = await request.file();
      if (!data) {
        return reply.code(400).send({ error: 'Bad Request', message: 'No file uploaded' });
      }

      // Read file buffer
      const buffer = await data.toBuffer();
      
      // Parse excel
      const workbook = xlsx.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      
      const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
      
      let partNumberIdx = -1;
      let biTotalIdx = -1;
      let headerRowIdx = -1;

      // Find the headers
      for (let i = 0; i < Math.min(10, rows.length); i++) {
        const row = rows[i];
        if (!row) continue;
        for (let j = 0; j < row.length; j++) {
          const cell = String(row[j] || '').toLowerCase().trim();
          
          if (cell.includes('kode barang')) {
            partNumberIdx = j;
            headerRowIdx = i;
          }
          
          // Check for "BI TOTAL" either in one cell, or "BI" in row i-1 and "TOTAL" in row i
          if (cell.includes('bi total') || cell.includes('bitotal')) {
            biTotalIdx = j;
          } else if (cell.includes('total') && i > 0) {
            const cellAbove = String(rows[i-1]?.[j] || '').toLowerCase().trim();
            if (cellAbove.includes('bi')) {
              biTotalIdx = j;
            }
          }
        }
        
        if (partNumberIdx !== -1 && biTotalIdx !== -1) {
          if (headerRowIdx === -1) headerRowIdx = i;
          break; // Found both headers
        }
      }

      if (partNumberIdx === -1 || biTotalIdx === -1) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Could not find "Kode Barang" or "BI TOTAL" columns in the file.' });
      }

      const recordsToInsert = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Parse data after header
      for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const partNumber = String(row[partNumberIdx] || '').trim();
        const biTotalStr = String(row[biTotalIdx] || '').trim();
        const biTotal = parseFloat(biTotalStr);

        // Valid if part number is present, even if biTotal is 0
        if (partNumber && !isNaN(biTotal)) {
          recordsToInsert.push({
            partNumber,
            date: today,
            biTotal: biTotal * 1000,
          });
        }
      }

      if (recordsToInsert.length === 0) {
        return reply.code(400).send({ error: 'Bad Request', message: 'No valid data found in Excel.' });
      }

      // Return preview data instead of saving
      return reply.code(200).send({ 
        message: 'File parsed successfully',
        data: recordsToInsert
      });
    } catch (error) {
      server.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error', message: 'Failed to process file' });
    }
  });

  // Import (Save) with Add or Overwrite mode
  server.post('/api/v1/hotlist/import', { preValidation: [authenticate] }, async (request, reply) => {
    const { data, mode } = request.body as { 
      data: { partNumber: string; date: string | Date; biTotal: number }[];
      mode: 'add' | 'overwrite';
    };

    if (!data || !Array.isArray(data) || data.length === 0) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Valid data array is required' });
    }

    try {
      if (mode === 'overwrite') {
        // Delete existing records first
        await prisma.hotlist.deleteMany({});
        // Convert string dates to Date objects if necessary
        const recordsToInsert = data.map((record) => ({
          ...record,
          date: new Date(record.date),
        }));
        await prisma.hotlist.createMany({
          data: recordsToInsert,
        });
        return reply.code(201).send({
          message: `Successfully overwritten with ${recordsToInsert.length} records.`,
          count: recordsToInsert.length,
        });
      } else {
        // mode === 'add'
        let addedCount = 0;
        let updatedCount = 0;
        for (const record of data) {
          const existing = await prisma.hotlist.findUnique({
            where: { partNumber: record.partNumber },
          });

          if (existing) {
            await prisma.hotlist.update({
              where: { id: existing.id },
              data: {
                biTotal: existing.biTotal + record.biTotal,
                previousDate: existing.date,
                date: new Date(record.date),
              },
            });
            updatedCount++;
          } else {
            await prisma.hotlist.create({
              data: {
                ...record,
                date: new Date(record.date),
              },
            });
            addedCount++;
          }
        }
        return reply.code(201).send({
          message: `Successfully added ${addedCount} records and updated ${updatedCount} records.`,
          count: addedCount + updatedCount,
        });
      }
    } catch (error) {
      server.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error', message: 'Failed to import data' });
    }
  });

  // Add Manual
  server.post('/api/v1/hotlist', { preValidation: [authenticate] }, async (request, reply) => {
    const { partNumber, date, biTotal } = request.body as any;

    if (!partNumber || !date || biTotal === undefined) {
      return reply.code(400).send({ error: 'Bad Request', message: 'partNumber, date, and biTotal are required' });
    }

    const existing = await prisma.hotlist.findUnique({
      where: { partNumber },
    });

    let result;
    if (existing) {
      result = await prisma.hotlist.update({
        where: { id: existing.id },
        data: {
          biTotal: existing.biTotal + parseFloat(biTotal),
          previousDate: existing.date,
          date: new Date(date),
        },
      });
    } else {
      result = await prisma.hotlist.create({
        data: {
          partNumber,
          date: new Date(date),
          biTotal: parseFloat(biTotal),
        },
      });
    }

    return reply.code(201).send({ data: result });
  });

  // Update
  server.put('/api/v1/hotlist/:id', { preValidation: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { partNumber, date, biTotal } = request.body as any;

    const existingHotlist = await prisma.hotlist.findUnique({ where: { id } });
    if (!existingHotlist) {
      return reply.code(404).send({ error: 'Not Found', message: 'Hotlist record not found' });
    }

    const updatedHotlist = await prisma.hotlist.update({
      where: { id },
      data: {
        ...(partNumber && { partNumber }),
        ...(date && { date: new Date(date) }),
        ...(biTotal !== undefined && { biTotal: parseFloat(biTotal) }),
      },
    });

    return reply.send({ data: updatedHotlist });
  });

  // Delete
  server.delete('/api/v1/hotlist/:id', { preValidation: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existingHotlist = await prisma.hotlist.findUnique({ where: { id } });
    if (!existingHotlist) {
      return reply.code(404).send({ error: 'Not Found', message: 'Hotlist record not found' });
    }

    await prisma.hotlist.delete({ where: { id } });

    return reply.send({ message: 'Hotlist record deleted successfully' });
  });

  // Bulk Delete
  server.post('/api/v1/hotlist/bulk-delete', { preValidation: [authenticate] }, async (request, reply) => {
    const { ids } = request.body as { ids: string[] };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Valid ids array is required' });
    }

    try {
      const result = await prisma.hotlist.deleteMany({
        where: {
          id: {
            in: ids,
          },
        },
      });

      return reply.send({ message: `Successfully deleted ${result.count} records.`, count: result.count });
    } catch (error) {
      server.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error', message: 'Failed to delete records' });
    }
  });
}
