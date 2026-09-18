import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../lib/api';

export interface StockRawMaterialData {
  id: string;
  itemDesc: string;
  supplier: string | null;
  unit: string;
  qty: number;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export const useStockRawMaterial = () => {
  return useQuery({
    queryKey: ['stockRawMaterial'],
    queryFn: async () => {
      const response = await fetchApi<{ data: StockRawMaterialData[] }>('/stock-raw-material');
      return response;
    },
  });
};

export const useUploadStockRawMaterial = () => {
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetchApi<{ message: string; data: Omit<StockRawMaterialData, 'id' | 'createdAt' | 'updatedAt'>[] }>('/stock-raw-material/upload', {
        method: 'POST',
        body: formData,
      });
      return response;
    },
  });
};

export const useAddManualStockRawMaterial = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { itemDesc: string; supplier: string; unit: string; qty: number; date: string }) => {
      const response = await fetchApi<{ data: StockRawMaterialData }>('/stock-raw-material', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockRawMaterial'] });
    },
  });
};

export const useUpdateStockRawMaterial = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<{ itemDesc: string; supplier: string; unit: string; qty: number; date: string }> }) => {
      const response = await fetchApi<{ data: StockRawMaterialData }>(`/stock-raw-material/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockRawMaterial'] });
    },
  });
};

export const useDeleteStockRawMaterial = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetchApi<{ message: string }>(`/stock-raw-material/${id}`, {
        method: 'DELETE',
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockRawMaterial'] });
    },
  });
};

export const useImportStockRawMaterial = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ data, mode }: { data: Omit<StockRawMaterialData, 'id' | 'createdAt' | 'updatedAt'>[], mode: 'add' | 'overwrite' }) => {
      const response = await fetchApi<{ message: string; count: number }>('/stock-raw-material/import', {
        method: 'POST',
        body: JSON.stringify({ data, mode }),
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockRawMaterial'] });
    },
  });
};

export const useBulkDeleteStockRawMaterial = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await fetchApi<{ message: string; count: number }>('/stock-raw-material/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockRawMaterial'] });
    },
  });
};
