import { useState, useMemo } from 'react';
import { useItems } from '../hooks/useItems';
import { useTracking } from '../hooks/useTracking';
import { SearchableSelect } from '../components/SearchableSelect';
import { 
  Activity, 
  Calendar, 
  Layers, 
  TrendingUp, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  ArrowLeft,
  ChevronRight,
  Sparkles,
  RefreshCw
} from 'lucide-react';

export function ItemTracking() {
  const [selectedItemCode, setSelectedItemCode] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedShift, setSelectedShift] = useState<string>('');

  const { data: itemsData, isLoading: loadingItems } = useItems();
  
  const items = itemsData?.data || [];

  // Options format for SearchableSelect
  const itemOptions = useMemo(() => {
    return items.map(item => ({
      value: item.partNumber,
      label: `${item.partNumber} - ${item.itemName} (${item.unit})`
    }));
  }, [items]);

  // Fetch tracking details
  const { data: trackingData, isLoading: loadingTracking, error: trackingError, refetch } = useTracking(
    selectedItemCode || undefined,
    selectedDate,
    selectedShift || undefined
  );

  const selectedItemDetails = useMemo(() => {
    if (!selectedItemCode) return null;
    return items.find(item => item.partNumber === selectedItemCode);
  }, [selectedItemCode, items]);

  // Calculate percentage of demand covered by FG and WIP for the visual bar
  const coverageMetrics = useMemo(() => {
    if (!trackingData || trackingData.demand === 0) return { fgPct: 0, wipPct: 0, totalPct: 0, gap: 0 };
    
    const demand = trackingData.demand;
    const fg = trackingData.fg_stock;
    const wip = trackingData.in_production;
    
    const fgPct = Math.min((fg / demand) * 100, 100);
    const wipPct = Math.min((wip / demand) * 100, 100 - fgPct);
    const totalPct = Math.min(((fg + wip) / demand) * 100, 100);
    
    return {
      fgPct,
      wipPct,
      totalPct,
      gap: trackingData.gap
    };
  }, [trackingData]);

  const handleReset = () => {
    setSelectedItemCode('');
    setSelectedShift('');
  };

  const getStatusBadge = (status: 'FULFILLED' | 'IN_PRODUCTION' | 'SHORTAGE') => {
    switch (status) {
      case 'FULFILLED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800">
            <CheckCircle2 size={14} />
            FULFILLED
          </span>
        );
      case 'IN_PRODUCTION':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            <Clock size={14} />
            IN PRODUCTION
          </span>
        );
      case 'SHORTAGE':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800">
            <AlertCircle size={14} />
            SHORTAGE
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Breadcrumb */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span>Dashboard</span>
            <ChevronRight size={12} />
            <span className="text-foreground font-medium">Item Tracking</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Item Tracking & Gap Analysis</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Menganalisis kecukupan stok Finish Good (FG) dan Work in Progress (WIP) terhadap kebutuhan produksi (demand).
          </p>
        </div>
        {selectedItemCode && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground bg-background hover:bg-muted border px-3 py-2 rounded-md transition-colors"
          >
            <ArrowLeft size={16} /> Kembali ke Pencarian
          </button>
        )}
      </div>

      {/* SEARCH/FILTER PANEL */}
      <div className="bg-card text-card-foreground p-5 border rounded-lg shadow-sm space-y-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Activity className="text-primary" size={18} /> 
          {selectedItemCode ? 'Sesuaikan Filter Pelacakan' : 'Pilih Part Number & Tanggal Pelacakan'}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Item Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Part Number</label>
            {loadingItems ? (
              <div className="h-10 w-full bg-muted animate-pulse rounded-md"></div>
            ) : (
              <SearchableSelect
                options={itemOptions}
                value={selectedItemCode}
                onChange={setSelectedItemCode}
                placeholder="Cari part number atau nama..."
              />
            )}
          </div>

          {/* Date Picker */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tanggal Demand</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <input
                type="date"
                className="w-full h-10 pl-9 pr-3 border rounded-md bg-background text-sm font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
          </div>

          {/* Shift Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Shift Produksi</label>
            <select
              className="w-full h-10 px-3 border rounded-md bg-background text-sm font-medium focus:outline-none focus:ring-1 focus:ring-primary"
              value={selectedShift}
              onChange={(e) => setSelectedShift(e.target.value)}
            >
              <option value="">Semua Shift (1, 2, 3)</option>
              <option value="1">Shift 1</option>
              <option value="2">Shift 2</option>
              <option value="3">Shift 3</option>
            </select>
          </div>
        </div>
      </div>

      {/* TRACKING RESULTS */}
      {!selectedItemCode ? (
        // Placeholder empty state
        <div className="bg-card shadow-sm border rounded-lg p-12 text-center flex flex-col items-center justify-center space-y-4">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary animate-pulse">
            <Activity size={32} />
          </div>
          <div className="max-w-md space-y-1.5">
            <h3 className="text-lg font-bold">Mulai Pelacakan Part Number</h3>
            <p className="text-muted-foreground text-sm">
              Gunakan pencarian di atas untuk memilih part number. Sistem akan menampilkan analisis kebutuhan harian, ketersediaan gudang saat ini (FG), sisa proses di lantai produksi (WIP), serta kalkulasi gap secara langsung.
            </p>
          </div>
        </div>
      ) : loadingTracking ? (
        // Loading State
        <div className="space-y-6">
          <div className="h-20 bg-muted animate-pulse rounded-lg"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="h-28 bg-muted animate-pulse rounded-lg" key={1}></div>
            <div className="h-28 bg-muted animate-pulse rounded-lg" key={2}></div>
            <div className="h-28 bg-muted animate-pulse rounded-lg" key={3}></div>
            <div className="h-28 bg-muted animate-pulse rounded-lg" key={4}></div>
          </div>
          <div className="h-64 bg-muted animate-pulse rounded-lg"></div>
        </div>
      ) : trackingError ? (
        // Error State
        <div className="bg-destructive/10 text-destructive border border-destructive/20 p-6 rounded-lg text-center space-y-3">
          <AlertCircle size={36} className="mx-auto text-destructive" />
          <h3 className="text-lg font-bold">Gagal Memuat Data Tracking</h3>
          <p className="text-sm max-w-md mx-auto">{trackingError.message}</p>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 px-4 py-2 border rounded-md font-semibold text-sm bg-background hover:bg-muted"
          >
            <RefreshCw size={14} /> Coba Lagi
          </button>
        </div>
      ) : trackingData ? (
        // Active Tracking Screen
        <div className="space-y-6">
          {/* HEADER DETAILS CARD */}
          <div className="bg-card border rounded-lg shadow-sm p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <span className="bg-primary/10 text-primary font-mono text-sm px-2.5 py-0.5 rounded font-bold">
                  {trackingData.item_code}
                </span>
                {getStatusBadge(trackingData.status)}
              </div>
              <h2 className="text-xl font-bold mt-1 text-card-foreground">
                {trackingData.item_name}
              </h2>
              <p className="text-xs text-muted-foreground font-medium">
                Satuan Ukuran: <span className="text-foreground font-semibold uppercase">{selectedItemDetails?.unit || 'pcs'}</span> | 
                Tanggal Pelacakan: <span className="text-foreground font-semibold">{trackingData.date}</span>
                {selectedShift && <> | Shift: <span className="text-foreground font-semibold">{selectedShift}</span></>}
              </p>
            </div>

            <div className="flex items-center gap-2 bg-secondary/30 p-2 border rounded-lg self-start md:self-auto text-xs font-medium">
              <Sparkles size={14} className="text-primary animate-bounce" />
              <span>Dihitung berdasarkan real-time database snapshot</span>
            </div>
          </div>

          {/* SUMMARY CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* DEMAND CARD */}
            <div className="bg-card text-card-foreground shadow-sm border rounded-lg p-5 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Demand</span>
                  <p className="text-2xl font-bold">{trackingData.demand.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">{selectedItemDetails?.unit || 'pcs'}</span></p>
                </div>
                <div className="p-2 bg-blue-50 dark:bg-blue-950/20 text-blue-600 rounded">
                  <Calendar size={20} />
                </div>
              </div>
              <span className="text-xs text-muted-foreground mt-2 border-t pt-1.5 block">Target demand harian</span>
            </div>

            {/* FG STOCK CARD */}
            <div className="bg-card text-card-foreground shadow-sm border rounded-lg p-5 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Finish Good Stock</span>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-500">{trackingData.fg_stock.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">{selectedItemDetails?.unit || 'pcs'}</span></p>
                </div>
                <div className="p-2 bg-green-50 dark:bg-green-950/20 text-green-600 rounded">
                  <Layers size={20} />
                </div>
              </div>
              <span className="text-xs text-muted-foreground mt-2 border-t pt-1.5 block">Stok siap kirim di gudang</span>
            </div>

            {/* WIP CARD */}
            <div className="bg-card text-card-foreground shadow-sm border rounded-lg p-5 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Work In Progress</span>
                  <p className="text-2xl font-bold text-amber-500">{trackingData.in_production.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">{selectedItemDetails?.unit || 'pcs'}</span></p>
                </div>
                <div className="p-2 bg-amber-50 dark:bg-amber-950/20 text-amber-500 rounded">
                  <Clock size={20} />
                </div>
              </div>
              <span className="text-xs text-muted-foreground mt-2 border-t pt-1.5 block">Sedang diproduksi di mesin</span>
            </div>

            {/* GAP CARD */}
            <div className={`bg-card text-card-foreground shadow-sm border rounded-lg p-5 flex flex-col justify-between transition-colors ${
              trackingData.gap < 0 ? 'border-red-200 bg-red-50/10 dark:border-red-900/30' : 'border-green-200 bg-green-50/10 dark:border-green-900/30'
            }`}>
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Gap Analisis</span>
                  <p className={`text-2xl font-bold ${trackingData.gap < 0 ? 'text-red-600 dark:text-red-500' : 'text-green-600'}`}>
                    {trackingData.gap > 0 ? '+' : ''}{trackingData.gap.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">{selectedItemDetails?.unit || 'pcs'}</span>
                  </p>
                </div>
                <div className={`p-2 rounded ${
                  trackingData.gap < 0 ? 'bg-red-50 dark:bg-red-950/20 text-red-600' : 'bg-green-50 dark:bg-green-950/20 text-green-600'
                }`}>
                  <TrendingUp size={20} />
                </div>
              </div>
              <span className="text-xs text-muted-foreground mt-2 border-t pt-1.5 block">
                {trackingData.gap < 0 
                  ? '⚠️ Kurang dari target demand' 
                  : '✅ Aman memenuhi target demand'
                }
              </span>
            </div>
          </div>

          {/* VISUAL SUPPLY PROGRESS BAR */}
          <div className="bg-card text-card-foreground shadow-sm border rounded-lg p-6">
            <h3 className="text-base font-bold mb-4">Grafik Kebutuhan vs Pasokan</h3>
            
            {trackingData.demand === 0 ? (
              <div className="p-8 text-center border-2 border-dashed rounded-md text-muted-foreground text-sm">
                Tidak ada target Demand terdaftar pada hari ini. Stok FG yang tersedia ({trackingData.fg_stock.toLocaleString()} pcs) aman dari kekurangan.
              </div>
            ) : (
              <div className="space-y-6">
                {/* Visual stacked progress bar representing supply */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-medium">
                    <span>Progres Pasokan (FG + WIP)</span>
                    <span>Total Pasokan: {(trackingData.fg_stock + trackingData.in_production).toLocaleString()} / {trackingData.demand.toLocaleString()} pcs ({coverageMetrics.totalPct.toFixed(0)}%)</span>
                  </div>
                  
                  {/* The bar container */}
                  <div className="relative w-full h-8 bg-secondary rounded-lg overflow-hidden flex shadow-inner">
                    {/* FG Stock part */}
                    <div 
                      className="bg-green-600 h-full flex items-center justify-center text-[10px] font-bold text-white transition-all duration-500"
                      style={{ width: `${coverageMetrics.fgPct}%` }}
                      title={`FG Stock: ${trackingData.fg_stock} pcs`}
                    >
                      {coverageMetrics.fgPct > 10 && `FG: ${trackingData.fg_stock}`}
                    </div>
                    {/* WIP part */}
                    <div 
                      className="bg-amber-500 h-full flex items-center justify-center text-[10px] font-bold text-white transition-all duration-500 border-l border-white/20"
                      style={{ width: `${coverageMetrics.wipPct}%` }}
                      title={`WIP: ${trackingData.in_production} pcs`}
                    >
                      {coverageMetrics.wipPct > 10 && `WIP: ${trackingData.in_production}`}
                    </div>
                    
                    {/* Target line (always at 100% of container width) */}
                    <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-red-600 dark:bg-red-500 z-10" title="Target Demand">
                      <span className="absolute -top-1 right-1 bg-red-600 text-[8px] text-white px-1 rounded transform translate-x-1/2 scale-75 uppercase">Target</span>
                    </div>
                  </div>
                </div>

                {/* Legends */}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium">
                  <div className="flex items-center gap-1.5">
                    <div className="h-3 w-3 bg-green-600 rounded"></div>
                    <span>Selesai / Ready Stock (FG): {trackingData.fg_stock.toLocaleString()} pcs</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-3 w-3 bg-amber-500 rounded"></div>
                    <span>Proses Produksi (WIP): {trackingData.in_production.toLocaleString()} pcs</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-3 w-0.5 bg-red-600"></div>
                    <span>Garis Sasaran (Demand): {trackingData.demand.toLocaleString()} pcs</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ACTIVE WIP DETAILS TABLE */}
          <div className="bg-card text-card-foreground shadow-sm border rounded-lg overflow-hidden">
            <div className="p-5 border-b flex flex-col sm:flex-row justify-between sm:items-center gap-2">
              <div>
                <h3 className="text-base font-bold">Detail Pekerjaan WIP Aktif</h3>
                <p className="text-xs text-muted-foreground">Menampilkan rincian stasiun kerja dan kapasitas item ini yang sedang diproduksi.</p>
              </div>
              <span className="bg-secondary px-2.5 py-1 rounded text-xs font-semibold text-secondary-foreground self-start sm:self-auto">
                {trackingData.wip_details.length} WIP Terdaftar
              </span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-secondary/50">
                  <tr>
                    <th className="px-6 py-3.5 font-semibold">Stasiun Kerja / Lokasi</th>
                    <th className="px-6 py-3.5 font-semibold">Shift</th>
                    <th className="px-6 py-3.5 font-semibold text-right">Kuantitas</th>
                    <th className="px-6 py-3.5 font-semibold">Progres WIP</th>
                    <th className="px-6 py-3.5 font-semibold">Tanggal Mulai</th>
                    <th className="px-6 py-3.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {trackingData.wip_details.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-muted-foreground text-sm">
                        Tidak ada aktivitas WIP aktif untuk item ini di lini produksi.
                      </td>
                    </tr>
                  ) : (
                    trackingData.wip_details.map((wip) => (
                      <tr key={wip.wip_id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-6 py-4 font-semibold text-foreground">
                          {wip.location}
                        </td>
                        <td className="px-6 py-4">
                          <span className="bg-secondary text-secondary-foreground px-2 py-0.5 rounded text-xs font-medium">Shift {wip.shift}</span>
                        </td>
                        <td className="px-6 py-4 font-bold text-right text-foreground">
                          {wip.qty.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">{selectedItemDetails?.unit || 'pcs'}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-24 bg-secondary rounded-full h-2 shadow-inner overflow-hidden">
                              <div className="bg-primary h-2 rounded-full" style={{ width: `${wip.progress_pct}%` }}></div>
                            </div>
                            <span className="text-xs font-semibold">{wip.progress_pct}%</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs font-medium text-muted-foreground">
                          {wip.date}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                            wip.status === 'COMPLETED' 
                              ? 'bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-400' 
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-950/30 dark:text-blue-400'
                          }`}>
                            {wip.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
