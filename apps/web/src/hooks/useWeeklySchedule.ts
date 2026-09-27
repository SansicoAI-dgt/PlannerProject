import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../lib/api';
import { PERIOD_QUERY_KEY } from './usePeriods';

export interface WeeklyScheduleRecord {
  itemId: string;
  itemCode: string;
  itemName: string;
  total: number;
  weeks: Record<
    number,
    {
      id: string;
      quantity: number;
      weekStartDate: string;
      weekEndDate: string;
    }
  >;
}

/**
 * Ringkasan MRP untuk SATU periode. `periodId` wajib — tanpa itu permintaan
 * tidak dijalankan supaya demand antar bulan tidak pernah tercampur.
 */
export function useWeeklyScheduleSummary(periodId?: string | null) {
  return useQuery<{ data: WeeklyScheduleRecord[]; year: number }, Error>({
    queryKey: ['weeklySchedule', 'summary', periodId],
    enabled: Boolean(periodId),
    queryFn: () =>
      fetchApi(`/weekly-schedule/summary?periodId=${encodeURIComponent(periodId as string)}`),
    staleTime: 1000 * 60,
  });
}

export function useBulkUpsertWeeklySchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      records: Array<{
        year: number;
        weekNumber: number;
        weekStartDate?: string;
        weekEndDate?: string;
        itemCode: string;
        toyName?: string;
        quantity: number;
      }>;
      saveMode: 'overwrite' | 'add';
      periodId: string;
    }) =>
      fetchApi('/weekly-schedule/bulk', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weeklySchedule'] });
      queryClient.invalidateQueries({ queryKey: PERIOD_QUERY_KEY });
    },
  });
}

export function useDeleteWeeklySchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetchApi(`/weekly-schedule/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weeklySchedule'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateWeeklySchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; quantity: number; weekStartDate?: string; weekEndDate?: string }) =>
      fetchApi(`/weekly-schedule/${data.id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weeklySchedule'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpsertWeeklySchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      year: number;
      weekNumber: number;
      weekStartDate?: string;
      weekEndDate?: string;
      itemId?: string;
      itemCode?: string;
      toyName?: string;
      quantity: number;
      saveMode?: 'overwrite' | 'add';
      periodId: string;
    }) =>
      fetchApi('/weekly-schedule', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weeklySchedule'] });
      queryClient.invalidateQueries({ queryKey: PERIOD_QUERY_KEY });
    },
  });
}

export function useBulkDeleteWeeklySchedule() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: { ids: string[] }) =>
      fetchApi('/weekly-schedule/bulk', {
        method: 'DELETE',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weeklySchedule'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
