import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '../lib/api';

export interface UnifiedShortageRecord {
  itemId: string;
  toyName: string;
  masterCarton: string;
  partNumber: string;
  date: string;
  shift: number;
  dailyDemand: number;
  weeklyDemand: number;
  fgStock: number;
  wip: number;
  wipDetails?: { location: string; quantity: number }[];
  dailyShortage: number;
  weeklyShortage: number;
  status: 'SHORTAGE';
}

export interface ShortageDetailsData {
  unifiedShortages: UnifiedShortageRecord[];
  shiftShortagesCount: number;
  dailyShortagesCount: number;
  weeklyShortagesCount: number;
}

export function useShortageDetails(date?: string) {
  return useQuery<ShortageDetailsData, Error>({
    queryKey: ['shortageDetails', date],
    queryFn: () => {
      const params = new URLSearchParams();
      if (date) params.append('date', date);
      
      const queryString = params.toString() ? `?${params.toString()}` : '';
      return fetchApi<ShortageDetailsData>(`/tracking/shortage-details${queryString}`);
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchInterval: 1000 * 60 * 5, // Auto refetch every 5 minutes
  });
}
