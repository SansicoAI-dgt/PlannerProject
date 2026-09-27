import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../lib/api';

/**
 * Periode upload (PlanningCycle) untuk halaman Master Data.
 *
 * Sejak 2026-09-28 semua data Master Data (26-Week Demand, WIP, Hot List,
 * Stock Raw Material, Outstanding PO) disimpan per periode upload, BUKAN
 * dikelompokkan otomatis dari tanggal di dalam data.
 */

export type PeriodSourceKey = 'MRP' | 'HOTLIST' | 'STOCK_RM' | 'OUTSTANDING_PO' | 'WIP';

export interface PeriodSummary {
  id: string;
  /** "2026-09" */
  uploadMonth: string;
  /** "September 2026" */
  label: string;
  isLocked: boolean;
  mrpStartDate: string | null;
  mrpEndDate: string | null;
  counts: Record<PeriodSourceKey, number>;
}

export const PERIOD_QUERY_KEY = ['periods'];

export function usePeriods() {
  return useQuery<{ data: PeriodSummary[] }, Error>({
    queryKey: PERIOD_QUERY_KEY,
    queryFn: () => fetchApi('/material-planning/periods'),
    staleTime: 10 * 1000,
  });
}

/** "2026-09" -> "September 2026" (dipakai untuk pratinjau sebelum periode dibuat). */
export function monthLabel(month: string): string {
  const [year, m] = month.split('-');
  const date = new Date(Number(year), Number(m) - 1, 1);
  return date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}

/**
 * Buat periode baru (kalau belum ada) supaya user bisa upload ke bulan yang
 * belum punya periode. Mengembalikan data periode yang siap dipakai.
 */
export function useCreatePeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { uploadMonth: string; label?: string }) =>
      fetchApi<{ data: { id: string; label: string; uploadMonth: string } }>('/material-planning/cycles', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PERIOD_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['material-planning-cycles'] });
    },
  });
}

/** Total baris semua sumber di satu periode. */
export function periodTotal(p: PeriodSummary): number {
  return Object.values(p.counts).reduce((sum, n) => sum + n, 0);
}
