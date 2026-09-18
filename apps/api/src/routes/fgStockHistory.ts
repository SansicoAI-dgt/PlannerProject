import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';

export default async function fgStockHistoryRoutes(server: FastifyInstance) {
  server.get('/api/v1/fg-stock-history', { preValidation: [authenticate] }, async (request, reply) => {
    const { page = '1', limit = '50', search, startDate, endDate } = request.query as any;

    const parsedPage = parseInt(page, 10) || 1;
    const parsedLimit = parseInt(limit, 10) || 50;
    const skip = (parsedPage - 1) * parsedLimit;

    const whereClause: any = {};

    if (search) {
      whereClause.item = {
        OR: [
          { partNumber: { contains: search } },
          { description: { contains: search } },
        ]
      };
    }

    if (startDate || endDate) {
      whereClause.date = {};
      if (startDate) {
        whereClause.date.gte = new Date(startDate);
      }
      if (endDate) {
        whereClause.date.lte = new Date(endDate);
      }
    }

    const [total, histories] = await Promise.all([
      prisma.fGStockHistory.count({ where: whereClause }),
      prisma.fGStockHistory.findMany({
        where: whereClause,
        include: {
          item: true,
          user: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parsedLimit,
      }),
    ]);

    return reply.send({
      data: histories,
      pagination: {
        total,
        page: parsedPage,
        limit: parsedLimit,
        totalPages: Math.ceil(total / parsedLimit),
      },
    });
  });
}
