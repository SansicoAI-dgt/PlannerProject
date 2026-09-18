import { useMemo, useState } from 'react';
import {
  useCalculationHistory,
  useCalculationHistoryDetail,
  useDeleteCalculationHistory,
  useMaterialCalc,
  useMRPWeeks,
  useSaveMaterialCalculation,
  useUpdateCalculationHistory,
  type MaterialGroup,
  type PartNumberDetail,
} from '../hooks/useMaterialCalc';
import { printMaterialCalculation } from '../lib/exportPdf';
import {
  Calculator,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Download,
  Loader2,
  Info,
  Save,
  Folder,
  X,
  Pencil,
  Trash2,
} from 'lucide-react';
import { format } from 'date-fns';
import { id as indonesianLocale } from 'date-fns/locale';

function formatNum(n: number | null | undefined, decimals = 2): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

function formatMonth(month: string): string {
  const date = new Date(`${month}-01T00:00:00`);
  return Number.isNaN(date.getTime()) ? 'Bulan tidak tersedia' : format(date, 'MMMM yyyy', { locale: indonesianLocale });
}

function formatWeekDate(date: string): string {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? '-' : format(parsed, 'dd MMM yyyy', { locale: indonesianLocale });
}

function DetailTable({ details }: { details: PartNumberDetail[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-gray-100 text-gray-600 uppercase">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Part Number</th>
            <th className="px-3 py-2 text-left font-semibold">Nama Produk</th>
            <th className="px-3 py-2 text-right font-semibold">Demand (pcs)</th>
            <th className="px-3 py-2 text-right font-semibold">Keb. Bersih (kg)</th>
            <th className="px-3 py-2 text-right font-semibold">Sheet Beli</th>
            <th className="px-3 py-2 text-right font-semibold">Pcs Beli</th>
            <th className="px-3 py-2 text-right font-semibold">Kg Beli</th>
            <th className="px-3 py-2 text-center font-semibold">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {details.map((d) => (
            <tr key={d.partNumber} className="hover:bg-gray-50">
              <td className="px-3 py-2 font-medium text-gray-900">
                <div className="flex items-center gap-1">
                  {d.noNpofData && (
                    <span title="Belum ada data NPOF — estimasi berdasarkan default">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    </span>
                  )}
                  {d.partNumber}
                </div>
              </td>
              <td className="px-3 py-2 text-gray-600">{d.productName}</td>
              <td className="px-3 py-2 text-right text-gray-700">{formatNum(d.demandPcs, 0)}</td>
              <td className="px-3 py-2 text-right text-gray-700">{formatNum(d.kgNet2)}</td>
              {d.isSufficient ? (
                <>
                  <td className="px-3 py-2 text-center text-gray-400">—</td>
                  <td className="px-3 py-2 text-center text-gray-400">—</td>
                  <td className="px-3 py-2 text-center text-gray-400">—</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      <CheckCircle className="w-3 h-3" />
                      Sisa {formatNum(d.surplusKg)} kg
                    </span>
                  </td>
                </>
              ) : (
                <>
                  <td className="px-3 py-2 text-right font-bold text-red-600">{formatNum(d.shortageSheet, 0)}</td>
                  <td className="px-3 py-2 text-right font-bold text-red-600">{formatNum(d.shortagePcs, 0)}</td>
                  <td className="px-3 py-2 text-right font-bold text-red-600">{formatNum(d.shortageKg)}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                      Kurang
                    </span>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatSnapshotValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'object') return Array.isArray(value) ? `${value.length} item` : 'Detail tersedia';
  return String(value);
}

function SnapshotTable({ data, sourceType }: { data: unknown; sourceType: string }) {
  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) return <p className="p-4 text-sm text-gray-400">Tidak ada data pada snapshot ini.</p>;

  const objectRows = rows.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
  const getValue = (row: Record<string, unknown>, key: string) => {
    if (key === 'partNumber') return row.partNumber || (row.item as Record<string, unknown> | undefined)?.partNumber || '-';
    if (key === 'itemName') return row.itemName || (row.item as Record<string, unknown> | undefined)?.itemName || '-';
    return row[key];
  };
  const sourceColumns: Record<string, string[]> = {
    HOTLIST: ['partNumber', 'date', 'biTotal', 'previousDate'],
    MRP: ['partNumber', 'itemName', 'year', 'weekNumber', 'weekStartDate', 'weekEndDate', 'quantity'],
    NPOF: ['partNumber', 'productName', 'material', 'gramatur', 'supplier', 'sheetedSize', 'formulaMaterial', 'ups'],
    OutstandingPO: ['planReceivedDate', 'supplierName', 'itemDesc', 'qtyOrder', 'qtyOrderUnit', 'qtyDelivered', 'qtyDeliveredUnit'],
    StockRawMaterial: ['itemDesc', 'supplier', 'date', 'qty', 'unit'],
    WIP: ['partNumber', 'itemName', 'location', 'quantity', 'progressPercent', 'date', 'shift', 'status', 'notes'],
  };
  const columns = sourceColumns[sourceType] || Object.keys(objectRows[0]).filter((key) => !['id', 'createdAt', 'updatedAt', 'item'].includes(key)).slice(0, 12);
  const labels: Record<string, string> = { partNumber: 'Part Number', itemName: 'Nama Produk', productName: 'Nama Produk', biTotal: 'BI Total', weekNumber: 'MRP Week', weekStartDate: 'Mulai', weekEndDate: 'Selesai', quantity: 'Qty Demand', planReceivedDate: 'Tanggal Rencana', supplierName: 'Supplier', itemDesc: 'Item Desc', qtyOrder: 'Qty Order', qtyOrderUnit: 'Unit Order', qtyDelivered: 'Qty Delivered', qtyDeliveredUnit: 'Unit Delivered', sheetedSize: 'Ukuran Material', formulaMaterial: 'Formula Material', progressPercent: 'Progress', location: 'Lokasi', notes: 'Catatan', date: 'Tanggal', previousDate: 'Tanggal Sebelumnya', gramatur: 'Gramatur', material: 'Material', supplier: 'Supplier', ups: 'UPS', qty: 'Qty', unit: 'Unit', year: 'Tahun', shift: 'Shift', status: 'Status' };

  return (
    <div className="overflow-x-auto max-h-72">
      <table className="w-full text-xs text-left">
        <thead className="sticky top-0 bg-gray-100 text-gray-600 uppercase">
          <tr>{columns.map((column) => <th key={column} className="px-3 py-2 whitespace-nowrap font-semibold">{labels[column] || column}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {objectRows.map((row, index) => (
            <tr key={index} className="hover:bg-gray-50">
              {columns.map((column) => <td key={column} className="px-3 py-2 whitespace-nowrap text-gray-700">{formatSnapshotValue(getValue(row, column))}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoryResultTable({ snapshot }: { snapshot: unknown }) {
  const result = snapshot as { groups?: MaterialGroup[] } | null;
  const groups = result?.groups || [];
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  if (groups.length === 0) return <p className="p-4 text-sm text-gray-400">Tidak ada hasil kalkulasi.</p>;

  const hasMatrix = groups.some((group) => group.weeklyMatrix);
  if (hasMatrix) {
    return (
      <div className="space-y-4">
        {groups.map((group, index) => (
          <div key={index} className="border rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="font-semibold text-gray-800">{group.ukuran}</span>
              <span className="text-xs text-gray-600">Gramatur: {group.gramatur || '—'}</span>
              <span className="text-xs text-gray-600">Supplier: {group.supplier}</span>
              <span className="text-xs text-gray-600">Lead Time: {group.leadTimeMonths} bln</span>
            </div>
            <WeeklyMatrixTable group={group} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
          <tr>
            <th className="px-3 py-2">Ukuran Material</th><th className="px-3 py-2">Gramatur</th><th className="px-3 py-2">Supplier</th>
            <th className="px-3 py-2 text-center">Lead Time</th><th className="px-3 py-2 text-right">Sheet Beli</th>
            <th className="px-3 py-2 text-right">Kg Beli</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-center">Detail</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {groups.map((group, index) => (
            <tr key={index} className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedGroups((current) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; })}>
              <td className="px-3 py-2 font-medium"><span className="inline-block w-5 text-gray-400">{expandedGroups.has(index) ? '⌄' : '›'}</span>{group.ukuran}</td><td className="px-3 py-2">{group.gramatur || '-'}</td><td className="px-3 py-2">{group.supplier}</td>
              <td className="px-3 py-2 text-center">{group.leadTimeMonths} bln</td>
              <td className="px-3 py-2 text-right font-semibold text-red-600">{formatNum(group.totalShortageSheet, 0)}</td>
              <td className="px-3 py-2 text-right font-semibold text-red-600">{formatNum(group.totalShortageKg)}</td>
              <td className="px-3 py-2">{group.isSufficient ? `Tercukupi, sisa ${formatNum(group.surplusKg)} kg` : `Kurang ${formatNum(group.totalShortageKg)} kg`}</td>
              <td className="px-3 py-2 text-center">{group.details?.length || 0} part</td>
            </tr>
          )).flatMap((row, index) => expandedGroups.has(index) ? [row, <tr key={`detail-${index}`}><td colSpan={8} className="bg-gray-50 p-3"><DetailTable details={groups[index].details || []} /></td></tr>] : [row])}
        </tbody>
      </table>
    </div>
  );
}

function formatWeekLabel(date: string): string {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? '-' : format(parsed, 'M/d');
}

function WeeklyMatrixTable({ group }: { group: MaterialGroup }) {
  const matrix = group.weeklyMatrix;
  if (!matrix || !matrix.columns.length) {
    return <p className="p-4 text-sm text-gray-400">Tidak ada data per minggu untuk hasil ini.</p>;
  }
  const { columns, rows, summary } = matrix;

  const poGroups: { label: string; start: number; span: number }[] = [];
  columns.forEach((col, i) => {
    const last = poGroups[poGroups.length - 1];
    if (last && last.label === col.poMonthLabel) {
      last.span += 1;
    } else {
      poGroups.push({ label: col.poMonthLabel, start: i, span: 1 });
    }
  });

  const cellClass = (v: number) => {
    if (v === 0) return 'text-gray-400';
    return v < 0 ? 'text-red-600 font-semibold' : 'text-green-700 font-semibold';
  };

  const summaryRow = (label: string, values: number[], extra?: string) => (
    <tr className="border-t border-gray-300 bg-gray-50/70">
      <td colSpan={7} className="px-3 py-2 font-semibold text-gray-700 whitespace-nowrap">
        {label}
        {extra ? <span className="text-gray-500 font-normal"> {extra}</span> : null}
      </td>
      {values.map((v, i) => (
        <td key={i} className={`px-3 py-2 text-right whitespace-nowrap ${cellClass(v)}`}>
          {formatNum(v)}
        </td>
      ))}
    </tr>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-gray-100 text-gray-600 uppercase">
            <th rowSpan={2} className="px-3 py-2 text-left font-semibold border border-gray-200">Part Number</th>
            <th rowSpan={2} className="px-3 py-2 text-left font-semibold border border-gray-200">Description</th>
            <th rowSpan={2} className="px-3 py-2 text-left font-semibold border border-gray-200">GSM</th>
            <th rowSpan={2} className="px-3 py-2 text-right font-semibold border border-gray-200">Width</th>
            <th rowSpan={2} className="px-3 py-2 text-right font-semibold border border-gray-200">Length</th>
            <th rowSpan={2} className="px-3 py-2 text-right font-semibold border border-gray-200">Up</th>
            <th rowSpan={2} className="px-3 py-2 text-right font-semibold border border-gray-200">Kg</th>
            {poGroups.map((po) => (
              <th key={`${po.label}-${po.start}`} colSpan={po.span} className="px-3 py-2 text-center font-semibold border border-gray-200 bg-indigo-50 text-indigo-700">
                {po.label}
              </th>
            ))}
          </tr>
          <tr className="bg-gray-100 text-gray-600">
            {columns.map((col) => (
              <th key={col.weekStartDate} className="px-2 py-1.5 text-center font-semibold border border-gray-200">
                {formatWeekLabel(col.weekStartDate)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => (
            <tr key={row.partNumber} className="hover:bg-gray-50">
              <td className="px-3 py-1.5 font-medium text-gray-900 whitespace-nowrap border border-gray-100">{row.partNumber}</td>
              <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap border border-gray-100">{row.productName}</td>
              <td className="px-3 py-1.5 text-gray-700 border border-gray-100">{row.gsm}</td>
              <td className="px-3 py-1.5 text-right text-gray-700 border border-gray-100">{row.width}</td>
              <td className="px-3 py-1.5 text-right text-gray-700 border border-gray-100">{row.length}</td>
              <td className="px-3 py-1.5 text-right text-gray-700 border border-gray-100">{row.up}</td>
              <td className="px-3 py-1.5 text-right text-gray-700 border border-gray-100">{formatNum(row.kgPerSheet, 4)}</td>
              {row.weeks.map((v, i) => (
                <td key={i} className={`px-3 py-1.5 text-right whitespace-nowrap border border-gray-100 ${cellClass(v)}`}>
                  {formatNum(v)}
                </td>
              ))}
            </tr>
          ))}

          {summaryRow('Total Req', summary.totalReq)}
          {summaryRow('Allowance', summary.allowance, '5%')}
          {summaryRow('Total + Allowance', summary.totalPlusAllowance)}
          <tr className="border-t border-gray-300 bg-gray-50/70">
            <td colSpan={7} className="px-3 py-2 font-semibold text-gray-700 whitespace-nowrap">Stock As Of</td>
            {columns.map((_, i) => (
              <td key={i} className={`px-3 py-2 text-right whitespace-nowrap ${i === 0 ? 'text-gray-700 font-semibold' : 'text-gray-400'}`}>
                {i === 0 ? formatNum(summary.stockAsOf) : '—'}
              </td>
            ))}
          </tr>
          {summaryRow('Outstanding PO', summary.outstandingPo)}
          {summaryRow('End Ind', summary.endInd)}
        </tbody>
      </table>
    </div>
  );
}

function GroupMatrixCard({ group }: { group: MaterialGroup }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 border-b border-gray-200 bg-gray-50/70 hover:bg-gray-100 transition-colors flex flex-wrap items-center gap-x-5 gap-y-1 text-left"
      >
        <ChevronRight
          className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${
            expanded ? 'rotate-90' : ''
          }`}
        />
        <span className="font-semibold text-gray-900">{group.ukuran}</span>
        <span className="text-sm text-gray-600">Gramatur: {group.gramatur || '—'}</span>
        <span className="text-sm text-gray-600">Supplier: {group.supplier}</span>
        <span className="text-sm text-gray-600">Lead Time: {group.leadTimeMonths} bln</span>
        <span className="text-sm text-gray-600">{group.details.length} part</span>
        {group.isSufficient ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
            <CheckCircle className="w-3.5 h-3.5" />
            Tercukupi, sisa {formatNum(group.surplusKg)} kg
          </span>
        ) : (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
            ⚠️ Kurang {formatNum(group.totalShortageKg)} kg
          </span>
        )}
        <span className="ml-auto text-xs text-indigo-600 font-medium">
          {expanded ? 'Sembunyikan detail' : 'Lihat detail'}
        </span>
      </button>
      {expanded && <WeeklyMatrixTable group={group} />}
    </div>
  );
}

export function MaterialCalc() {
  const { data: mrpWeeksData, isLoading: isLoadingWeeks } = useMRPWeeks();
  const { data: historyData } = useCalculationHistory();
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [selectedHistoryFolder, setSelectedHistoryFolder] = useState<string | null>(null);
  const { data: selectedHistoryData, isLoading: isLoadingHistoryDetail } = useCalculationHistoryDetail(selectedHistoryId);
  const saveCalculation = useSaveMaterialCalculation();
  const updateHistory = useUpdateCalculationHistory();
  const deleteHistory = useDeleteCalculationHistory();
  const mrpWeeks = mrpWeeksData?.data || [];
  const mrpMonths = useMemo(() => {
    const monthMap = new Map<string, { key: string; label: string; startDate: string; endDate: string; firstWeek: number; lastWeek: number }>();
    for (const week of mrpWeeks) {
      const monthKey = week.weekStartDate.slice(0, 7);
      const existing = monthMap.get(monthKey);
      if (!existing) {
        monthMap.set(monthKey, {
          key: monthKey,
          label: formatMonth(monthKey),
          startDate: week.weekStartDate.slice(0, 10),
          endDate: week.weekEndDate.slice(0, 10),
          firstWeek: week.weekNumber,
          lastWeek: week.weekNumber,
        });
      } else {
        existing.endDate = week.weekEndDate.slice(0, 10);
        existing.lastWeek = week.weekNumber;
      }
    }
    return [...monthMap.values()];
  }, [mrpWeeks]);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [triggerCalc, setTriggerCalc] = useState(false);
  const [hasCalculated, setHasCalculated] = useState(false);

  const activeMonth = mrpMonths.find((month) => month.key === selectedMonth) || mrpMonths[0];
  const selectedStartDate = activeMonth?.startDate || '';
  const selectedEndDate = activeMonth?.endDate || '';
  const { data, isLoading, isError, error } = useMaterialCalc(selectedStartDate, selectedEndDate, triggerCalc && Boolean(selectedStartDate && selectedEndDate));

  const handleCalculate = () => {
    setTriggerCalc(true);
    setHasCalculated(true);
  };

  const handleSave = async () => {
    if (!data) return;
    try {
      await saveCalculation.mutateAsync(data);
      alert('Hasil kalkulasi dan snapshot data berhasil disimpan ke history bulanan.');
    } catch (saveError) {
      alert(saveError instanceof Error ? saveError.message : 'Gagal menyimpan history kalkulasi');
    }
  };

  const handleEditHistory = async (history: { id: string; periodStartDate: string; periodEndDate: string }) => {
    const start = window.prompt('Tanggal mulai periode (YYYY-MM-DD):', history.periodStartDate.slice(0, 10));
    if (!start) return;
    const end = window.prompt('Tanggal akhir periode (YYYY-MM-DD):', history.periodEndDate.slice(0, 10));
    if (!end) return;
    try {
      await updateHistory.mutateAsync({ id: history.id, periodStartDate: start, periodEndDate: end });
    } catch (editError) {
      alert(editError instanceof Error ? editError.message : 'Gagal mengubah history');
    }
  };

  const handleDeleteHistory = async (id: string) => {
    if (!window.confirm('Hapus folder history ini beserta seluruh snapshot datanya?')) return;
    try {
      if (selectedHistoryId === id) setSelectedHistoryId(null);
      await deleteHistory.mutateAsync(id);
    } catch (deleteError) {
      alert(deleteError instanceof Error ? deleteError.message : 'Gagal menghapus history');
    }
  };

  const totalShortageGroups = data?.groups.filter((g) => !g.isSufficient).length || 0;
  const totalSufficientGroups = data?.groups.filter((g) => g.isSufficient).length || 0;

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Calculator className="w-7 h-7 text-indigo-600" />
            Material Calculation
          </h1>
          <p className="text-gray-500 mt-1">
            Hitung kebutuhan raw material untuk produksi berdasarkan MRP 26-Week Demand
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <Info className="w-4 h-4 text-amber-500 flex-shrink-0" />
          Perhitungan dijalankan 1x per bulan, di akhir bulan
        </div>
      </div>

      {/* Controls */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
          <div className="w-full sm:w-auto">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Periode Demand (Bulan MRP)
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={activeMonth?.key || ''}
                disabled={isLoadingWeeks || mrpWeeks.length === 0}
                onChange={(e) => { setSelectedMonth(e.target.value); setTriggerCalc(false); }}
                className="input min-w-80"
              >
                {mrpMonths.map((month) => (
                  <option key={month.key} value={month.key}>
                    {month.label} (MRP W{month.firstWeek}-W{month.lastWeek})
                  </option>
                ))}
              </select>
              {activeMonth && (
                <span className="text-sm text-gray-500">
                  {formatWeekDate(activeMonth.startDate)} - {formatWeekDate(activeMonth.endDate)}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={handleCalculate}
            disabled={isLoading || isLoadingWeeks || !selectedStartDate || !selectedEndDate}
            className="btn btn-primary"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Calculator className="w-4 h-4 mr-2" />
            )}
            {isLoading ? 'Menghitung...' : 'Hitung Sekarang'}
          </button>
        </div>
      </div>

      {/* Result */}
      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          <strong>Gagal menghitung:</strong> {(error as Error)?.message}
        </div>
      )}

      {hasCalculated && data && !isLoading && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card p-4">
              <div className="text-sm text-gray-500">Total Grup Material</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">{data.groups.length}</div>
            </div>
            <div className="card p-4 border-red-200">
              <div className="text-sm text-gray-500">Perlu Dibeli</div>
              <div className="text-2xl font-bold text-red-600 mt-1">{totalShortageGroups} grup</div>
            </div>
            <div className="card p-4 border-green-200">
              <div className="text-sm text-gray-500">Stok Tercukupi</div>
              <div className="text-2xl font-bold text-green-600 mt-1">{totalSufficientGroups} grup</div>
            </div>
          </div>

          {/* Info bar */}
          <div className="text-xs text-gray-400">
            Dihitung pada: {format(new Date(data.calculatedAt), 'dd MMM yyyy, HH:mm')}
            &nbsp;&middot;&nbsp;Periode MRP: {formatWeekDate(data.periodStartDate)} - {formatWeekDate(data.periodEndDate)} ({data.periodWeeks} minggu)
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => printMaterialCalculation(data)}
              className="btn btn-secondary"
            >
              <Download className="w-4 h-4 mr-2" />
              Export PDF
            </button>
            <button
              onClick={handleSave}
              disabled={saveCalculation.isPending}
              className="btn btn-primary"
            >
              <Save className="w-4 h-4 mr-2" />
              {saveCalculation.isPending ? 'Menyimpan...' : 'Simpan History'}
            </button>
          </div>

          {/* Main table: per-material weekly matrix (Excel style) */}
          {data.groups.length === 0 ? (
            <div className="card p-12 text-center text-gray-500">
              <Calculator className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium text-gray-700">Tidak ada data demand</p>
              <p className="text-sm mt-1">Pastikan data MRP (26-Week Demand) sudah diinput</p>
            </div>
          ) : (
            <div className="space-y-4">
              {data.groups.map((group, idx) => (
                <GroupMatrixCard key={idx} group={group} />
              ))}
            </div>
          )}

        </>
      )}

      {!hasCalculated && !isLoading && (
        <div className="card p-12 text-center text-gray-400">
          <Calculator className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">Klik "Hitung Sekarang" untuk menjalankan kalkulasi</p>
          <p className="text-sm mt-1">Kalkulasi akan mengambil data dari MRP, Hotlist, WIP, Stock, dan Outstanding PO</p>
        </div>
      )}

      {!hasCalculated && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold flex items-center gap-2 text-gray-700">
            <Folder className="w-4 h-4 text-indigo-600" /> History Kalkulasi Bulanan
          </h2>
          {historyData?.data.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {historyData.data.map((history) => (
                <button key={history.id} type="button" onClick={() => { setSelectedHistoryId(history.id); setSelectedHistoryFolder(null); }} className="border rounded-lg p-4 bg-white text-left hover:border-indigo-400 hover:shadow-sm transition-all">
                  <div className="font-semibold text-gray-800">{formatMonth(history.monthKey)}</div>
                  <div className="text-xs text-gray-500 mt-1">Periode {formatWeekDate(history.periodStartDate)} - {formatWeekDate(history.periodEndDate)}</div>
                  <div className="text-xs text-gray-500 mt-2">{history.sources.length + 1} folder tersedia</div>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-indigo-600 font-medium">Buka detail history</span>
                    <span className="flex items-center gap-1">
                      <span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); void handleEditHistory(history); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.stopPropagation(); void handleEditHistory(history); } }} className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded" title="Edit periode"><Pencil className="w-4 h-4" /></span>
                      <span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); void handleDeleteHistory(history.id); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.stopPropagation(); void handleDeleteHistory(history.id); } }} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded" title="Hapus folder history"><Trash2 className="w-4 h-4" /></span>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-400">Belum ada history tersimpan.</div>
          )}
        </div>
      )}

      {!hasCalculated && selectedHistoryId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelectedHistoryId(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Folder History Kalkulasi</h2>
                {selectedHistoryData?.data && <p className="text-sm text-gray-500">{formatMonth(selectedHistoryData.data.monthKey)} · {formatWeekDate(selectedHistoryData.data.periodStartDate)} - {formatWeekDate(selectedHistoryData.data.periodEndDate)}</p>}
              </div>
              <button type="button" onClick={() => setSelectedHistoryId(null)} className="p-2 text-gray-500 hover:bg-gray-100 rounded" title="Tutup"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
              {isLoadingHistoryDetail ? <div className="py-12 text-center text-gray-500">Memuat folder history...</div> : selectedHistoryData?.data ? (
                selectedHistoryFolder ? (
                  <div>
                    <button type="button" onClick={() => setSelectedHistoryFolder(null)} className="mb-4 inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800">← Kembali ke folder</button>
                    {selectedHistoryFolder === 'CALCULATION' ? <div className="border rounded-lg overflow-hidden"><div className="bg-gray-50 border-b px-4 py-3 font-semibold">Hasil Material Calculation</div><HistoryResultTable snapshot={selectedHistoryData.data.resultSnapshot} /></div> : (() => { const source = selectedHistoryData.data.sources.find((item) => item.sourceType === selectedHistoryFolder); return source ? <div className="border rounded-lg overflow-hidden"><div className="bg-gray-50 border-b px-4 py-3 font-semibold">{source.sourceType}</div><SnapshotTable data={source.dataSnapshot} sourceType={source.sourceType} /></div> : <div className="text-gray-500">Folder tidak ditemukan.</div>; })()}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <button type="button" onClick={() => setSelectedHistoryFolder('CALCULATION')} className="border rounded-lg p-5 text-left hover:border-indigo-400 hover:shadow-sm"><Folder className="w-9 h-9 text-indigo-600 mb-3" /><div className="font-semibold">Calculation</div><div className="text-xs text-gray-500 mt-1">Hasil perhitungan material</div></button>
                    {selectedHistoryData.data.sources.map((source) => <button key={source.sourceType} type="button" onClick={() => setSelectedHistoryFolder(source.sourceType)} className="border rounded-lg p-5 text-left hover:border-indigo-400 hover:shadow-sm"><Folder className="w-9 h-9 text-blue-500 mb-3" /><div className="font-semibold">{source.sourceType}</div><div className="text-xs text-gray-500 mt-1">Snapshot data yang digunakan</div></button>)}
                  </div>
                )
              ) : <div className="py-12 text-center text-gray-500">Detail history tidak ditemukan.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
