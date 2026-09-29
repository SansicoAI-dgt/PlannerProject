import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../lib/api';
import { PERIOD_QUERY_KEY, type DataModule } from './usePeriods';

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
 * Ringkasan MRP untuk SATU periode + SATU modul. `periodId` dan `moduleType`
 * wajib — tanpa itu demand antar bulan / antar modul akan tercampur.
 */
export function useWeeklyScheduleSummary(periodId?: string | null, moduleType: DataModule = 'PRODUCTION') {
  return useQuery<{ data: WeeklyScheduleRecord[]; year: number; moduleType: DataModule }, Error>({
    queryKey: ['weeklySchedule', 'summary', periodId, moduleType],
    enabled: Boolean(periodId),
    queryFn: () =>
      fetchApi(
        `/weekly-schedule/summary?periodId=${encodeURIComponent(periodId as string)}&moduleType=${moduleType}`,
      ),
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
      moduleType: DataModule;
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
      moduleType: DataModule;
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
