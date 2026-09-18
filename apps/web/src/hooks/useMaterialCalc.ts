import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../lib/api';

export interface PartNumberDetail {
  partNumber: string;
  productName: string;
  demandPcs: number;
  noNpofData: boolean;
  sheetsKotor: number;
  kgKotor: number;
  hotlistNet: number;
  pcsNet1: number;
  sheetsNet1Allow: number;
  wipSheet: number;
  wipPcs: number;
  sheetsNet2: number;
  kgNet2: number;
  shortageKg: number | null;
  shortageSheet: number | null;
  shortagePcs: number | null;
  isSufficient: boolean;
  surplusKg: number | null;
}

export interface WeeklyMatrixColumn {
  poMonthKey: string;
  poMonthLabel: string;
  weekStartDate: string;
  weekEndDate: string;
}

export interface WeeklyMatrixRow {
  partNumber: string;
  productName: string;
  gsm: string;
  width: string;
  length: string;
  up: number;
  kgPerSheet: number;
  weeks: number[];
}

export interface WeeklyMatrixSummary {
  totalReq: number[];
  allowance: number[];
  totalPlusAllowance: number[];
  stockAsOf: number;
  outstandingPo: number[];
  endInd: number[];
}

export interface WeeklyMatrix {
  columns: WeeklyMatrixColumn[];
  rows: WeeklyMatrixRow[];
  summary: WeeklyMatrixSummary;
}

export interface MaterialGroup {
  ukuran: string;
  gramatur: string;
  supplier: string;
  leadTimeMonths: number;
  planningTimeline?: {
    purchaseMonth: string;
    arrivalMonth: string;
    usageMonth: string;
  };
  totalShortageSheet: number | null;
  totalShortagePcs: number | null;
  totalShortageKg: number | null;
  isSufficient: boolean;
  surplusKg: number | null;
  details: PartNumberDetail[];
  weeklyMatrix?: WeeklyMatrix;
}

export interface MaterialCalcResponse {
  calculatedAt: string;
  periodWeeks: number;
  periodStartDate: string;
  periodEndDate: string;
  sourceData: Record<string, unknown[]>;
  groups: MaterialGroup[];
}

export interface CalculationHistorySummary {
  id: string;
  monthKey: string;
  periodStartDate: string;
  periodEndDate: string;
  periodWeeks: number;
  calculatedAt: string;
  savedAt: string;
  user: { name: string };
  sources: { sourceType: string }[];
}

export interface CalculationHistoryDetail extends CalculationHistorySummary {
  resultSnapshot: MaterialCalcResponse;
  sources: { sourceType: string; dataSnapshot: unknown }[];
}

export interface MRPWeek {
  year: number;
  weekNumber: number;
  weekStartDate: string;
  weekEndDate: string;
}

export function useMRPWeeks() {
  return useQuery<{ data: Array<{ year: number; weekNumber: number; weekStartDate: string; weekEndDate: string }> }, Error>({
    queryKey: ['mrp-weeks'],
    queryFn: () => fetchApi('/weekly-schedule'),
    staleTime: 5 * 60 * 1000,
    select: (response) => {
      const weeks = new Map<string, MRPWeek>();
      for (const record of response.data) {
        if (!record.weekStartDate || !record.weekEndDate || Number.isNaN(Date.parse(record.weekStartDate)) || Number.isNaN(Date.parse(record.weekEndDate))) {
          continue;
        }
        const key = `${record.year}-${record.weekNumber}`;
        const current = weeks.get(key);
        if (!current || record.weekStartDate < current.weekStartDate) {
          weeks.set(key, {
            year: record.year,
            weekNumber: record.weekNumber,
            weekStartDate: record.weekStartDate,
            weekEndDate: record.weekEndDate,
          });
        }
      }
      return { data: [...weeks.values()].sort((a, b) => a.weekStartDate.localeCompare(b.weekStartDate)) };
    },
  });
}

export function useMaterialCalc(startDate: string, endDate: string, enabled: boolean) {
  return useQuery({
    queryKey: ['material-calculation', startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({ startDate, endDate });
      const response = await fetchApi<MaterialCalcResponse>(
        `/material-calculation?${params.toString()}`
      );
      return response;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useSaveMaterialCalculation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: MaterialCalcResponse) =>
      fetchApi('/material-calculation/history', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-calculation-history'] });
    },
  });
}

export function useCalculationHistory() {
  return useQuery<{ data: CalculationHistorySummary[] }, Error>({
    queryKey: ['material-calculation-history'],
    queryFn: () => fetchApi('/material-calculation/history'),
    staleTime: 30 * 1000,
  });
}

export function useUpdateCalculationHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; periodStartDate: string; periodEndDate: string }) =>
      fetchApi(`/material-calculation/history/${data.id}`, {
        method: 'PUT',
        body: JSON.stringify({ periodStartDate: data.periodStartDate, periodEndDate: data.periodEndDate }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['material-calculation-history'] }),
  });
}

export function useDeleteCalculationHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchApi(`/material-calculation/history/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['material-calculation-history'] }),
  });
}

export function useCalculationHistoryDetail(id: string | null) {
  return useQuery<{ data: CalculationHistoryDetail }, Error>({
    queryKey: ['material-calculation-history', id],
    queryFn: () => fetchApi(`/material-calculation/history/${id}`),
    enabled: Boolean(id),
  });
}
