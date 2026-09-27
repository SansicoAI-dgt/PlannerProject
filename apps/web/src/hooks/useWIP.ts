import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../lib/api';
import { PERIOD_QUERY_KEY } from './usePeriods';

export interface WIP {
  id: string;
  periodId: string;
  location: string;
  quantity: number;
  progressPercent: number;
  date: string;
  shift: number;
  status: string;
  notes: string | null;
  updatedAt: string;
  item: {
    id: string;
    partNumber: string;
    itemName: string;
  };
  user: {
    name: string;
  };
}

/**
 * Data WIP. Kalau `periodId` diberikan (selalu begitu di halaman WIP), data
 * difilter untuk periode itu saja. Tanpa `periodId` (mis. halaman Master Item
 * yang hanya memakai daftar nama lokasi) data diambil semua — angka WIP tidak
 * pernah ditampilkan di sana.
 */
export function useWIPs(periodId?: string | null) {
  return useQuery<{ data: WIP[] }, Error>({
    queryKey: ['wips', periodId ?? 'ALL'],
    queryFn: () =>
      fetchApi(periodId ? `/wip?periodId=${encodeURIComponent(periodId)}` : '/wip'),
  });
}

export function useUpsertWIP() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: { 
      itemId: string; 
      location: string; 
      quantity: number; 
      progressPercent: number;
      date: string;
      shift: number;
      status?: string;
      notes?: string;
      saveMode?: 'overwrite' | 'add';
      periodId: string;
    }) => 
      fetchApi('/wip', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wips'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: PERIOD_QUERY_KEY });
    },
  });
}

export function useDeleteWIP() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => 
      fetchApi(`/wip/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wips'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateWIP() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: { 
      id: string;
      quantity: number; 
      progressPercent: number;
      date: string;
      shift: number;
      status?: string;
      notes?: string;
    }) => 
      fetchApi(`/wip/${data.id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wips'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useBulkUpsertWIP() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: { records: any[]; saveMode?: 'overwrite' | 'add'; periodId: string }) => 
      fetchApi('/wip/bulk', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wips'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: PERIOD_QUERY_KEY });
    },
  });
}

export function useBulkDeleteWIP() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: { ids: string[] }) => 
      fetchApi('/wip/bulk', {
        method: 'DELETE',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wips'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
