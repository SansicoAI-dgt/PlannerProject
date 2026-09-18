import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../lib/api';

export interface HotlistData {
  id: string;
  partNumber: string;
  date: string;
  previousDate?: string | null;
  biTotal: number;
  createdAt: string;
  updatedAt: string;
}

export const useHotlist = () => {
  return useQuery({
    queryKey: ['hotlist'],
    queryFn: async () => {
      const response = await fetchApi<{ data: HotlistData[] }>('/hotlist');
      return response;
    },
  });
};

export const useUploadHotlist = () => {
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetchApi<{ message: string; data: Omit<HotlistData, 'id' | 'createdAt' | 'updatedAt'>[] }>('/hotlist/upload', {
        method: 'POST',
        body: formData,
      });
      return response;
    },
  });
};

export const useAddManualHotlist = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { partNumber: string; date: string; biTotal: number }) => {
      const response = await fetchApi<{ data: HotlistData }>('/hotlist', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotlist'] });
    },
  });
};

export const useUpdateHotlist = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<{ partNumber: string; date: string; biTotal: number }> }) => {
      const response = await fetchApi<{ data: HotlistData }>(`/hotlist/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotlist'] });
    },
  });
};

export const useDeleteHotlist = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetchApi<{ message: string }>(`/hotlist/${id}`, {
        method: 'DELETE',
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotlist'] });
    },
  });
};

export const useImportHotlist = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ data, mode }: { data: Omit<HotlistData, 'id' | 'createdAt' | 'updatedAt'>[], mode: 'add' | 'overwrite' }) => {
      const response = await fetchApi<{ message: string; count: number }>('/hotlist/import', {
        method: 'POST',
        body: JSON.stringify({ data, mode }),
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotlist'] });
    },
  });
};

export const useBulkDeleteHotlist = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await fetchApi<{ message: string; count: number }>('/hotlist/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotlist'] });
    },
  });
};
