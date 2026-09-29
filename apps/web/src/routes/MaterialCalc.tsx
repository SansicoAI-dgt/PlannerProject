import { useMemo, useState } from 'react';
import {
  useCalculateCycle,
  useCreateCycle,
  useCycleAudit,
  useCycleDataStatus,
  useCycleResultDetail,
  useCycles,
  useCycleRetentionAction,
  useExpiredCycles,
  useNpofCheck,
  usePeriodSourceRows,
  type CycleAuditEntry,
  type CycleCalculationResult,
  type CycleSourceRow,
  type CycleSummary,
  type ExpiredCycle,
  type MaterialGroup,
  type MaterialCalcResponse,
  type PartNumberDetail,
  type WeeklyMatrix,
} from '../hooks/useMaterialCalc';
import {
  AlertTriangle,
  ArrowLeft,
  Calculator,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  History,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Unlock,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { id as indonesianLocale } from 'date-fns/locale';
import { usePeriods } from '../hooks/usePeriods';

// ── Format angka & tanggal ────────────────────────────────────────────────

function formatNum(n: number | null | undefined, decimals = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

function formatMonth(month: string): string {
  const date = new Date(`${month}-01T00:00:00`);
  return Number.isNaN(date.getTime())
    ? 'Bulan tidak tersedia'
    : format(date, 'MMMM yyyy', { locale: indonesianLocale });
}

function formatWeekDate(date: string): string {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? '-' : format(parsed, 'dd MMM yyyy', { locale: indonesianLocale });
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : format(parsed, 'dd MMM yyyy HH:mm', { locale: indonesianLocale });
}

/** Label pendek untuk kepala kolom minggu, mis. "19 Sep". */
function formatDayMonth(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '-' : format(parsed, 'dd MMM', { locale: indonesianLocale });
}

function getFallbackTimeline(leadTimeMonths: number) {
  const purchaseDate = new Date();
  const arrivalDate = new Date(purchaseDate);
  arrivalDate.setMonth(arrivalDate.getMonth() + Math.max(0, leadTimeMonths - 1));
  const usageDate = new Date(purchaseDate);
  usageDate.setMonth(usageDate.getMonth() + leadTimeMonths);
  const toMonth = (date: Date) => date.toISOString().slice(0, 7);
  return {
    purchaseMonth: toMonth(purchaseDate),
    arrivalMonth: toMonth(arrivalDate),
    usageMonth: toMonth(usageDate),
  };
}

// ── Sel tabel mingguan: baris atas lembar, baris bawah kg ─────────────────

function UnitCell({ sheet, kg, hasKg, poNumbers }: { sheet: number | undefined; kg: number | undefined; hasKg: boolean; poNumbers?: string[] }) {
  const sheets = sheet ?? 0;
  const kilos = kg ?? 0;
  const negative = sheets < 0 || kilos < 0;
  return (
    <td className={`px-2 py-1.5 text-right align-top tabular-nums ${negative ? 'text-red-600' : 'text-gray-700'}`}>
      <div className="text-[11px] font-medium">{formatNum(sheets, 0)} lbr</div>
      <div className="text-[10px] text-gray-400">{hasKg ? `${formatNum(kilos)} kg` : '—'}</div>
      {poNumbers && poNumbers.length > 0 && (
        <div
          className="mt-0.5 flex flex-wrap justify-end gap-x-1 text-[9px] leading-tight text-indigo-400"
          title={`PO: ${poNumbers.join(', ')}`}
        >
          {poNumbers.map((no, idx) => (
            <span key={no} className="font-mono">
              {no}{idx < poNumbers.length - 1 ? ',' : ''}
            </span>
          ))}
        </div>
      )}
    </td>
  );
}

// ── Tabel mingguan 26 kolom (sesuai Gambar 3) ─────────────────────────────

function WeeklyMatrixTable({ matrix }: { matrix: WeeklyMatrix }) {
  const width = matrix.columns.length;
  const { summary } = matrix;

  /** Baris ringkasan yang mengikuti pola yang sama untuk semua bagian. */
  const summaryRows: { label: string; sheet: number[]; kg: number[]; strong?: boolean }[] = [
    { label: 'Total Req', sheet: summary.totalReqSheet, kg: summary.totalReq, strong: true },
    { label: 'Allowance (5%)', sheet: summary.allowanceSheet, kg: summary.allowance },
    { label: 'Total + Allowance', sheet: summary.totalPlusAllowanceSheet, kg: summary.totalPlusAllowance, strong: true },
  ];

  return (
    <div className="overflow-x-auto border-t border-gray-200">
      <table className="text-xs border-collapse">
        <thead className="bg-gray-100 text-gray-600">
          <tr>
            <th className="px-3 py-2 text-left font-semibold sticky left-0 bg-gray-100 z-10 min-w-[150px]">
              Part Number
            </th>
            <th className="px-3 py-2 text-left font-semibold min-w-[160px]">Deskripsi</th>
            <th className="px-2 py-2 text-left font-semibold">GSM</th>
            <th className="px-2 py-2 text-right font-semibold">Width</th>
            <th className="px-2 py-2 text-right font-semibold">Length</th>
            <th className="px-2 py-2 text-right font-semibold">Up</th>
            <th className="px-2 py-2 text-right font-semibold">Kg/Lbr</th>
            {matrix.columns.map((col) => (
              <th key={col.weekNumber} className="px-2 py-2 text-right font-semibold min-w-[74px]">
                <div className="text-[11px] text-indigo-600">{col.poMonthLabel}</div>
                <div className="text-[10px] text-gray-400">{formatDayMonth(col.weekStartDate)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {matrix.rows.map((row) => (
            <tr key={row.partNumber} className="hover:bg-gray-50">
              <td className="px-3 py-1.5 font-medium text-gray-900 sticky left-0 bg-white z-10">{row.partNumber}</td>
              <td className="px-3 py-1.5 text-gray-600">{row.productName}</td>
              <td className="px-2 py-1.5 text-gray-700">{row.gsm}</td>
              <td className="px-2 py-1.5 text-right text-gray-700">{row.width ?? '—'}</td>
              <td className="px-2 py-1.5 text-right text-gray-700">{row.length ?? '—'}</td>
              <td className="px-2 py-1.5 text-right text-gray-700">{formatNum(row.up, 0)}</td>
              <td className="px-2 py-1.5 text-right text-gray-700">{row.hasKg ? formatNum(row.kgPerSheet, 4) : '—'}</td>
              {Array.from({ length: width }).map((_, i) => (
                <UnitCell key={i} sheet={row.weeksSheet[i]} kg={row.weeks[i]} hasKg={row.hasKg} />
              ))}
            </tr>
          ))}

          {summaryRows.map((r) => (
            <tr key={r.label} className={r.strong ? 'bg-indigo-50/40 font-semibold' : 'bg-gray-50/60'}>
              <td className="px-3 py-1.5 text-gray-700 sticky left-0 bg-inherit z-10" colSpan={7}>
                {r.label}
                {r.label === 'Total Req' && <span className="ml-2 text-[10px] font-normal text-amber-600">sebagian estimasi</span>}
              </td>
              {Array.from({ length: width }).map((_, i) => (
                <UnitCell key={i} sheet={r.sheet[i]} kg={r.kg[i]} hasKg />
              ))}
            </tr>
          ))}

          <tr className="bg-gray-50/60">
            <td className="px-3 py-1.5 text-gray-700 sticky left-0 bg-inherit z-10" colSpan={7}>
              Stock As Of
            </td>
            <UnitCell sheet={summary.stockAsOfSheet} kg={summary.stockAsOf} hasKg />
            {Array.from({ length: Math.max(0, width - 1) }).map((_, i) => (
              <td key={i} className="px-2 py-1.5 text-right text-gray-300">
                —
              </td>
            ))}
          </tr>

          <tr className="bg-gray-50/60">
            <td className="px-3 py-1.5 text-gray-700 sticky left-0 bg-inherit z-10" colSpan={7}>
              Outstanding PO
            </td>
            {Array.from({ length: width }).map((_, i) => (
              <UnitCell
                key={i}
                sheet={summary.outstandingPoSheet[i]}
                kg={summary.outstandingPo[i]}
                hasKg
                poNumbers={summary.outstandingPoNumbers?.[i]}
              />
            ))}
          </tr>

          <tr className="bg-gray-100/70 font-semibold">
            <td className="px-3 py-1.5 text-gray-800 sticky left-0 bg-inherit z-10" colSpan={7}>
              End Ind
            </td>
            {Array.from({ length: width }).map((_, i) => (
              <UnitCell key={i} sheet={summary.endIndSheet[i]} kg={summary.endInd[i]} hasKg />
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── Tabel rincian angka per part ──────────────────────────────────────────

function DetailTable({ details }: { details: PartNumberDetail[] }) {
  return (
    <div className="overflow-x-auto border-t border-gray-200">
      <table className="w-full text-xs">
        <thead className="bg-gray-100 text-gray-600 uppercase">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Part Number</th>
            <th className="px-3 py-2 text-right font-semibold">Demand (pcs)</th>
            <th className="px-3 py-2 text-right font-semibold">Keb. Bersih (kg)</th>
            <th className="px-3 py-2 text-right font-semibold">Stok Teralokasi (kg)</th>
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
                    <span title="Belum ada data NPOF — dihitung dengan estimasi jumbo roll 180 cm">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    </span>
                  )}
                  {d.partNumber}
                </div>
              </td>
              <td className="px-3 py-2 text-right text-gray-700">{formatNum(d.demandPcs, 0)}</td>
              <td className="px-3 py-2 text-right text-gray-700">{formatNum(d.kgNet2)}</td>
              <td className="px-3 py-2 text-right text-gray-700">{formatNum(d.allocatedKg)}</td>
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

// ── Baris grup: klik untuk membuka tabel mingguan ─────────────────────────

function GroupRow({ group }: { group: MaterialGroup }) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<'matrix' | 'detail'>('matrix');
  const planningTimeline = group.planningTimeline || getFallbackTimeline(group.leadTimeMonths);
  const estimatedInGroup = group.details.filter((d) => d.noNpofData).length;

  return (
    <>
      <tr
        className={`cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-200 ${
          expanded ? 'bg-indigo-50/30' : ''
        }`}
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-4 py-3 text-gray-400">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </td>
        <td className="px-4 py-3 font-medium text-gray-900">
          <div>{group.ukuran}</div>
          {estimatedInGroup > 0 && (
            <div className="text-[11px] font-normal text-amber-600">
              ⚠️ {formatNum(estimatedInGroup, 0)} dari {formatNum(group.details.length, 0)} part datanya belum lengkap (estimasi)
            </div>
          )}
        </td>
        <td className="px-4 py-3 text-gray-700">{group.gramatur || '—'}</td>
        <td className="px-4 py-3 text-gray-700">{group.supplier}</td>
        <td className="px-4 py-3 text-center">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
            {group.leadTimeMonths} bln
          </span>
        </td>
        <td className="px-4 py-3 text-xs text-gray-600">
          <div>
            Beli: <span className="font-medium text-gray-800">{formatMonth(planningTimeline.purchaseMonth)}</span>
          </div>
          <div>
            Tiba: <span className="font-medium text-gray-800">{formatMonth(planningTimeline.arrivalMonth)}</span>
          </div>
          <div>
            Pakai: <span className="font-medium text-gray-800">{formatMonth(planningTimeline.usageMonth)}</span>
          </div>
        </td>
        {group.isSufficient ? (
          <>
            <td className="px-4 py-3 text-center text-gray-400">—</td>
            <td className="px-4 py-3 text-center text-gray-400">—</td>
            <td className="px-4 py-3">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                <CheckCircle className="w-3.5 h-3.5" />
                Tercukupi, sisa {formatNum(group.surplusKg)} kg
              </span>
            </td>
          </>
        ) : (
          <>
            <td className="px-4 py-3 text-right font-bold text-red-600">
              {formatNum(group.totalShortageSheet, 0)} lbr
            </td>
            <td className="px-4 py-3 text-right font-bold text-red-600">{formatNum(group.totalShortageKg)} kg</td>
            <td className="px-4 py-3">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                ⚠️ Kurang {formatNum(group.totalShortageKg)} kg
              </span>
            </td>
          </>
        )}
        <td className="px-4 py-3 text-center text-gray-500 text-sm">{group.details.length} part</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={10} className="p-0 bg-gray-50/80">
            <div className="px-4 pt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTab('matrix')}
                className={`px-3 py-1.5 text-xs rounded-md ${
                  tab === 'matrix' ? 'bg-indigo-600 text-white' : 'bg-white border text-gray-700'
                }`}
              >
                Tabel 26 Minggu
              </button>
              <button
                type="button"
                onClick={() => setTab('detail')}
                className={`px-3 py-1.5 text-xs rounded-md ${
                  tab === 'detail' ? 'bg-indigo-600 text-white' : 'bg-white border text-gray-700'
                }`}
              >
                Rincian per Part
              </button>
              <span className="text-[11px] text-gray-500">
                Setiap kolom: baris atas = lembar, baris bawah = kg
              </span>
            </div>
            {tab === 'matrix' ? <WeeklyMatrixTable matrix={group.weeklyMatrix} /> : <DetailTable details={group.details} />}
          </td>
        </tr>
      )}
    </>
  );
}

// ── Folder card per jenis material ───────────────────────────────────────

/** Warna & emoji per jenis material. */
const MATERIAL_TYPE_META: Record<string, { emoji: string; color: string; iconColor: string; bg: string; selectedBg: string; border: string; selectedBorder: string }> = {
  Paper:   { emoji: '📄', color: 'text-blue-800',  iconColor: 'text-blue-500',  bg: 'bg-white',      selectedBg: 'bg-blue-50',   border: 'border-gray-200', selectedBorder: 'border-blue-400' },
  PET:     { emoji: '🧴', color: 'text-teal-800',  iconColor: 'text-teal-500',  bg: 'bg-white',      selectedBg: 'bg-teal-50',   border: 'border-gray-200', selectedBorder: 'border-teal-400' },
  Flute:   { emoji: '📦', color: 'text-amber-800', iconColor: 'text-amber-500', bg: 'bg-white',      selectedBg: 'bg-amber-50',  border: 'border-gray-200', selectedBorder: 'border-amber-400' },
  Lainnya: { emoji: '🗂️', color: 'text-gray-700',  iconColor: 'text-gray-400',  bg: 'bg-white',      selectedBg: 'bg-gray-100',  border: 'border-gray-200', selectedBorder: 'border-gray-400' },
};

function getMeta(materialType: string) {
  return MATERIAL_TYPE_META[materialType] ?? MATERIAL_TYPE_META['Lainnya'];
}

/** Satu kartu folder material — klik untuk memilih / deselect. */
function MaterialFolderCard({
  materialType,
  groups,
  isSelected,
  onClick,
}: {
  materialType: string;
  groups: MaterialGroup[];
  isSelected: boolean;
  onClick: () => void;
}) {
  const meta = getMeta(materialType);
  const shortageCount   = groups.filter((g) => !g.isSufficient).length;
  const sufficientCount = groups.filter((g) =>  g.isSufficient).length;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        w-full text-left rounded-xl border-2 p-4 transition-all duration-150
        hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-300
        ${isSelected
          ? `${meta.selectedBg} ${meta.selectedBorder} shadow-sm`
          : `${meta.bg} ${meta.border} hover:border-gray-300`}
      `}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${meta.iconColor}`}>
          {isSelected
            ? <FolderOpen className="w-7 h-7" />
            : <Folder     className="w-7 h-7" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className={`font-semibold text-sm ${meta.color}`}>
            {materialType}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {groups.length} ukuran
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {shortageCount > 0 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-red-100 text-red-700">
                ⚠️ {shortageCount} kurang
              </span>
            )}
            {sufficientCount > 0 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-green-100 text-green-700">
                ✅ {sufficientCount} cukup
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ── Dialog konfirmasi sederhana ───────────────────────────────────────────

function ConfirmDialog({
  title,
  lines,
  confirmLabel,
  onConfirm,
  onCancel,
  busy,
}: {
  title: string;
  lines: string[];
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="border-b px-6 py-4 font-semibold text-gray-900">{title}</div>
        <div className="px-6 py-4 space-y-2 text-sm text-gray-700">
          {lines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
        <div className="border-t px-6 py-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm rounded-md border text-gray-700">
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="px-4 py-2 text-sm rounded-md bg-indigo-600 text-white disabled:opacity-50"
          >
            {busy ? 'Memproses...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Halaman utama ─────────────────────────────────────────────────────────

/**
 * Kolom tabel untuk isi folder data master periode. Dipakai agar isi tiap folder
 * (MRP / WIP / HOT LIST / STOCK RM / OS PO) bisa dibuka dari halaman ini tanpa
 * menduplikasi data — sumbernya tetap endpoint Master Data dengan ?periodId=.
 */
const SOURCE_COLUMNS: Record<string, { key: string; label: string; numeric?: boolean }[]> = {
  MRP: [
    { key: 'item.partNumber', label: 'Part Number' },
    { key: 'item.itemName', label: 'Description' },
    { key: 'year', label: 'Tahun', numeric: true },
    { key: 'weekNumber', label: 'Minggu', numeric: true },
    { key: 'quantity', label: 'Qty', numeric: true },
    { key: 'weekStartDate', label: 'Mulai Minggu' },
  ],
  WIP: [
    { key: 'item.partNumber', label: 'Part Number' },
    { key: 'item.itemName', label: 'Description' },
    { key: 'location', label: 'Lokasi' },
    { key: 'quantity', label: 'Qty', numeric: true },
    { key: 'status', label: 'Status' },
    { key: 'date', label: 'Tanggal' },
  ],
  HOTLIST: [
    { key: 'partNumber', label: 'Part Number' },
    { key: 'biTotal', label: 'BI Total', numeric: true },
    { key: 'date', label: 'Tanggal' },
    { key: 'previousDate', label: 'Tanggal Sebelumnya' },
  ],
  STOCK_RM: [
    { key: 'itemDesc', label: 'Item' },
    { key: 'supplier', label: 'Supplier' },
    { key: 'qty', label: 'Qty', numeric: true },
    { key: 'unit', label: 'Satuan' },
    { key: 'date', label: 'Tanggal' },
  ],
  OUTSTANDING_PO: [
    { key: 'poNumber', label: 'PO Number' },
    { key: 'planReceivedDate', label: 'Tgl Rencana' },
    { key: 'supplierName', label: 'Supplier' },
    { key: 'itemDesc', label: 'Item' },
    { key: 'qtyOrder', label: 'Qty Order', numeric: true },
    { key: 'qtyOrderUnit', label: 'Satuan' },
    { key: 'qtyDelivered', label: 'Terkirim', numeric: true },
  ],
};

function getPath(row: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, k) => {
    if (acc === null || acc === undefined) return undefined;
    return (acc as Record<string, unknown>)[k];
  }, row);
}

/** Tabel isi folder data master. Dibatasi 300 baris agar MRP 16.000 baris tetap ringan. */
function SourceRowsTable({ sourceType, rows }: { sourceType: string; rows: Record<string, unknown>[] }) {
  const cols = SOURCE_COLUMNS[sourceType] ?? [];
  const LIMIT = 300;
  const shown = rows.slice(0, LIMIT);

  return (
    <div>
      <div className="px-4 py-3 border-b bg-gray-50 text-xs text-gray-500">
        {formatNum(rows.length, 0)} baris
        {rows.length > LIMIT ? ` · menampilkan ${LIMIT} baris pertama` : ''}
      </div>
      <div className="overflow-x-auto max-h-[65vh]">
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500 uppercase bg-gray-50/70 sticky top-0">
            <tr>
              {cols.map((c) => (
                <th
                  key={c.key}
                  className={`px-4 py-2 font-semibold whitespace-nowrap ${c.numeric ? 'text-right' : 'text-left'}`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {shown.map((r, i) => (
              <tr key={i} className="hover:bg-gray-50/60">
                {cols.map((c) => {
                  const v = getPath(r, c.key);
                  const text = v === null || v === undefined || v === '' ? '—' : String(v);
                  return (
                    <td
                      key={c.key}
                      className={`px-4 py-2 text-gray-700 whitespace-nowrap ${c.numeric ? 'text-right tabular-nums' : ''}`}
                    >
                      {text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const SOURCE_LABELS: Record<string, string> = {
  MRP: 'MRP 26 weeks',
  HOTLIST: 'Hot List',
  STOCK_RM: 'Stock Raw Material',
  OUTSTANDING_PO: 'Outstanding PO',
  WIP: 'WIP',
};

export function MaterialCalc() {
  const { data: cyclesData, isLoading: isLoadingCycles } = useCycles();
  const cycles = cyclesData?.data ?? [];

  const [selectedCycleId, setSelectedCycleId] = useState('');
  const activeCycle: CycleSummary | undefined = useMemo(
    () => cycles.find((c) => c.id === selectedCycleId),
    [cycles, selectedCycleId],
  );
  const cycleId = activeCycle?.id ?? null;

  /**
   * Jumlah baris NYATA tiap sumber di periode ini (endpoint /material-planning/periods),
   * bukan riwayat upload — data bisa berkurang setelah upload (edit/hapus manual),
   * sehingga angka riwayat upload akan menyesatkan.
   */
  const { data: periodsData } = usePeriods();
  const liveCounts = useMemo(
    () => periodsData?.data.find((p) => p.id === cycleId)?.counts ?? null,
    [periodsData, cycleId],
  );

  const { data: npofCheck } = useNpofCheck(cycleId, Boolean(activeCycle?.currentResult));
  const { data: expiredData } = useExpiredCycles();

  const createCycle = useCreateCycle();
  const calculate = useCalculateCycle();
  const retention = useCycleRetentionAction();

  const [calcResult, setCalcResult] = useState<CycleCalculationResult | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  // Kalau user belum memilih run tertentu, tampilkan run yang sedang aktif
  // supaya hasil terakhir langsung terlihat begitu halaman dibuka.
  const { data: runDetail } = useCycleResultDetail(
    cycleId,
    selectedRunId ?? activeCycle?.currentResult?.id ?? null,
  );

  const [showAudit, setShowAudit] = useState(false);
  const [showNewPeriod, setShowNewPeriod] = useState(false);
  const [newMonth, setNewMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [newLabel, setNewLabel] = useState('');
  const [confirmNpof, setConfirmNpof] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [retentionTarget, setRetentionTarget] = useState<ExpiredCycle | null>(null);
  const [retentionMonths, setRetentionMonths] = useState(6);
  /** null = tampilkan semua tipe, string = filter ke tipe tertentu */
  const [selectedMaterialType, setSelectedMaterialType] = useState<string | null>(null);
  /**
   * Folder yang sedang dibuka di dalam periode terpilih:
   *  null    -> daftar sub-folder periode (Calculation / MRP / WIP / HOT LIST / STOCK RM / OS PO)
   *  'CALC'  -> isi folder Calculation (folder per material)
   *  lainnya -> tabel data master periode (MRP/WIP/HOTLIST/STOCK_RM/OUTSTANDING_PO)
   */
  const [openFolder, setOpenFolder] = useState<string | null>(null);

  // Validitas hasil perhitungan periode ini terhadap data master SEKARANG.
  const { data: dataStatusData } = useCycleDataStatus(cycleId);
  const dataStatus = dataStatusData?.data ?? null;
  const { data: sourceRowsData, isLoading: sourceRowsLoading } = usePeriodSourceRows(
    cycleId,
    openFolder && openFolder !== 'CALC' ? openFolder : null,
  );


  const { data: auditData } = useCycleAudit(cycleId, showAudit);

  const shown: CycleCalculationResult | MaterialCalcResponse | null =
    runDetail?.data.resultSnapshot ?? calcResult;

  const groups = shown?.groups ?? [];
  const shortageGroups = groups.filter((g) => !g.isSufficient).length;
  const sufficientGroups = groups.filter((g) => g.isSufficient).length;

  /** Kelompokkan groups per materialType, dengan urutan tampilan yang konsisten. */
  const MATERIAL_ORDER = ['Paper', 'PET', 'Flute', 'Lainnya'];
  const groupedByType = useMemo(() => {
    const map = new Map<string, MaterialGroup[]>();
    for (const g of groups) {
      const type = g.materialType || 'Lainnya';
      if (!map.has(type)) map.set(type, []);
      map.get(type)!.push(g);
    }
    // Urutkan: tipe yang ada di MATERIAL_ORDER dulu, sisanya diurutkan alfabet
    const knownOrder = MATERIAL_ORDER.filter((t) => map.has(t));
    const unknown    = [...map.keys()].filter((t) => !MATERIAL_ORDER.includes(t)).sort();
    return [...knownOrder, ...unknown].map((type) => ({ type, groups: map.get(type)! }));
  }, [groups]);

  /** Groups yang ditampilkan di tabel — difilter sesuai kartu yang dipilih */
  const displayedGroups = useMemo(
    () => selectedMaterialType ? groups.filter((g) => (g.materialType || 'Lainnya') === selectedMaterialType) : groups,
    [groups, selectedMaterialType],
  );

  const statusBadge = (() => {
    if (!activeCycle) return null;
    if (activeCycle.isLocked) {
      return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-700">🔒 Terkunci</span>;
    }
    if (activeCycle.derivedStatus === 'NOT_CALCULATED') {
      return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">🔵 Belum dihitung</span>;
    }
    if (activeCycle.derivedStatus === 'STALE') {
      return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">🟠 Perlu dihitung ulang</span>;
    }
    return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">🟢 Sudah dihitung</span>;
  })();

  const doCalculate = async () => {
    if (!cycleId) return;
    try {
      const res = await calculate.mutateAsync({ cycleId });
      setCalcResult(res.data);
      setSelectedRunId(res.data.id);
      setConfirmNpof(false);
      setToast({ kind: 'ok', text: `Perhitungan run #${res.data.runNumber} selesai.` });
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof Error ? e.message : 'Gagal menghitung' });
    }
  };

  const handleCalculate = () => {
    if (npofCheck?.data.changedSinceCalculation) {
      setConfirmNpof(true);
      return;
    }
    void doCalculate();
  };

  const handleCreatePeriod = async () => {
    try {
      const res = (await createCycle.mutateAsync({ uploadMonth: newMonth, label: newLabel || undefined })) as {
        data: CycleSummary;
      };
      setShowNewPeriod(false);
      setNewLabel('');
      setSelectedCycleId(res.data.id);
      setCalcResult(null);
      setSelectedRunId(null);
      setToast({ kind: 'ok', text: `Periode "${res.data.label}" dibuat. Sekarang isi datanya.` });
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof Error ? e.message : 'Gagal membuat periode' });
    }
  };

  const expired = expiredData?.data ?? [];

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
            Perhitungan per periode, mencakup MRP penuh. Setiap periode terisolasi dari periode lain.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {statusBadge}
          <button
            type="button"
            onClick={() => setShowAudit(true)}
            disabled={!cycleId}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs rounded-md border text-gray-700 disabled:opacity-40"
          >
            <History className="w-4 h-4" />
            Riwayat Perubahan
          </button>
        </div>
      </div>

      {toast && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            toast.kind === 'ok'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          Level 1 — daftar FOLDER PERIODE
         ══════════════════════════════════════════════════════════════ */}
      {!activeCycle && (
        <div className="space-y-4">
          {cycles.length === 0 && !isLoadingCycles && (
            <div className="card p-12 text-center text-gray-400">
              <Folder className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium text-gray-600">Belum ada periode</p>
              <p className="text-sm mt-1">
                Buat periode dulu (mis. September 2026), upload data master-nya di menu Master Data, lalu hitung di sini.
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {cycles.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setSelectedCycleId(c.id);
                  setOpenFolder(null);
                  setSelectedRunId(null);
                  setCalcResult(null);
                }}
                className="card p-5 text-left hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors flex items-start gap-3"
              >
                <div className="p-2.5 rounded-lg bg-indigo-50 shrink-0">
                  <Folder className="w-7 h-7 text-indigo-600 fill-indigo-500/20" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900 truncate flex items-center gap-1.5">
                    {c.label}
                    {c.isLocked && <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {c.currentResult ? `Dihitung ${formatDateTime(c.currentResult.calculatedAt)}` : 'Belum dihitung'}
                  </div>
                  {c.derivedStatus === 'STALE' && (
                    <div className="text-xs text-amber-600 font-medium mt-1">⚠ Perlu dihitung ulang</div>
                  )}
                </div>
              </button>
            ))}

            <button
              type="button"
              onClick={() => setShowNewPeriod(true)}
              className="p-5 border-2 border-dashed rounded-lg bg-white hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors flex items-center gap-3 text-gray-500"
            >
              <Plus className="w-6 h-6" />
              <span className="font-medium">Buat Periode Baru</span>
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          Level 2/3 — isi folder periode
         ══════════════════════════════════════════════════════════════ */}
      {activeCycle && (
        <>
          <div className="card p-4">
            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
              <button
                type="button"
                onClick={() => {
                  if (openFolder) setOpenFolder(null);
                  else setSelectedCycleId('');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border text-gray-700 hover:bg-gray-50 shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                {openFolder ? 'Kembali ke periode' : 'Semua periode'}
              </button>

              <div className="min-w-0">
                <div className="text-sm text-gray-800 flex items-center gap-1.5">
                  <Folder className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span className="font-semibold truncate">{activeCycle.label}</span>
                  {openFolder && (
                    <>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className="truncate text-gray-600">
                        {openFolder === 'CALC' ? 'Calculation' : (SOURCE_LABELS[openFolder] ?? openFolder)}
                      </span>
                    </>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {activeCycle.displayText}
                  {activeCycle.mrpStartDate && activeCycle.mrpEndDate && (
                    <>
                      {' '}
                      · MRP {activeCycle.weekCount} minggu: {formatWeekDate(activeCycle.mrpStartDate)} –{' '}
                      {formatWeekDate(activeCycle.mrpEndDate)}
                    </>
                  )}
                </div>
              </div>

              <div className="flex-1" />

              <button
                type="button"
                onClick={handleCalculate}
                disabled={calculate.isPending || activeCycle.isLocked}
                className="btn btn-primary shrink-0"
              >
                {calculate.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                {calculate.isPending ? 'Menghitung...' : dataStatus?.hasResult ? 'Hitung Ulang' : 'Hitung'}
              </button>
            </div>
          </div>

          {/* Hasil tidak valid karena data master berubah setelah perhitungan */}
          {dataStatus?.isInvalid && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <div className="flex-1 text-sm text-amber-900">
                <div className="font-medium">{dataStatus.invalidReason}</div>
                {dataStatus.changedSources.length > 0 && (
                  <div className="text-xs mt-0.5">
                    Data berubah: {dataStatus.changedSources.map((s) => SOURCE_LABELS[s] ?? s).join(', ')}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleCalculate}
                disabled={calculate.isPending || activeCycle.isLocked}
                className="btn btn-primary shrink-0"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Hitung Ulang
              </button>
            </div>
          )}

          {/* Level 2 — sub-folder periode */}
          {!openFolder && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <button
                type="button"
                onClick={() => setOpenFolder('CALC')}
                className="card p-5 text-left hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors"
              >
                <Calculator className="w-7 h-7 text-indigo-600 mb-2" />
                <div className="font-semibold text-gray-900">Calculation</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {dataStatus?.hasResult ? `${formatNum(groups.length, 0)} grup material` : 'Belum dihitung'}
                </div>
              </button>

              {(['MRP', 'WIP', 'HOTLIST', 'STOCK_RM', 'OUTSTANDING_PO'] as const).map((key) => {
                const rowCount =
                  liveCounts?.[key] ??
                  activeCycle.sources.find((s: CycleSourceRow) => s.sourceType === key)?.rowCount ??
                  0;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setOpenFolder(key)}
                    className="card p-5 text-left hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors"
                  >
                    <FolderOpen className="w-7 h-7 text-blue-600 mb-2" />
                    <div className="font-semibold text-gray-900">{SOURCE_LABELS[key] ?? key}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {formatNum(rowCount, 0)} baris
                      {dataStatus?.changedSources.includes(key) && (
                        <span className="text-amber-600 font-medium"> · berubah</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Level 3b — isi folder data master periode ini */}
          {openFolder && openFolder !== 'CALC' && (
            <div className="card overflow-hidden">
              {sourceRowsLoading ? (
                <div className="p-10 text-center text-gray-400">
                  <Loader2 className="w-6 h-6 mx-auto animate-spin" />
                </div>
              ) : (sourceRowsData?.data ?? []).length === 0 ? (
                <div className="p-10 text-center text-gray-400">
                  Belum ada data {SOURCE_LABELS[openFolder] ?? openFolder} untuk periode ini.
                </div>
              ) : (
                <SourceRowsTable sourceType={openFolder} rows={sourceRowsData?.data ?? []} />
              )}
            </div>
          )}
        </>
      )}

      {/* Hasil — hanya di dalam folder Calculation */}
      {openFolder === 'CALC' && groups.length > 0 && (
        <>
          {/* ── Ringkasan angka ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card p-4">
              <div className="text-sm text-gray-500">Total Grup Material</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">{groups.length}</div>
            </div>
            <div className="card p-4 border-red-200">
              <div className="text-sm text-gray-500">Perlu Dibeli</div>
              <div className="text-2xl font-bold text-red-600 mt-1">{shortageGroups} grup</div>
            </div>
            <div className="card p-4 border-green-200">
              <div className="text-sm text-gray-500">Stok Tercukupi</div>
              <div className="text-2xl font-bold text-green-600 mt-1">{sufficientGroups} grup</div>
            </div>
          </div>

          {/* ── Grid folder card ── */}
          <div>
            <div className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">
              Pilih jenis material
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* Card "Semua" */}
              <button
                type="button"
                onClick={() => setSelectedMaterialType(null)}
                className={`
                  w-full text-left rounded-xl border-2 p-4 transition-all duration-150
                  hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-300
                  ${selectedMaterialType === null
                    ? 'bg-indigo-50 border-indigo-400 shadow-sm'
                    : 'bg-white border-gray-200 hover:border-gray-300'}
                `}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 ${selectedMaterialType === null ? 'text-indigo-500' : 'text-gray-400'}`}>
                    {selectedMaterialType === null
                      ? <FolderOpen className="w-7 h-7" />
                      : <Folder className="w-7 h-7" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`font-semibold text-sm ${selectedMaterialType === null ? 'text-indigo-800' : 'text-gray-700'}`}>
                      Semua
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{groups.length} ukuran</div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {shortageGroups > 0 && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-red-100 text-red-700">
                          ⚠️ {shortageGroups} kurang
                        </span>
                      )}
                      {sufficientGroups > 0 && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-green-100 text-green-700">
                          ✅ {sufficientGroups} cukup
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>

              {/* Card per jenis material */}
              {groupedByType.map(({ type, groups: typeGroups }) => (
                <MaterialFolderCard
                  key={type}
                  materialType={type}
                  groups={typeGroups}
                  isSelected={selectedMaterialType === type}
                  onClick={() =>
                    setSelectedMaterialType((prev) => (prev === type ? null : type))
                  }
                />
              ))}
            </div>
          </div>

          {/* ── Tabel detail (difilter sesuai kartu terpilih) ── */}
          <div className="card overflow-hidden">
            {selectedMaterialType && (
              <div className={`px-4 py-2 border-b text-xs font-medium flex items-center gap-2 ${getMeta(selectedMaterialType).bg} ${getMeta(selectedMaterialType).color}`}>
                <Folder className="w-3.5 h-3.5" />
                Menampilkan: {selectedMaterialType} ({displayedGroups.length} ukuran)
                <button
                  type="button"
                  onClick={() => setSelectedMaterialType(null)}
                  className="ml-auto text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 uppercase bg-gray-50/80">
                  <tr>
                    <th className="px-4 py-3 w-10"></th>
                    <th className="px-4 py-3 font-semibold">Ukuran Material</th>
                    <th className="px-4 py-3 font-semibold">Gramatur</th>
                    <th className="px-4 py-3 font-semibold">Supplier</th>
                    <th className="px-4 py-3 font-semibold text-center">Lead Time</th>
                    <th className="px-4 py-3 font-semibold">Estimasi Pengadaan</th>
                    <th className="px-4 py-3 font-semibold text-right">Total Sheet Beli</th>
                    <th className="px-4 py-3 font-semibold text-right">Total Kg Beli</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold text-center">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedGroups.map((group, idx) => (
                    <GroupRow key={`${group.ukuran}-${group.gramatur}-${idx}`} group={group} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {openFolder === 'CALC' && groups.length === 0 && !calculate.isPending && (
        <div className="card p-12 text-center text-gray-400">
          <Calculator className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-600">
            {activeCycle?.currentResult ? 'Klik "Hitung Ulang" untuk menghitung ulang periode ini' : 'Klik "Hitung" untuk menjalankan kalkulasi'}
          </p>
          <p className="text-sm mt-1">
            Kalau data periode masih kosong, upload dulu di menu <span className="font-medium">Master Data</span> (26-Week
            Demand, WIP, Hot List, Stock Raw Material, Outstanding PO) dan pilih periode{' '}
            <strong>{activeCycle?.label}</strong>.
          </p>
        </div>
      )}

      {/* Modal: riwayat perubahan */}
      {showAudit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAudit(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Riwayat Perubahan Periode</h2>
              <button type="button" onClick={() => setShowAudit(false)} className="p-2 text-gray-500 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(85vh-80px)]">
              {auditData?.data.length ? (
                <ul className="space-y-3">
                  {auditData.data.map((a: CycleAuditEntry) => (
                    <li key={a.id} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span className="font-medium text-gray-700">
                          {a.action} · {a.sourceType ?? a.entityType}
                        </span>
                        <span>{formatDateTime(a.createdAt)}</span>
                      </div>
                      <div className="text-sm text-gray-700 mt-1">{a.notes || '—'}</div>
                      <div className="text-xs text-gray-500 mt-0.5">oleh {a.user?.name ?? '—'}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="py-8 text-center text-gray-500 text-sm">Belum ada catatan perubahan.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: buat periode baru */}
      {showNewPeriod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowNewPeriod(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="border-b px-6 py-4 font-semibold text-gray-900">Buat Periode Baru</div>
            <div className="px-6 py-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bulan upload</label>
                <input type="month" value={newMonth} onChange={(e) => setNewMonth(e.target.value)} className="input w-full" />
                <p className="text-xs text-gray-500 mt-1">
                  Periode ditentukan oleh bulan upload, bukan tanggal di dalam data. Satu bulan upload = satu periode.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama periode (opsional)</label>
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder={formatMonth(newMonth)}
                  className="input w-full"
                />
              </div>
            </div>
            <div className="border-t px-6 py-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowNewPeriod(false)} className="px-4 py-2 text-sm rounded-md border">
                Batal
              </button>
              <button
                type="button"
                onClick={handleCreatePeriod}
                disabled={createCycle.isPending}
                className="px-4 py-2 text-sm rounded-md bg-indigo-600 text-white disabled:opacity-50"
              >
                {createCycle.isPending ? 'Membuat...' : 'Buat Periode'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog: NPOF berubah */}
      {confirmNpof && (
        <ConfirmDialog
          title="ℹ️ NPOF sudah berubah"
          lines={[
            `Data NPOF terakhir diubah ${formatDateTime(npofCheck?.data.npofLastUpdatedAt)}.`,
            `Periode ini terakhir dihitung ${formatDateTime(npofCheck?.data.lastCalculatedAt)}.`,
            'Perhitungan akan mengikuti NPOF yang sudah berubah, sehingga angka periode ini bisa berbeda dari sebelumnya. Periode lain tidak terpengaruh.',
          ]}
          confirmLabel="Lanjutkan Hitung"
          busy={calculate.isPending}
          onCancel={() => setConfirmNpof(false)}
          onConfirm={() => void doCalculate()}
        />
      )}

      {/* Modal retensi */}
      {retentionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setRetentionTarget(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="border-b px-6 py-4 font-semibold text-gray-900">⏳ Periode melewati retensi 18 bulan</div>
            <div className="px-6 py-4 space-y-3 text-sm text-gray-700">
              <p>
                Periode <strong>{retentionTarget.label}</strong> sudah melewati batas retensi dan punya{' '}
                {retentionTarget.savedResults.length} hasil tersimpan.
              </p>
              <ul className="text-xs text-gray-600 list-disc pl-5">
                {retentionTarget.savedResults.map((r) => (
                  <li key={r.id}>
                    run #{r.runNumber} · {formatDateTime(r.calculatedAt)}
                    {r.savedNote ? ` — "${r.savedNote}"` : ''}
                  </li>
                ))}
              </ul>
              <div className="space-y-2 pt-2">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked
                    readOnly
                    className="accent-indigo-600"
                  />
                  <span>Tetap simpan selama</span>
                  <select
                    value={retentionMonths}
                    onChange={(e) => setRetentionMonths(Number(e.target.value))}
                    className="input py-1"
                  >
                    {(expiredData?.extensions ?? [3, 6, 9, 12]).map((m) => (
                      <option key={m} value={m}>
                        {m} bulan
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <div className="border-t px-6 py-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  void retention.mutateAsync({ cycleId: retentionTarget.id, action: 'delete' });
                  setRetentionTarget(null);
                }}
                className="px-4 py-2 text-sm rounded-md border text-red-600"
              >
                Hapus sekarang
              </button>
              <button
                type="button"
                onClick={() => {
                  void retention.mutateAsync({ cycleId: retentionTarget.id, action: 'keep', months: retentionMonths });
                  setRetentionTarget(null);
                }}
                className="px-4 py-2 text-sm rounded-md bg-indigo-600 text-white"
              >
                Terapkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pemberitahuan retensi (tidak menutupi halaman) */}
      {expired.length > 0 && !retentionTarget && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start justify-between gap-4">
          <div>
            Ada {expired.length} periode yang sudah melewati retensi 18 bulan dan punya hasil tersimpan. Data tidak
            dihapus otomatis — silakan pilih mau tetap disimpan atau dihapus.
          </div>
          <button
            type="button"
            onClick={() => setRetentionTarget(expired[0])}
            className="px-3 py-1.5 text-xs rounded-md bg-amber-600 text-white whitespace-nowrap"
          >
            Tinjau
          </button>
        </div>
      )}

      {/* Info kunci manual */}
      {activeCycle?.isLocked && (
        <div className="rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-700 flex items-center gap-2">
          <Lock className="w-4 h-4" />
          Periode ini terkunci. Data dan perhitungan tidak bisa diubah sampai kunci dibuka oleh SUPER_ADMIN.
          <Unlock className="w-4 h-4 ml-2" />
        </div>
      )}
    </div>
  );
}
