import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../lib/api';

export interface WIP {
  id: string;
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

export function useWIPs() {
  return useQuery<{ data: WIP[] }, Error>({
    queryKey: ['wips'],
    queryFn: () => fetchApi('/wip'),
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
    }) => 
      fetchApi('/wip', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wips'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
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
    mutationFn: (data: { records: any[]; saveMode?: 'overwrite' | 'add' }) => 
      fetchApi('/wip/bulk', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wips'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
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
