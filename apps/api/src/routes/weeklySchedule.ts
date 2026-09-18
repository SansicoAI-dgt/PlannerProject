import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';

export default async function weeklyScheduleRoutes(server: FastifyInstance) {
  // GET /api/v1/weekly-schedule
  server.get('/api/v1/weekly-schedule', { preValidation: [authenticate] }, async (request, reply) => {
    const { year, weekNumber, itemId } = request.query as {
      year?: string;
      weekNumber?: string;
      itemId?: string;
    };

    const where: any = {};
    if (year) where.year = parseInt(year);
    if (weekNumber) where.weekNumber = parseInt(weekNumber);
    if (itemId) where.itemId = itemId;

    const schedules = await prisma.weeklySchedule.findMany({
      where,
      include: { item: true },
      orderBy: [{ year: 'asc' }, { weekNumber: 'asc' }],
    });

    return reply.send({ data: schedules });
  });

  // GET /api/v1/weekly-schedule/summary - Group by item, with W1-W26 relative to today.
  // W1 = first week whose weekStartDate >= today (today aligned to 00:00).
  server.get('/api/v1/weekly-schedule/summary', { preValidation: [authenticate] }, async (request, reply) => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Fetch only schedules whose week has not ended yet (anchor = today).
    // Sorting by weekStartDate gives chronological order.
    const schedules = await prisma.weeklySchedule.findMany({
      where: { weekStartDate: { gte: today } },
      include: { item: true },
      orderBy: [{ weekStartDate: 'asc' }],
    });

    // Map every distinct weekStartDate to a relative position (W1, W2, ...).
    const uniqueStarts: number[] = [];
    const seenStarts = new Set<number>();
    for (const s of schedules) {
      const ts = s.weekStartDate.getTime();
      if (!seenStarts.has(ts)) {
        seenStarts.add(ts);
        uniqueStarts.push(ts);
      }
    }
    uniqueStarts.sort((a, b) => a - b);
    const limitedStarts = uniqueStarts.slice(0, 26); // cap at 26 weeks
    const relWeekByStart: Record<number, number> = {};
    limitedStarts.forEach((ts, idx) => {
      relWeekByStart[ts] = idx + 1;
    });

    const itemMap: Record<string, any> = {};
    for (const s of schedules) {
      const relW = relWeekByStart[s.weekStartDate.getTime()];
      if (!relW) continue; // beyond W26
      if (!itemMap[s.itemId]) {
        itemMap[s.itemId] = {
          itemId: s.itemId,
          partNumber: s.item.partNumber,
          itemCode: s.item.partNumber,
          itemName: s.item.itemName,
          weeks: {},
          total: 0,
        };
      }
      itemMap[s.itemId].weeks[relW] = {
        id: s.id,
        quantity: s.quantity,
        weekStartDate: s.weekStartDate,
        weekEndDate: s.weekEndDate,
      };
      itemMap[s.itemId].total += s.quantity;
    }

    return reply.send({ data: Object.values(itemMap), year: today.getFullYear() });
  });

  // POST /api/v1/weekly-schedule (single upsert)
  server.post(
    '/api/v1/weekly-schedule',
    { preValidation: [authenticate, requireRole(['SUPER_ADMIN', 'ADMIN'])] },
    async (request, reply) => {
      const body = request.body as any;
      const { year, weekNumber, weekStartDate, weekEndDate, itemId, itemCode, description, quantity, saveMode } = body;
      const codeToUse = itemCode || body.partNumber;

      if (!year || !weekNumber || quantity === undefined || (!itemId && !codeToUse)) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Missing required fields' });
      }

      let finalItemId = itemId;
      if (!finalItemId && codeToUse) {
        let item = await prisma.item.findUnique({ where: { partNumber: codeToUse } });
        if (!item) {
          item = await prisma.item.create({
            data: { partNumber: codeToUse, itemName: description || codeToUse, unit: 'PCS' },
          });
        } else if (description && item.itemName !== description) {
          item = await prisma.item.update({ where: { id: item.id }, data: { itemName: description } });
        }
        finalItemId = item.id;
      }

      // Compute weekStartDate / weekEndDate if not provided
      const startDate = weekStartDate ? new Date(weekStartDate) : new Date();
      const endDate = weekEndDate ? new Date(weekEndDate) : new Date(startDate.getTime() + 6 * 86400000);

      const existing = await prisma.weeklySchedule.findUnique({
        where: { year_weekNumber_itemId: { year: parseInt(year), weekNumber: parseInt(weekNumber), itemId: finalItemId } },
      });

      const newQty =
        saveMode === 'add' && existing
          ? existing.quantity + parseFloat(quantity)
          : parseFloat(quantity);

      const schedule = await prisma.weeklySchedule.upsert({
        where: { year_weekNumber_itemId: { year: parseInt(year), weekNumber: parseInt(weekNumber), itemId: finalItemId } },
        update: { quantity: newQty, weekStartDate: startDate, weekEndDate: endDate },
        create: {
          year: parseInt(year),
          weekNumber: parseInt(weekNumber),
          weekStartDate: startDate,
          weekEndDate: endDate,
          itemId: finalItemId,
          quantity: newQty,
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: request.user!.id,
          action: existing ? 'UPDATE' : 'CREATE',
          entityType: 'WeeklySchedule',
          entityId: schedule.id,
          dataAfter: schedule as any,
        },
      });

      return reply.code(200).send({ data: schedule });
    }
  );

  // POST /api/v1/weekly-schedule/bulk
  server.post(
    '/api/v1/weekly-schedule/bulk',
    { preValidation: [authenticate, requireRole(['SUPER_ADMIN', 'ADMIN'])] },
    async (request, reply) => {
      const { records, saveMode } = request.body as any;
      if (!Array.isArray(records) || records.length === 0) {
        return reply.code(400).send({ error: 'Bad Request', message: 'No records provided' });
      }

      const CHUNK_SIZE = 100;

      // Filter valid records upfront
      const validRecords: any[] = records.filter(
        (r: any) => r.year && r.weekNumber && r.itemCode && r.quantity !== undefined,
      );
      if (validRecords.length === 0) {
        return reply.code(400).send({ error: 'Bad Request', message: 'No valid records' });
      }

      // ── Step 1: Batch-resolve items ──────────────────────────────────────────
      const uniqueCodes = [...new Set(validRecords.map((r: any) => r.itemCode as string))];

      // Build description map (first occurrence wins)
      const toyNameMap: Record<string, string> = {};
      for (const r of validRecords) {
        if (!toyNameMap[r.itemCode]) toyNameMap[r.itemCode] = r.description || r.itemCode;
      }

      // Fetch all existing items in one query
      const existingItems = await prisma.item.findMany({ where: { partNumber: { in: uniqueCodes } } });
      const itemCodeToId: Record<string, string> = {};
      for (const item of existingItems) itemCodeToId[item.partNumber] = item.id;

      // Create missing items in one batch
      const missingCodes = uniqueCodes.filter((code) => !itemCodeToId[code]);
      if (missingCodes.length > 0) {
        await prisma.item.createMany({
          data: missingCodes.map((code) => ({ partNumber: code, itemName: toyNameMap[code] || code, unit: 'PCS' })),
          skipDuplicates: true,
        });
        const newItems = await prisma.item.findMany({ where: { partNumber: { in: missingCodes } } });
        for (const item of newItems) itemCodeToId[item.partNumber] = item.id;
      }

      // Update stale item names in parallel (only changed ones)
      const nameUpdates = existingItems.filter(
        (item) => toyNameMap[item.partNumber] && item.itemName !== toyNameMap[item.partNumber],
      );
      if (nameUpdates.length > 0) {
        await Promise.all(
          nameUpdates.map((item) =>
            prisma.item.update({ where: { id: item.id }, data: { itemName: toyNameMap[item.partNumber] } }),
          ),
        );
      }

      if (saveMode === 'overwrite') {
        const scopeMap = new Map<string, { year: number; weekNumber: number; itemIds: Set<string> }>();
        for (const r of validRecords) {
          const year = parseInt(r.year);
          const weekNumber = parseInt(r.weekNumber);
          const key = `${year}_${weekNumber}`;
          
          if (!scopeMap.has(key)) {
            scopeMap.set(key, { year, weekNumber, itemIds: new Set() });
          }
          const itemId = itemCodeToId[r.itemCode];
          if (itemId) {
            scopeMap.get(key)!.itemIds.add(itemId);
          }
        }

        for (const scope of scopeMap.values()) {
          await prisma.weeklySchedule.deleteMany({
            where: {
              year: scope.year,
              weekNumber: scope.weekNumber,
              itemId: { notIn: Array.from(scope.itemIds) }
            }
          });
        }
      }

      // ── Step 2: Fetch all existing schedules for the years in one query ──────
      const years = [...new Set(validRecords.map((r: any) => parseInt(r.year)))] as number[];
      const existingSchedules = await prisma.weeklySchedule.findMany({
        where: { year: { in: years } },
        select: { id: true, year: true, weekNumber: true, itemId: true, quantity: true },
      });
      const scheduleMap: Record<string, { id: string; quantity: number }> = {};
      for (const s of existingSchedules) {
        scheduleMap[`${s.year}_${s.weekNumber}_${s.itemId}`] = { id: s.id, quantity: s.quantity };
      }

      // ── Step 3: Classify into creates and updates ─────────────────────────────
      const toCreate: any[] = [];
      const toUpdate: { id: string; quantity: number; weekStartDate: Date; weekEndDate: Date }[] = [];

      for (const r of validRecords) {
        const itemId = itemCodeToId[r.itemCode];
        if (!itemId) continue;
        const startDate = r.weekStartDate ? new Date(r.weekStartDate) : new Date();
        const endDate = r.weekEndDate ? new Date(r.weekEndDate) : new Date(startDate.getTime() + 6 * 86400000);
        const key = `${parseInt(r.year)}_${parseInt(r.weekNumber)}_${itemId}`;
        const existing = scheduleMap[key];
        const newQty = saveMode === 'add' && existing ? existing.quantity + parseFloat(r.quantity) : parseFloat(r.quantity);
        if (newQty <= 0 && saveMode !== 'overwrite') continue;

        if (existing) {
          toUpdate.push({ id: existing.id, quantity: newQty, weekStartDate: startDate, weekEndDate: endDate });
        } else {
          toCreate.push({
            year: parseInt(r.year),
            weekNumber: parseInt(r.weekNumber),
            weekStartDate: startDate,
            weekEndDate: endDate,
            itemId,
            quantity: newQty,
          });
        }
      }

      // ── Step 4: Execute in a transaction with batched operations ──────────────
      let createdCount = 0;
      let updatedCount = 0;

      await prisma.$transaction(
        async (tx) => {
          // createMany in chunks
          for (let i = 0; i < toCreate.length; i += CHUNK_SIZE) {
            const result = await tx.weeklySchedule.createMany({ data: toCreate.slice(i, i + CHUNK_SIZE), skipDuplicates: true });
            createdCount += result.count;
          }
          // Parallel updates in chunks
          for (let i = 0; i < toUpdate.length; i += CHUNK_SIZE) {
            await Promise.all(
              toUpdate.slice(i, i + CHUNK_SIZE).map((u) =>
                tx.weeklySchedule.update({
                  where: { id: u.id },
                  data: { quantity: u.quantity, weekStartDate: u.weekStartDate, weekEndDate: u.weekEndDate },
                }),
              ),
            );
            updatedCount += toUpdate.slice(i, i + CHUNK_SIZE).length;
          }
          // Single audit log for the whole operation
          await tx.auditLog.create({
            data: {
              userId: request.user!.id,
              action: 'CREATE',
              entityType: 'WeeklySchedule',
              entityId: 'bulk',
              notes: `Bulk upserted ${createdCount + updatedCount} records (${createdCount} created, ${updatedCount} updated)`,
            },
          });
        },
        { timeout: 30000 },
      );

      return reply.code(200).send({ count: createdCount + updatedCount });
    },
  );

  // PUT /api/v1/weekly-schedule/:id
  server.put(
    '/api/v1/weekly-schedule/:id',
    { preValidation: [authenticate, requireRole(['SUPER_ADMIN', 'ADMIN'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { quantity, weekStartDate, weekEndDate } = request.body as any;

      const existing = await prisma.weeklySchedule.findUnique({ where: { id } });
      if (!existing) {
        return reply.code(404).send({ error: 'Not Found', message: 'Weekly schedule not found' });
      }

      const schedule = await prisma.weeklySchedule.update({
        where: { id },
        data: {
          quantity: parseFloat(quantity),
          ...(weekStartDate && { weekStartDate: new Date(weekStartDate) }),
          ...(weekEndDate && { weekEndDate: new Date(weekEndDate) })
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: request.user!.id,
          action: 'UPDATE',
          entityType: 'WeeklySchedule',
          entityId: schedule.id,
          dataAfter: schedule as any,
        },
      });

      return reply.send({ data: schedule });
    }
  );

  // DELETE /api/v1/weekly-schedule/bulk
  server.delete(
    '/api/v1/weekly-schedule/bulk',
    { preValidation: [authenticate, requireRole(['SUPER_ADMIN', 'ADMIN'])] },
    async (request, reply) => {
      const { ids } = request.body as { ids: string[] };
      if (!Array.isArray(ids) || ids.length === 0) {
        return reply.code(400).send({ error: 'Bad Request', message: 'No ids provided' });
      }

      await prisma.weeklySchedule.deleteMany({
        where: { id: { in: ids } },
      });

      await prisma.auditLog.create({
        data: {
          userId: request.user!.id,
          action: 'DELETE',
          entityType: 'WeeklySchedule',
          entityId: 'bulk',
          notes: `Bulk deleted ${ids.length} records`,
        },
      });

      return reply.send({ success: true, count: ids.length });
    }
  );

  // DELETE /api/v1/weekly-schedule/:id
  server.delete(
    '/api/v1/weekly-schedule/:id',
    { preValidation: [authenticate, requireRole(['SUPER_ADMIN', 'ADMIN'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await prisma.weeklySchedule.delete({ where: { id } });
      return reply.send({ message: 'Deleted successfully' });
    }
  );
}
