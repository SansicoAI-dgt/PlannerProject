import { ItemStatus } from '../types';

export interface StatusCalculationInput {
  demand: number;
  fgStock: number;
  wip: number;
}

export interface StatusCalculationResult {
  status: ItemStatus;
  gap: number;
  totalSupply: number;
}

/**
 * Menghitung status item berdasarkan demand, FG stock, dan WIP
 * 
 * Logika:
 * - FULFILLED: FG Stock >= Demand (stok gudang sudah cukup)
 * - IN_PRODUCTION: FG < Demand, tapi FG + WIP >= Demand (butuh tunggu produksi)
 * - SHORTAGE: FG + WIP < Demand (tidak akan cukup)
 */
export function calculateItemStatus(input: StatusCalculationInput): StatusCalculationResult {
  const { demand, fgStock, wip } = input;
  const totalSupply = fgStock + wip;
  const gap = fgStock - demand;

  let status: ItemStatus;

  if (fgStock >= demand) {
    status = 'FULFILLED';
  } else if (totalSupply >= demand) {
    status = 'IN_PRODUCTION';
  } else {
    status = 'SHORTAGE';
  }

  return {
    status,
    gap,
    totalSupply,
  };
}
