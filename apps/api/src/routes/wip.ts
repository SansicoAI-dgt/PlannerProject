import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';

export default async function wipRoutes(server: FastifyInstance) {
  // Get all WIPs
  server.get('/api/v1/wip', { preValidation: [authenticate] }, async (request, reply) => {
    const wips = await prisma.wIP.findMany({
      include: { item: true, user: { select: { name: true } } },
    });
    return reply.send({ data: wips });
  });

  // Upsert WIP
  server.post(
    '/api/v1/wip',
    { preValidation: [authenticate, requireRole(['SUPER_ADMIN', 'ADMIN'])] },
    async (request, reply) => {
      const { itemId, location, quantity, progressPercent, date, shift, status, notes, saveMode } = request.body as any;

      if (!itemId || !location || quantity === undefined || !date || !shift) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Missing required fields' });
      }

      const existingWip = await prisma.wIP.findUnique({
        where: { itemId_location: { itemId, location } },
      });

      const updatedWip = await prisma.wIP.upsert({
        where: { itemId_location: { itemId, location } },
        update: {
          quantity: saveMode === 'add' ? (existingWip?.quantity || 0) + parseFloat(quantity) : parseFloat(quantity),
          progressPercent: parseInt(progressPercent || 0),
          date: new Date(date),
          shift: parseInt(shift),
          status: status || 'IN_PROGRESS',
          notes,
          updatedBy: request.user!.id,
        },
        create: {
          itemId,
          location,
          quantity: parseFloat(quantity),
          progressPercent: parseInt(progressPercent || 0),
          date: new Date(date),
          shift: parseInt(shift),
          status: status || 'IN_PROGRESS',
          notes,
          updatedBy: request.user!.id,
        },
      });

      // Audit Log
      await prisma.auditLog.create({
        data: {
          userId: request.user!.id,
          action: existingWip ? 'UPDATE' : 'CREATE',
          entityType: 'WIP',
          entityId: updatedWip.id,
          dataBefore: existingWip ? (existingWip as any) : null,
          dataAfter: updatedWip as any,
        },
      });

      return reply.code(200).send({ data: updatedWip });
    }
  );

  // Bulk Upsert WIP
  server.post(
    '/api/v1/wip/bulk',
    { preValidation: [authenticate, requireRole(['SUPER_ADMIN', 'ADMIN'])] },
    async (request, reply) => {
      const { records, saveMode } = request.body as any;
      if (!Array.isArray(records) || records.length === 0) {
        return reply.code(400).send({ error: 'Bad Request', message: 'No records provided' });
      }

      if (saveMode === 'overwrite') {
        const uniqueCodes = [...new Set(records.map((r: any) => (r.partNumber || r.itemCode) as string).filter(Boolean))];
        const existingItems = await prisma.item.findMany({ where: { partNumber: { in: uniqueCodes } } });
        const itemCodeToId: Record<string, string> = {};
        for (const item of existingItems) itemCodeToId[item.partNumber] = item.id;

        const scopeMap = new Map<string, { date: Date; itemsToKeep: { itemId: string, location: string }[] }>();
        for (const r of records) {
          const code = r.partNumber || r.itemCode;
          if (!code || !r.location || r.quantity === undefined || !r.date) continue;
          const date = new Date(r.date);
          const key = date.getTime().toString();
          
          if (!scopeMap.has(key)) {
            scopeMap.set(key, { date, itemsToKeep: [] });
          }
          if (itemCodeToId[code]) {
            scopeMap.get(key)!.itemsToKeep.push({ itemId: itemCodeToId[code], location: r.location });
          }
        }

        for (const scope of scopeMap.values()) {
          const keepSet = new Set(scope.itemsToKeep.map(i => `${i.itemId}_${i.location}`));
          
          const wips = await prisma.wIP.findMany({
            where: { date: scope.date },
            select: { id: true, itemId: true, location: true }
          });
          
          const idsToDelete = wips
            .filter(w => !keepSet.has(`${w.itemId}_${w.location}`))
            .map(w => w.id);
            
          if (idsToDelete.length > 0) {
            await prisma.wIP.deleteMany({
              where: { id: { in: idsToDelete } }
            });
          }
        }
      }

      const results = [];
      for (const record of records) {
        const { itemCode, partNumber, location, quantity, date } = record;
        const codeToUse = partNumber || itemCode;
        if (!codeToUse || !location || quantity === undefined || !date) continue;

        let item = await prisma.item.findUnique({ where: { partNumber: codeToUse } });
        if (!item) {
          item = await prisma.item.create({
            data: { partNumber: codeToUse, itemName: codeToUse, unit: 'pcs' },
          });
        }

        const existingWip = await prisma.wIP.findUnique({
          where: { itemId_location: { itemId: item.id, location } },
        });

        const updatedWip = await prisma.wIP.upsert({
          where: { itemId_location: { itemId: item.id, location } },
          update: {
            quantity: saveMode === 'add' ? (existingWip?.quantity || 0) + parseFloat(quantity) : parseFloat(quantity),
            date: new Date(date),
            updatedBy: request.user!.id,
          },
          create: {
            itemId: item.id,
            location,
            quantity: parseFloat(quantity),
            progressPercent: 0,
            date: new Date(date),
            shift: 1,
            status: 'IN_PROGRESS',
            updatedBy: request.user!.id,
          },
        });

        await prisma.auditLog.create({
          data: {
            userId: request.user!.id,
            action: existingWip ? 'UPDATE' : 'CREATE',
            entityType: 'WIP',
            entityId: updatedWip.id,
            notes: 'Bulk upserted WIP',
          },
        });
        results.push(updatedWip);
      }

      return reply.code(200).send({ data: results });
    }
  );

  // Update WIP by ID
  server.put(
    '/api/v1/wip/:id',
    { preValidation: [authenticate, requireRole(['SUPER_ADMIN', 'ADMIN'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { quantity, progressPercent, date, shift, status, notes } = request.body as any;

      const existingWip = await prisma.wIP.findUnique({ where: { id } });
      if (!existingWip) {
        return reply.code(404).send({ error: 'Not Found', message: 'WIP not found' });
      }

      const updatedWip = await prisma.wIP.update({
        where: { id },
        data: {
          quantity: parseFloat(quantity),
          progressPercent: parseInt(progressPercent || 0),
          date: new Date(date),
          shift: parseInt(shift),
          status: status || 'IN_PROGRESS',
          notes,
          updatedBy: request.user!.id,
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: request.user!.id,
          action: 'UPDATE',
          entityType: 'WIP',
          entityId: updatedWip.id,
          dataBefore: existingWip as any,
          dataAfter: updatedWip as any,
          notes: 'Updated WIP',
        },
      });

      return reply.send({ data: updatedWip });
    }
  );

  // Bulk Delete WIP
  server.delete(
    '/api/v1/wip/bulk',
    { preValidation: [authenticate, requireRole(['SUPER_ADMIN', 'ADMIN'])] },
    async (request, reply) => {
      const { ids } = request.body as { ids: string[] };
      if (!Array.isArray(ids) || ids.length === 0) {
        return reply.code(400).send({ error: 'Bad Request', message: 'No ids provided' });
      }

      await prisma.wIP.deleteMany({
        where: { id: { in: ids } },
      });

      await prisma.auditLog.create({
        data: {
          userId: request.user!.id,
          action: 'DELETE',
          entityType: 'WIP',
          entityId: 'bulk',
          notes: `Bulk deleted ${ids.length} records`,
        },
      });

      return reply.send({ success: true, count: ids.length });
    }
  );

  // Delete WIP by ID
  server.delete(
    '/api/v1/wip/:id',
    { preValidation: [authenticate, requireRole(['SUPER_ADMIN', 'ADMIN'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existingWip = await prisma.wIP.findUnique({ where: { id } });
      if (!existingWip) {
        return reply.code(404).send({ error: 'Not Found', message: 'WIP not found' });
      }

      await prisma.wIP.delete({ where: { id } });

      await prisma.auditLog.create({
        data: {
          userId: request.user!.id,
          action: 'DELETE',
          entityType: 'WIP',
          entityId: id,
          dataBefore: existingWip as any,
          notes: 'Deleted WIP',
        },
      });

      return reply.send({ success: true });
    }
  );
}
