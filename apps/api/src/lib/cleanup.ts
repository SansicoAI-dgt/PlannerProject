import prisma from './prisma';

/**
 * Auto-cleanup module
 *
 * Removes:
 *  - DailySchedule records whose date < today - 14 days
 *  - WeeklySchedule records whose weekEndDate < today - 14 days
 *
 * Runs on server startup, then every 24 hours.
 */

const RETENTION_DAYS = 14;
const RETENTION_MONTHS = 13;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function get14DaysCutoffDate(): Date {
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setTime(cutoff.getTime() - RETENTION_DAYS * ONE_DAY_MS);
  return cutoff;
}

function get13MonthsCutoffDate(): Date {
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);
  return cutoff;
}

export async function cleanupOldRecords(): Promise<{
  dailyDeleted: number;
  weeklyDeleted: number;
  hotlistDeleted: number;
  stockDeleted: number;
  wipDeleted: number;
}> {
  const cutoff14Days = get14DaysCutoffDate();
  const cutoff13Months = get13MonthsCutoffDate();

  try {
    const [dailyResult, weeklyResult, hotlistResult, stockResult, wipResult] = await Promise.all([
      prisma.dailySchedule.deleteMany({
        where: { date: { lt: cutoff14Days } },
      }),
      prisma.weeklySchedule.deleteMany({
        where: { weekEndDate: { lt: cutoff13Months } },
      }),
      prisma.hotlist.deleteMany({
        where: { date: { lt: cutoff13Months } },
      }),
      prisma.stockRawMaterial.deleteMany({
        where: { date: { lt: cutoff13Months } },
      }),
      prisma.wIP.deleteMany({
        where: { date: { lt: cutoff13Months } },
      }),
    ]);

    const total = dailyResult.count + weeklyResult.count + hotlistResult.count + stockResult.count + wipResult.count;
    if (total > 0) {
      console.log(
        `[Cleanup] Removed records: ${dailyResult.count} daily (14d), ${weeklyResult.count} weekly, ${hotlistResult.count} hotlist, ${stockResult.count} stock, ${wipResult.count} wip (13m)`,
      );
    } else {
      console.log(`[Cleanup] No old records to remove.`);
    }

    return {
      dailyDeleted: dailyResult.count,
      weeklyDeleted: weeklyResult.count,
      hotlistDeleted: hotlistResult.count,
      stockDeleted: stockResult.count,
      wipDeleted: wipResult.count,
    };
  } catch (err) {
    console.error('[Cleanup] Failed to remove old records:', err);
    throw err;
  }
}

let cleanupInterval: NodeJS.Timeout | null = null;

export function startCleanupSchedule(): void {
  // Run once on startup (non-blocking)
  cleanupOldRecords().catch((err) =>
    console.error('[Cleanup] Initial run failed:', err),
  );

  // Run daily
  if (cleanupInterval) clearInterval(cleanupInterval);
  cleanupInterval = setInterval(() => {
    cleanupOldRecords().catch((err) =>
      console.error('[Cleanup] Scheduled run failed:', err),
    );
  }, ONE_DAY_MS);
}

export function stopCleanupSchedule(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
