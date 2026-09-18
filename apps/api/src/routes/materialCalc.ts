import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';

// ============================================
// Lead Time & WIP Location Mapping
// ============================================

function getLeadTimeMonths(supplier: string): number {
  const s = (supplier || '').toLowerCase();
  if (s.includes('mega')) return 2;
  if (s.includes('hanchang')) return 3;
  if (s.includes('hansol')) return 3;
  if (s.includes('xsd') || s.includes('hongkong')) return 3;
  return 3; // default: import
}

const WIP_SHEET_LOCATIONS = ['blister', 'uv', 'varnish opp', 'die cut'];

function getWipUnit(location: string): 'sheet' | 'pcs' {
  const loc = location.toLowerCase();
  return WIP_SHEET_LOCATIONS.some(l => loc.includes(l)) ? 'sheet' : 'pcs';
}

// ============================================
// Fuzzy Match: NPOF descriptor vs Stock itemDesc
// ============================================

function buildNpofDescriptor(gramatur: string, sheetedSize: string): string {
  return `${gramatur} ${sheetedSize}`.toLowerCase().replace(/\s+/g, ' ').trim();
}

function fuzzyMatch(itemDesc: string, npofDescriptor: string): boolean {
  const desc = itemDesc.toLowerCase();
  const tokens = npofDescriptor.split(/[\s,x×\/]+/).filter(t => t.length >= 2);
  if (tokens.length === 0) return false;
  return tokens.every(token => desc.includes(token));
}

// ============================================
// Week range helpers
// ============================================

function getWeeksFromNow(weeksCount: number): { startDate: Date; endDate: Date } {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setDate(end.getDate() + weeksCount * 7);
  return { startDate: now, endDate: end };
}

function getWeeksFromNowByMonths(months: number): { startDate: Date; endDate: Date } {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setMonth(end.getMonth() + months);
  return { startDate: now, endDate: end };
}

function getPlanningTimeline(leadTimeMonths: number) {
  const purchaseDate = new Date();
  purchaseDate.setUTCHours(0, 0, 0, 0);
  purchaseDate.setUTCDate(1);

  const arrivalDate = new Date(purchaseDate);
  arrivalDate.setUTCMonth(arrivalDate.getUTCMonth() + Math.max(0, leadTimeMonths - 1));

  const usageDate = new Date(purchaseDate);
  usageDate.setUTCMonth(usageDate.getUTCMonth() + leadTimeMonths);

  const formatMonth = (date: Date) => date.toISOString().slice(0, 7);
  return {
    purchaseMonth: formatMonth(purchaseDate),
    arrivalMonth: formatMonth(arrivalDate),
    usageMonth: formatMonth(usageDate),
  };
}

const MONTH_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

// Purchase month for a given usage week.
// Ordering happens at the end of the month, so material bought at the end of
// month M with lead time L becomes available starting month (M + L + 1).
// Therefore usage in month U must be bought in month (U - L - 1).
function getPurchaseMonthKey(usageDate: Date, leadTimeMonths: number): string {
  const usageMonthIndex = usageDate.getUTCFullYear() * 12 + usageDate.getUTCMonth();
  const purchaseMonthIndex = usageMonthIndex - leadTimeMonths - 1;
  const year = Math.floor(purchaseMonthIndex / 12);
  const month = purchaseMonthIndex % 12;
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function getPurchaseMonthLabel(key: string): string {
  const parts = key.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  if (!year || !month || month < 1 || month > 12) return `PO ${key}`;
  return `PO ${MONTH_NAMES_ID[month - 1]}`;
}

function parseDimensions(sheetedSize: string): { width: string; length: string } {
  const normalized = (sheetedSize || '').replace(/,/g, '.').toLowerCase();
  const numbers = normalized.match(/\d+(?:\.\d+)?/g) || [];
  const first = numbers[0] ?? '';
  if (!first) return { width: '', length: '' };
  const second = numbers[1] ?? '';
  return { width: first, length: second };
}

function parseMaterialNumber(value: string | null | undefined): number {
  if (!value) return 0;
  const normalized = String(value).trim().replace(',', '.');
  const parsed = parseFloat(normalized);
  if (!isNaN(parsed)) return parsed;

  try {
    const expression = normalized.replace(/[^0-9.+*/()\-\s]/g, '');
    return Number(Function(`"use strict"; return (${expression})`)()) || 0;
  } catch {
    return 0;
  }
}

function normalizeNpofText(value: string | null | undefined, fallback: string): string {
  const normalized = String(value || '').trim();
  return !normalized || normalized === '-' || normalized.toLowerCase() === 'null' ? fallback : normalized;
}

// ============================================
// Core calculation per part number
// ============================================

interface CalcInput {
  demandPcs: number;
  ups: number;
  fm: number; // formulaMaterial kg/sheet
  biTotal: number; // hotlist biTotal (pcs)
  leadTimeDemandPcs: number; // demand during lead time period
  wipSheet: number;
  wipPcs: number;
  stockSheet: number;
  stockKg: number;
  poSheet: number;
  poKg: number;
  surplusSheet: number;
  surplusKg: number;
}

interface CalcResult {
  sheetsKotor: number;
  kgKotor: number;
  hotlistNet: number;
  pcsNet1: number;
  sheetsNet1: number;
  sheetsNet1Allow: number;
  pcsNet1Allow: number;
  kgNet1Allow: number;
  wipSheet: number;
  wipPcs: number;
  sheetsNet2: number;
  kgNet2: number; // Kebutuhan Produksi Bersih
  ltNeedSheet: number;
  ltNeedKg: number;
  shortageKg: number;
  shortageSheet: number | null;
  shortagePcs: number | null;
  isSufficient: boolean;
  surplusKg: number | null;
}

function calculate(input: CalcInput): CalcResult {
  const { demandPcs, ups, fm, biTotal, leadTimeDemandPcs, wipSheet, wipPcs } = input;

  // Step 2: Gross
  const sheetsKotor = demandPcs / ups;
  const kgKotor = sheetsKotor * fm;

  // Step 3: Hotlist net
  const hotlistLeadTimeDemand = leadTimeDemandPcs;
  const hotlistNet = Math.max(0, biTotal - hotlistLeadTimeDemand);
  const pcsNet1 = demandPcs - hotlistNet; // CAN be negative
  const sheetsNet1 = pcsNet1 / ups;

  // Step 4: Allowance 5%
  const sheetsNet1Allow = sheetsNet1 * 1.05;
  const pcsNet1Allow = pcsNet1 * 1.05;
  const kgNet1Allow = sheetsNet1Allow * fm;

  // Step 5: WIP net (combined formula)
  const sheetsNet2 = ((sheetsNet1Allow - wipSheet) * ups - wipPcs) / ups;

  // Step 6: Kebutuhan Produksi Bersih
  const kgNet2 = sheetsNet2 * fm;

  // Step 6.1 (lead time need)
  const ltNeedPcs = leadTimeDemandPcs;
  const ltSheetsKotor = ltNeedPcs / ups;
  const ltPcsNet1 = ltNeedPcs - Math.max(0, biTotal);
  const ltSheetsNet1Allow = (ltPcsNet1 / ups) * 1.05;
  const ltSheetsNet2 = ((ltSheetsNet1Allow - wipSheet) * ups - wipPcs) / ups;
  const ltNeedSheet = ltSheetsNet2;
  const ltNeedKg = ltNeedSheet * fm;

  // Step 6.3: Shortage
  const { surplusSheet, surplusKg } = input;
  const shortageKg = ((sheetsNet2 - surplusSheet) * fm) - surplusKg;

  let shortageSheet: number | null = null;
  let shortagePcs: number | null = null;
  const isSufficient = shortageKg <= 0;
  const surplusKgResult = isSufficient ? Math.abs(shortageKg) : null;

  if (!isSufficient) {
    // Step 6.4: CEIL
    shortageSheet = Math.ceil(shortageKg / fm);
    shortagePcs = shortageSheet * ups;
  }

  return {
    sheetsKotor,
    kgKotor,
    hotlistNet,
    pcsNet1,
    sheetsNet1,
    sheetsNet1Allow,
    pcsNet1Allow,
    kgNet1Allow,
    wipSheet,
    wipPcs,
    sheetsNet2,
    kgNet2,
    ltNeedSheet,
    ltNeedKg,
    shortageKg,
    shortageSheet,
    shortagePcs,
    isSufficient,
    surplusKg: surplusKgResult,
  };
}

// ============================================
// Main Route
// ============================================

export default async function materialCalcRoutes(server: FastifyInstance) {
  server.get('/api/v1/material-calculation/history', { preValidation: [authenticate] }, async (_request, reply) => {
    const histories = await prisma.calculationHistory.findMany({
      orderBy: { savedAt: 'desc' },
      select: {
        id: true,
        monthKey: true,
        periodStartDate: true,
        periodEndDate: true,
        periodWeeks: true,
        calculatedAt: true,
        savedAt: true,
        user: { select: { name: true } },
        sources: { select: { sourceType: true } },
      },
    });
    return reply.send({ data: histories });
  });

  server.post('/api/v1/material-calculation/history', { preValidation: [authenticate] }, async (request, reply) => {
    const body = request.body as {
      periodStartDate?: string;
      periodEndDate?: string;
      periodWeeks?: number;
      calculatedAt?: string;
      groups?: unknown[];
      sourceData?: Record<string, unknown>;
    };

    if (!body.periodStartDate || !body.periodEndDate || !body.groups || !body.sourceData) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Calculation result and source snapshots are required' });
    }

    const periodStartDate = new Date(body.periodStartDate);
    const periodEndDate = new Date(body.periodEndDate);
    if (isNaN(periodStartDate.getTime()) || isNaN(periodEndDate.getTime())) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Invalid calculation period dates' });
    }

    const monthKey = periodStartDate.toISOString().slice(0, 7);
    const sourceEntries = Object.entries(body.sourceData);
    const history = await prisma.calculationHistory.create({
      data: {
        monthKey,
        periodStartDate,
        periodEndDate,
        periodWeeks: body.periodWeeks || 0,
        calculatedAt: body.calculatedAt ? new Date(body.calculatedAt) : new Date(),
        savedBy: request.user!.id,
        resultSnapshot: {
          calculatedAt: body.calculatedAt || new Date().toISOString(),
          periodStartDate: body.periodStartDate,
          periodEndDate: body.periodEndDate,
          periodWeeks: body.periodWeeks || 0,
          groups: body.groups,
        } as any,
        sources: {
          create: sourceEntries.map(([sourceType, dataSnapshot]) => ({
            sourceType,
            dataSnapshot: dataSnapshot as any,
          })),
        },
      },
      include: { sources: { select: { sourceType: true } } },
    });

    return reply.code(201).send({ data: history });
  });

  server.get('/api/v1/material-calculation/history/:id', { preValidation: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const history = await prisma.calculationHistory.findUnique({
      where: { id },
      include: { sources: true, user: { select: { name: true } } },
    });
    if (!history) return reply.code(404).send({ error: 'Not Found', message: 'Calculation history not found' });
    return reply.send({ data: history });
  });

  server.put('/api/v1/material-calculation/history/:id', { preValidation: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { periodStartDate?: string; periodEndDate?: string };
    const existing = await prisma.calculationHistory.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: 'Not Found', message: 'Calculation history not found' });

    const periodStartDate = body.periodStartDate ? new Date(body.periodStartDate) : existing.periodStartDate;
    const periodEndDate = body.periodEndDate ? new Date(body.periodEndDate) : existing.periodEndDate;
    if (isNaN(periodStartDate.getTime()) || isNaN(periodEndDate.getTime()) || periodEndDate <= periodStartDate) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Invalid calculation period' });
    }

    const updated = await prisma.calculationHistory.update({
      where: { id },
      data: {
        periodStartDate,
        periodEndDate,
        periodWeeks: Math.max(1, Math.ceil((periodEndDate.getTime() - periodStartDate.getTime()) / (7 * 86400000))),
        monthKey: periodStartDate.toISOString().slice(0, 7),
      },
    });
    return reply.send({ data: updated });
  });

  server.delete('/api/v1/material-calculation/history/:id', { preValidation: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.calculationHistory.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return reply.code(404).send({ error: 'Not Found', message: 'Calculation history not found' });
    await prisma.calculationHistory.delete({ where: { id } });
    return reply.send({ success: true });
  });

  server.get('/api/v1/material-calculation', { preValidation: [authenticate] }, async (request, reply) => {
    const { periodWeeks: periodWeeksRaw, startDate: startDateRaw, endDate: endDateRaw } = request.query as {
      periodWeeks?: string;
      startDate?: string;
      endDate?: string;
    };
    const fallbackPeriodWeeks = parseInt(periodWeeksRaw || '8', 10);

    try {
      // ── 1. Fetch all NPOF materials ──────────────────────────────────────────
      const npofMaterials = await prisma.npofMaterial.findMany();

      // Build map: partNumber → NPOF data
      const npofByPartNumber = new Map<string, typeof npofMaterials[0]>();
      for (const m of npofMaterials) {
        if (!npofByPartNumber.has(m.partNumber)) {
          npofByPartNumber.set(m.partNumber, m);
        }
      }

      // Compute most common gramatur for fallback
      const gramaturCounts = new Map<string, number>();
      for (const m of npofMaterials) {
        if (m.gramatur) {
          gramaturCounts.set(m.gramatur, (gramaturCounts.get(m.gramatur) || 0) + 1);
        }
      }
      const defaultGramatur = [...gramaturCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
      const formulaMaterials = npofMaterials
        .map((material) => parseMaterialNumber(material.formulaMaterial))
        .filter((value) => value > 0)
        .sort((a, b) => a - b);
      const defaultFormulaMaterial = formulaMaterials[Math.floor(formulaMaterials.length / 2)] || 0;
      const upsValues = npofMaterials
        .map((material) => parseMaterialNumber(material.ups))
        .filter((value) => value > 0)
        .sort((a, b) => a - b);
      const defaultUps = upsValues[Math.floor(upsValues.length / 2)] || 1;

      // ── 2. Fetch demand for user-selected period ─────────────────────────────
      const hasSelectedRange = Boolean(startDateRaw && endDateRaw);
      const selectedStart = hasSelectedRange ? new Date(`${startDateRaw}T00:00:00.000Z`) : null;
      const selectedEnd = hasSelectedRange ? new Date(`${endDateRaw}T00:00:00.000Z`) : null;
      const validSelectedRange = selectedStart && selectedEnd && !isNaN(selectedStart.getTime()) && !isNaN(selectedEnd.getTime()) && selectedEnd > selectedStart;
      const { startDate: periodStart, endDate: periodEnd } = validSelectedRange
        ? { startDate: selectedStart!, endDate: selectedEnd! }
        : getWeeksFromNow(fallbackPeriodWeeks);
      const periodWeeks = Math.max(1, Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (7 * 86400000)));

      const weeklySchedules = await prisma.weeklySchedule.findMany({
        where: {
          weekStartDate: { gte: periodStart, lt: periodEnd },
        },
        include: { item: true },
      });

      // Build the weekly timeline (distinct weeks in the selected period).
      const weekColumns: { weekStartDate: Date; weekEndDate: Date; weekKey: string }[] = [];
      const weekColumnMap = new Map<string, { weekStartDate: Date; weekEndDate: Date }>();
      for (const ws of weeklySchedules) {
        const key = ws.weekStartDate.toISOString();
        if (!weekColumnMap.has(key)) {
          weekColumnMap.set(key, { weekStartDate: ws.weekStartDate, weekEndDate: ws.weekEndDate });
        }
      }
      weekColumns.push(
        ...[...weekColumnMap.values()]
          .sort((a, b) => a.weekStartDate.getTime() - b.weekStartDate.getTime())
          .map((w) => ({ ...w, weekKey: w.weekStartDate.toISOString() })),
      );

      // Aggregate demand per partNumber, and per partNumber per week.
      const demandByPartNumber = new Map<string, number>();
      const weeklyDemandByPart = new Map<string, Map<string, number>>();
      for (const ws of weeklySchedules) {
        const pn = ws.item.partNumber;
        demandByPartNumber.set(pn, (demandByPartNumber.get(pn) || 0) + ws.quantity);

        const weekKey = ws.weekStartDate.toISOString();
        let weekMap = weeklyDemandByPart.get(pn);
        if (!weekMap) {
          weekMap = new Map();
          weeklyDemandByPart.set(pn, weekMap);
        }
        weekMap.set(weekKey, (weekMap.get(weekKey) || 0) + ws.quantity);
      }

      const hotlists = await prisma.hotlist.findMany();

      if (demandByPartNumber.size === 0) {
        return reply.send({
          calculatedAt: new Date().toISOString(),
          periodWeeks,
          periodStartDate: periodStart.toISOString(),
          periodEndDate: new Date(periodEnd.getTime() - 86400000).toISOString(),
          sourceData: {
            MRP: weeklySchedules,
            NPOF: npofMaterials,
            StockRawMaterial: [],
            WIP: [],
            HOTLIST: hotlists,
            OutstandingPO: [],
          },
          groups: [],
        });
      }

      // ── 3. Fetch Hotlist ─────────────────────────────────────────────────────
      const hotlistByPartNumber = new Map<string, number>();
      for (const h of hotlists) {
        hotlistByPartNumber.set(h.partNumber, h.biTotal);
      }

      // ── 4. Fetch WIP ─────────────────────────────────────────────────────────
      const wips = await prisma.wIP.findMany({
        include: { item: true },
      });

      // Aggregate WIP per partNumber, split by sheet/pcs
      const wipSheetByPN = new Map<string, number>();
      const wipPcsByPN = new Map<string, number>();
      for (const w of wips) {
        const pn = w.item.partNumber;
        const unit = getWipUnit(w.location);
        if (unit === 'sheet') {
          wipSheetByPN.set(pn, (wipSheetByPN.get(pn) || 0) + w.quantity);
        } else {
          wipPcsByPN.set(pn, (wipPcsByPN.get(pn) || 0) + w.quantity);
        }
      }

      // ── 5. Fetch Stock Raw Material ──────────────────────────────────────────
      const stocks = await prisma.stockRawMaterial.findMany({
        orderBy: { date: 'desc' },
      });
      const latestStockMap = new Map<string, typeof stocks[0]>();
      for (const s of stocks) {
        const key = `${s.itemDesc}||${s.supplier || ''}`;
        if (!latestStockMap.has(key)) {
          latestStockMap.set(key, s);
        }
      }

      // ── 6. Fetch Outstanding PO ──────────────────────────────────────────────
      const pos = await prisma.outstandingPO.findMany();
      const poRemainingMap = new Map<string, { kg: number; sheet: number }>();
      for (const po of pos) {
        const key = `${po.itemDesc}||${po.supplierName}`;
        const existing = poRemainingMap.get(key) || { kg: 0, sheet: 0 };
        const remaining = po.qtyOrder - po.qtyDelivered;
        if (remaining <= 0) continue;
        const unit = (po.qtyOrderUnit || '').toLowerCase();
        if (unit === 'kg') {
          existing.kg += remaining;
        } else if (unit === 'sheet' || unit === 'sheets' || unit === 'rim') {
          existing.sheet += remaining;
        }
        poRemainingMap.set(key, existing);
      }

      // ── 7. Calculate per partNumber ──────────────────────────────────────────
      const allPartNumbers = [...demandByPartNumber.keys()];

      interface PartDetail {
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
        shortageKg: number;
        shortageSheet: number | null;
        shortagePcs: number | null;
        isSufficient: boolean;
        surplusKg: number | null;
        ukuran: string;
        gramatur: string;
        supplier: string;
        leadTimeMonths: number;
        planningTimeline: ReturnType<typeof getPlanningTimeline>;
        fm: number;
        ups: number;
        stockKg: number;
        poKg: number;
        weeklyCells: number[];
      }

      const partDetails: PartDetail[] = [];

      for (const pn of allPartNumbers) {
        const demandPcs = demandByPartNumber.get(pn) || 0;
        const npof = npofByPartNumber.get(pn);
        let noNpofData = !npof;

        const sheetedSize = normalizeNpofText(npof?.sheetedSize, '180cm (jumbo roll)');
        const gramatur = normalizeNpofText(npof?.gramatur, defaultGramatur || '-');
        const supplier = normalizeNpofText(npof?.supplier, 'Unknown');
        const fmFromNpof = parseMaterialNumber(npof?.formulaMaterial);
        const upsFromNpof = parseMaterialNumber(npof?.ups);
        const fm = fmFromNpof > 0 ? fmFromNpof : defaultFormulaMaterial;
        const ups = upsFromNpof > 0 ? upsFromNpof : defaultUps;
        if (fmFromNpof <= 0 || upsFromNpof <= 0) noNpofData = true;
        if (fm <= 0 || ups <= 0) continue;

        const leadTimeMonths = getLeadTimeMonths(supplier);

        // Lead time demand
        const { startDate: ltStart, endDate: ltEnd } = getWeeksFromNowByMonths(leadTimeMonths);
        const ltSchedules = await prisma.weeklySchedule.findMany({
          where: {
            weekStartDate: { gte: ltStart, lt: ltEnd },
            item: { partNumber: pn },
          },
          include: { item: true },
        });
        const leadTimeDemandPcs = ltSchedules.reduce((sum, ws) => sum + ws.quantity, 0);

        // WIP
        const wipSheet = wipSheetByPN.get(pn) || 0;
        const wipPcs = wipPcsByPN.get(pn) || 0;

        // Stock & PO fuzzy match
        const npofDescriptor = buildNpofDescriptor(gramatur, sheetedSize);
        let stockSheet = 0;
        let stockKg = 0;
        let poSheet = 0;
        let poKg = 0;

        for (const [key, stock] of latestStockMap.entries()) {
          const [itemDesc, stockSupplier] = key.split('||');
          const supplierMatch = !stockSupplier ||
            stockSupplier.toLowerCase().includes(supplier.toLowerCase()) ||
            supplier.toLowerCase().includes(stockSupplier.toLowerCase());
          if (!supplierMatch) continue;
          if (!fuzzyMatch(itemDesc, npofDescriptor)) continue;

          const unit = (stock.unit || '').toLowerCase();
          if (unit === 'kg') stockKg += stock.qty;
          else if (unit === 'sheet' || unit === 'sheets' || unit === 'rim') stockSheet += stock.qty;
          else stockKg += stock.qty;
        }

        for (const [key, po] of poRemainingMap.entries()) {
          const [itemDesc, poSupplier] = key.split('||');
          const supplierMatch = !poSupplier ||
            poSupplier.toLowerCase().includes(supplier.toLowerCase()) ||
            supplier.toLowerCase().includes(poSupplier.toLowerCase());
          if (!supplierMatch) continue;
          if (!fuzzyMatch(itemDesc, npofDescriptor)) continue;
          poSheet += po.sheet;
          poKg += po.kg;
        }

        // Step 6.2: Surplus
        const ltNeedKgSimple = (leadTimeDemandPcs / ups) * 1.05 * fm;
        const ltNeedSheetSimple = (leadTimeDemandPcs / ups) * 1.05;
        const surplusSheet = Math.max(0, stockSheet + poSheet - ltNeedSheetSimple);
        const surplusKg = Math.max(0, stockKg + poKg - ltNeedKgSimple);

        const result = calculate({
          demandPcs,
          ups,
          fm,
          biTotal: hotlistByPartNumber.get(pn) || 0,
          leadTimeDemandPcs,
          wipSheet,
          wipPcs,
          stockSheet,
          stockKg,
          poSheet,
          poKg,
          surplusSheet,
          surplusKg,
        });

        const npofProductName = weeklySchedules.find(ws => ws.item.partNumber === pn)?.item.itemName || pn;

        // ── 7.1 Weekly split of "Kebutuhan − Hotlist sisa lead time" ──────────
        // Hotlist net (pcs) is the remaining Hotlist after the lead-time demand.
        // Convert it to kg and net it against each week's demand chronologically.
        const hotlistNetPcs = Math.max(0, (hotlistByPartNumber.get(pn) || 0) - leadTimeDemandPcs);
        const hotlistNetKg = (hotlistNetPcs / ups) * fm;
        const weeklyDemand = weeklyDemandByPart.get(pn) || new Map<string, number>();
        let remainingHotlistKg = hotlistNetKg;
        const weeklyCells = weekColumns.map((col) => {
          const demandPcs = weeklyDemand.get(col.weekKey) || 0;
          const demandKg = (demandPcs / ups) * fm;
          const allocatedKg = Math.min(demandKg, remainingHotlistKg);
          remainingHotlistKg -= allocatedKg;
          // Negative = shortage to purchase, 0 = covered by hotlist.
          return -(demandKg - allocatedKg);
        });

        partDetails.push({
          partNumber: pn,
          productName: npof?.productName || npofProductName,
          demandPcs,
          noNpofData,
          sheetsKotor: result.sheetsKotor,
          kgKotor: result.kgKotor,
          hotlistNet: result.hotlistNet,
          pcsNet1: result.pcsNet1,
          sheetsNet1Allow: result.sheetsNet1Allow,
          wipSheet: result.wipSheet,
          wipPcs: result.wipPcs,
          sheetsNet2: result.sheetsNet2,
          kgNet2: result.kgNet2,
          shortageKg: result.shortageKg,
          shortageSheet: result.shortageSheet,
          shortagePcs: result.shortagePcs,
          isSufficient: result.isSufficient,
          surplusKg: result.surplusKg,
          ukuran: sheetedSize,
          gramatur,
          supplier,
          leadTimeMonths,
          planningTimeline: getPlanningTimeline(leadTimeMonths),
          fm,
          ups,
          stockKg: stockKg + stockSheet * fm,
          poKg: poKg + poSheet * fm,
          weeklyCells,
        });
      }

      // ── 8. Group by ukuran + gramatur + supplier ─────────────────────────────
      const groupMap = new Map<string, {
        ukuran: string;
        gramatur: string;
        supplier: string;
        leadTimeMonths: number;
        planningTimeline: ReturnType<typeof getPlanningTimeline>;
        totalShortageSheet: number;
        totalShortagePcs: number;
        totalShortageKg: number;
        isSufficient: boolean;
        surplusKg: number;
        details: PartDetail[];
      }>();

      for (const pd of partDetails) {
        const groupKey = `${pd.ukuran}||${pd.gramatur}||${pd.supplier}`;
        if (!groupMap.has(groupKey)) {
          groupMap.set(groupKey, {
            ukuran: pd.ukuran,
            gramatur: pd.gramatur,
            supplier: pd.supplier,
            leadTimeMonths: pd.leadTimeMonths,
            planningTimeline: pd.planningTimeline,
            totalShortageSheet: 0,
            totalShortagePcs: 0,
            totalShortageKg: 0,
            isSufficient: true,
            surplusKg: 0,
            details: [],
          });
        }
        const group = groupMap.get(groupKey)!;
        group.details.push(pd);
        if (!pd.isSufficient) {
          group.totalShortageSheet += pd.shortageSheet || 0;
          group.totalShortagePcs += pd.shortagePcs || 0;
          group.totalShortageKg += pd.shortageKg;
          group.isSufficient = false;
        } else {
          group.surplusKg += pd.surplusKg || 0;
        }
      }

      const round2 = (n: number) => Math.round(n * 100) / 100;

      const groups = [...groupMap.values()].map(g => {
        // Weekly columns for this group. The purchase month depends on the
        // supplier lead time, so each group can map the same usage week to a
        // different PO month.
        const columns = weekColumns.map(col => {
          const poMonthKey = getPurchaseMonthKey(col.weekStartDate, g.leadTimeMonths);
          return {
            poMonthKey,
            poMonthLabel: getPurchaseMonthLabel(poMonthKey),
            weekStartDate: col.weekStartDate.toISOString(),
            weekEndDate: col.weekEndDate.toISOString(),
          };
        });

        const rows = g.details.map(d => {
          const dimensions = parseDimensions(d.ukuran);
          return {
            partNumber: d.partNumber,
            productName: d.productName,
            gsm: d.gramatur,
            width: dimensions.width,
            length: dimensions.length,
            up: d.ups,
            kgPerSheet: d.fm,
            weeks: d.weeklyCells.map(round2),
          };
        });

        const weekCount = weekColumns.length;
        const totalReqRaw = new Array<number>(weekCount).fill(0);
        for (const d of g.details) {
          for (let i = 0; i < weekCount; i++) {
            totalReqRaw[i] += d.weeklyCells[i] || 0;
          }
        }
        const totalReq = totalReqRaw.map(round2);
        const allowance = totalReq.map(v => round2(v * 0.05));
        const totalPlusAllowance = totalReq.map((v, i) => round2(v + allowance[i]));

        // Group-level stock & outstanding PO are matched at the material level,
        // so they are identical for every part in the group — read them once.
        const groupFm = g.details[0]?.fm || 1;
        const stockAsOf = round2(g.details[0]?.stockKg || 0);
        const groupDescriptor = buildNpofDescriptor(g.gramatur, g.ukuran);
        const outstandingPoRaw = new Array<number>(weekCount).fill(0);
        for (const po of pos) {
          const supplierMatch =
            !po.supplierName ||
            po.supplierName.toLowerCase().includes(g.supplier.toLowerCase()) ||
            g.supplier.toLowerCase().includes(po.supplierName.toLowerCase());
          if (!supplierMatch) continue;
          if (!fuzzyMatch(po.itemDesc, groupDescriptor)) continue;
          const remaining = po.qtyOrder - po.qtyDelivered;
          if (remaining <= 0) continue;
          const unit = (po.qtyOrderUnit || '').toLowerCase();
          let kg = 0;
          if (unit === 'kg') kg = remaining;
          else if (unit === 'sheet' || unit === 'sheets' || unit === 'rim') kg = remaining * groupFm;
          else continue;

          const received = po.planReceivedDate;
          let targetIndex = weekCount - 1;
          for (let i = 0; i < weekCount; i++) {
            if (received <= weekColumns[i].weekStartDate) {
              targetIndex = i;
              break;
            }
          }
          outstandingPoRaw[targetIndex] += kg;
        }
        const outstandingPo = outstandingPoRaw.map(round2);

        let running = stockAsOf;
        const endInd = totalPlusAllowance.map((v, i) => {
          running += outstandingPo[i] + v; // v is negative (requirement outflow)
          return round2(running);
        });

        return {
          ukuran: g.ukuran,
          gramatur: g.gramatur,
          supplier: g.supplier,
          leadTimeMonths: g.leadTimeMonths,
          planningTimeline: g.planningTimeline,
          totalShortageSheet: g.isSufficient ? null : Math.ceil(g.totalShortageSheet),
          totalShortagePcs: g.isSufficient ? null : Math.ceil(g.totalShortagePcs),
          totalShortageKg: g.isSufficient ? null : g.totalShortageKg,
          isSufficient: g.isSufficient,
          surplusKg: g.isSufficient ? g.surplusKg : null,
          details: g.details.map(d => ({
            partNumber: d.partNumber,
            productName: d.productName,
            demandPcs: d.demandPcs,
            noNpofData: d.noNpofData,
            sheetsKotor: d.sheetsKotor,
            kgKotor: d.kgKotor,
            hotlistNet: d.hotlistNet,
            pcsNet1: d.pcsNet1,
            sheetsNet1Allow: d.sheetsNet1Allow,
            wipSheet: d.wipSheet,
            wipPcs: d.wipPcs,
            sheetsNet2: d.sheetsNet2,
            kgNet2: d.kgNet2,
            shortageKg: d.shortageKg,
            shortageSheet: d.shortageSheet,
            shortagePcs: d.shortagePcs,
            isSufficient: d.isSufficient,
            surplusKg: d.surplusKg,
          })),
          weeklyMatrix: {
            columns,
            rows,
            summary: {
              totalReq,
              allowance,
              totalPlusAllowance,
              stockAsOf,
              outstandingPo,
              endInd,
            },
          },
        };
      });

      return reply.send({
        calculatedAt: new Date().toISOString(),
        periodWeeks,
        periodStartDate: periodStart.toISOString(),
        periodEndDate: new Date(periodEnd.getTime() - 86400000).toISOString(),
        sourceData: {
          MRP: weeklySchedules,
          NPOF: npofMaterials,
          StockRawMaterial: stocks,
          WIP: wips,
          HOTLIST: hotlists,
          OutstandingPO: pos,
        },
        groups,
      });

    } catch (error) {
      server.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error', message: 'Failed to calculate material requirements' });
    }
  });
}
