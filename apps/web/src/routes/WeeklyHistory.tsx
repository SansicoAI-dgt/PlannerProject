import { useState, useEffect } from 'react';
import { Calendar, Filter, Loader2, Package, Layers, AlertTriangle, Activity } from 'lucide-react';

import { fetchApi } from '../lib/api';

export default function WeeklyHistory() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [error, setError] = useState('');
  
  // Default date to this week (Monday to Sunday)
  const getThisWeek = () => {
    const curr = new Date();
    const first = curr.getDate() - curr.getDay() + (curr.getDay() === 0 ? -6 : 1); // First day is Monday
    const firstDay = new Date(curr.setDate(first));
    firstDay.setHours(0, 0, 0, 0);
    const lastDay = new Date(firstDay);
    lastDay.setDate(firstDay.getDate() + 6);
    lastDay.setHours(23, 59, 59, 999);
    return { startDate: firstDay, endDate: lastDay };
  };

  const initDates = getThisWeek();
  const [startDate, setStartDate] = useState(initDates.startDate.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(initDates.endDate.toISOString().split('T')[0]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [globalFulfillment, setGlobalFulfillment] = useState(0);
  const [totalGap, setTotalGap] = useState(0);
  const [perfRange, setPerfRange] = useState<string>('all');

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1); // reset to page 1 on new search
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      let url = `/history/weekly?start_date=${startDate}&end_date=${endDate}&search=${encodeURIComponent(debouncedSearch)}&page=${page}&limit=${limit}`;
      if (perfRange !== 'all') {
        const [min, max] = perfRange.split('-');
        url += `&perf_min=${min}&perf_max=${max}`;
      }
      
      const result = await fetchApi<any>(url);
      setData(result.data || []);
      if (result.pagination) {
        setTotalPages(result.pagination.totalPages || 1);
        setTotalItems(result.pagination.total || 0);
      }
      if (result.globalSummary) {
        setTotalGap(result.globalSummary.totalGap || 0);
        setGlobalFulfillment(result.globalSummary.fulfillmentPercent || 0);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load history data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [perfRange]);

  useEffect(() => {
    loadData();
  }, [startDate, endDate, debouncedSearch, page, perfRange]);

  const filteredData = data; // Already filtered server-side

  // Aggregate daily totals
  const dates = data.length > 0 ? data[0].daily.map((d: any) => new Date(d.date)) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Weekly History</h1>
          <p className="text-gray-500 mt-1">Laporan harian & mingguan untuk pergerakan Demand, FG, dan WIP</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg shadow-sm border border-gray-200">
            <Calendar className="w-5 h-5 text-gray-400" />
            <input 
              type="date"
              className="border-none focus:ring-0 text-sm"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <span className="text-gray-400">-</span>
            <input 
              type="date"
              className="border-none focus:ring-0 text-sm"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <button 
            onClick={loadData}
            className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <Filter className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-card text-card-foreground border rounded-lg p-6 shadow-sm flex justify-between items-start">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Total Part Number</p>
            <h3 className="text-3xl font-bold tracking-tight text-blue-600 dark:text-blue-400">
              {totalItems}
            </h3>
            <p className="text-xs text-muted-foreground">
              Total unique items in history.
            </p>
          </div>
          <div className="p-2 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-md">
            <Layers size={20} />
          </div>
        </div>

        <div className="bg-card text-card-foreground border rounded-lg p-6 shadow-sm flex justify-between items-start">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Total Gap</p>
            <h3 className="text-3xl font-bold tracking-tight text-red-600 dark:text-red-400">
              {totalGap.toLocaleString()}
            </h3>
            <p className="text-xs text-muted-foreground">
              Total shortage gap across all items.
            </p>
          </div>
          <div className="p-2 bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 rounded-md">
            <AlertTriangle size={20} />
          </div>
        </div>

        <div className="bg-card text-card-foreground border rounded-lg p-6 shadow-sm flex justify-between items-start">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Performance</p>
            <h3 className="text-3xl font-bold tracking-tight text-green-600 dark:text-green-400">
              {globalFulfillment}%
            </h3>
            <p className="text-xs text-muted-foreground">
              Overall fulfillment performance.
            </p>
          </div>
          <div className="p-2 bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400 rounded-md">
            <Activity size={20} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <input
              type="text"
              placeholder="Cari Item Code / Name..."
              className="w-full sm:w-80 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <select
              value={perfRange}
              onChange={(e) => setPerfRange(e.target.value)}
              className="w-full sm:w-48 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white text-sm"
            >
              <option value="all">Semua Performance</option>
              <option value="0-30">Performance 0% - 30%</option>
              <option value="30-50">Performance 30% - 50%</option>
              <option value="50-70">Performance 50% - 70%</option>
              <option value="70-100">Performance 70% - 100%</option>
            </select>
          </div>
          <div className="flex items-center gap-2 bg-blue-50 text-blue-800 px-4 py-2 rounded-lg font-medium border border-blue-100 whitespace-nowrap w-full sm:w-auto justify-center">
            <Package className="w-5 h-5 text-blue-600" />
            <span>Total Fulfillment Seminggu: {globalFulfillment}%</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : error ? (
            <div className="p-8 text-center text-red-500">{error}</div>
          ) : filteredData.length === 0 ? (
            <div className="p-8 text-center text-gray-500">Tidak ada data history untuk periode ini</div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 whitespace-nowrap bg-white sticky left-0 z-10 border-r min-w-[200px]">Item</th>
                  {dates.map((d: Date, idx: number) => (
                    <th key={idx} className="px-6 py-3 text-center min-w-[150px] border-r">
                      {d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </th>
                  ))}
                  <th className="px-6 py-3 text-center bg-blue-50 min-w-[180px]">Weekly Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredData.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-6 py-4 bg-white sticky left-0 z-10 border-r">
                      <div className="font-medium text-gray-900">{item.partNumber}</div>
                      <div className="text-xs text-gray-500 mt-1">{item.description}</div>
                    </td>
                    {item.daily.map((day: any, dIdx: number) => (
                      <td key={dIdx} className="px-4 py-3 border-r align-top">
                        <div className="flex flex-col gap-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Demand:</span>
                            <span className="font-medium">{day.demand}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">FG Stock:</span>
                            <span className="font-medium text-green-600">{day.fgStock}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">WIP:</span>
                            <span className="font-medium text-yellow-600">{day.wip}</span>
                          </div>
                          <div className="w-full h-px bg-gray-100 my-1"></div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Gap:</span>
                            <span className={`font-medium ${day.shortage > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                              {day.shortage > 0 ? `-${day.shortage}` : '0'}
                            </span>
                          </div>
                        </div>
                      </td>
                    ))}
                    <td className="px-4 py-3 bg-blue-50/50 align-top">
                       <div className="flex flex-col gap-2 text-xs">
                          <div className="flex justify-between items-center bg-white p-2 rounded border">
                            <span className="text-gray-600 font-medium">Fulfillment</span>
                            <span className={`font-bold ${item.summary.weeklyFulfillmentPercent >= 100 ? 'text-green-600' : 'text-orange-600'}`}>
                              {item.summary.weeklyFulfillmentPercent}%
                            </span>
                          </div>
                          <div className="flex justify-between px-1">
                            <span className="text-gray-500">Total Demand:</span>
                            <span className="font-medium">{item.summary.weeklyDemand}</span>
                          </div>
                          <div className="flex justify-between px-1">
                            <span className="text-gray-500">Total FG Stock:</span>
                            <span className="font-medium text-green-600">{item.daily.reduce((acc: any, d: any) => acc + d.fgStock, 0)}</span>
                          </div>
                          <div className="flex justify-between px-1">
                            <span className="text-gray-500">Total WIP:</span>
                            <span className="font-medium text-yellow-600">{item.daily.reduce((acc: any, d: any) => acc + d.wip, 0)}</span>
                          </div>
                          <div className="flex justify-between px-1">
                            <span className="text-gray-500">Total Gap:</span>
                            <span className="font-medium text-red-600">{item.daily.reduce((acc: any, d: any) => acc + (d.shortage > 0 ? d.shortage : 0), 0)}</span>
                          </div>
                       </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        
        {/* Pagination Controls */}
        {!loading && filteredData.length > 0 && totalPages > 1 && (
          <div className="p-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
            <span className="text-sm text-gray-500">
              Menampilkan {(page - 1) * limit + 1} - {Math.min(page * limit, totalItems)} dari {totalItems} item
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white hover:bg-gray-50 disabled:opacity-50 font-medium cursor-pointer"
              >
                Previous
              </button>
              <span className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white hover:bg-gray-50 disabled:opacity-50 font-medium cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
