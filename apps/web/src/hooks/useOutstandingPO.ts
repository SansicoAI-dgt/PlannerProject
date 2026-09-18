import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../lib/api';

export interface OutstandingPOData {
  id: string;
  planReceivedDate: string;
  supplierName: string;
  itemDesc: string;
  qtyOrder: number;
  qtyOrderUnit: string;
  qtyDelivered: number;
  qtyDeliveredUnit: string;
  createdAt: string;
  updatedAt: string;
}

export function useOutstandingPO() {
  return useQuery({
    queryKey: ['outstanding-po'],
    queryFn: async () => {
      const response = await fetchApi<{ data: OutstandingPOData[] }>('/outstanding-po');
      return response.data;
    },
  });
}

export function useUploadOutstandingPO() {
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetchApi<{ message: string; data: Omit<OutstandingPOData, 'id' | 'createdAt' | 'updatedAt'>[] }>(
        '/outstanding-po/upload',
        {
          method: 'POST',
          body: formData,
        }
      );
      return response;
    },
  });
}

export function useImportOutstandingPO() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ data, mode }: { data: any[]; mode: 'add' | 'overwrite' }) => {
      const response = await fetchApi<{ message: string }>('/outstanding-po/import', { 
        method: 'POST',
        body: JSON.stringify({ data, mode }),
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outstanding-po'] });
    },
  });
}

export function useAddManualOutstandingPO() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Omit<OutstandingPOData, 'id' | 'createdAt' | 'updatedAt'>) => {
      const response = await fetchApi<{ data: OutstandingPOData }>('/outstanding-po', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outstanding-po'] });
    },
  });
}

export function useUpdateOutstandingPO() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Omit<OutstandingPOData, 'id' | 'createdAt' | 'updatedAt'>> }) => {
      const response = await fetchApi<{ data: OutstandingPOData }>(`/outstanding-po/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outstanding-po'] });
    },
  });
}

export function useDeleteOutstandingPO() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetchApi<{ message: string }>(`/outstanding-po/${id}`, {
        method: 'DELETE',
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outstanding-po'] });
    },
  });
}

export function useBulkDeleteOutstandingPO() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await fetchApi<{ message: string; count: number }>('/outstanding-po/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outstanding-po'] });
    },
  });
}
