import React, { useState } from 'react';
import { useWIPs, useUpsertWIP, useBulkUpsertWIP, useBulkDeleteWIP } from '../hooks/useWIP';
import { useItems, useCreateItem } from '../hooks/useItems';
import { SearchableSelect } from '../components/SearchableSelect';
import { Settings2, Plus, Save, Upload, Trash2, Search, Filter, Calendar, X, Folder, ArrowLeft } from 'lucide-react';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { useAuthStore } from '../stores/authStore';

const WIP_SHEET_LOCATIONS = ['Blister', 'UV', 'Varnish OPP', 'Die Cut'];

function getWipUnit(location: string): 'Sheet' | 'Pcs' {
  return WIP_SHEET_LOCATIONS.some(l =>
    location.toLowerCase().includes(l.toLowerCase())
  ) ? 'Sheet' : 'Pcs';
}

export function WIP() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
  
  const [showForm, setShowForm] = useState(false);
  
  const { data: wipData, isLoading: loadingWIP } = useWIPs();
  const { data: itemsData } = useItems();
  const createItem = useCreateItem();
  const upsertWIP = useUpsertWIP();
  const bulkUpsertWIP = useBulkUpsertWIP();
  const bulkDeleteWIP = useBulkDeleteWIP();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState<any[]>([]);
  const [importSearch, setImportSearch] = useState('');

  const [formData, setFormData] = useState({
    itemId: '',
    location: '',
    quantity: 0,
    progressPercent: 0,
    date: new Date().toISOString().split('T')[0],
    shift: 1,
    status: 'IN_PROGRESS',
    notes: '',
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const wips = wipData?.data || [];
  const items = itemsData?.data || [];

  const groupedMonths = React.useMemo(() => {
    const groups: Record<string, any[]> = {};
    wips.forEach((wip: any) => {
      if (!wip.date) return;
      const monthKey = wip.date.substring(0, 7); // yyyy-MM
      if (!groups[monthKey]) groups[monthKey] = [];
      groups[monthKey].push(wip);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [wips]);

  const currentMonthWips = selectedMonth
    ? selectedMonth === 'ALL'
      ? wips
      : wips.filter((w: any) => w.date?.startsWith(selectedMonth))
    : wips;

  // Extract unique locations dynamically from current active WIP data
  const activeLocations = React.useMemo(() => {
    const activeLocs = Array.from(new Set(currentMonthWips.map((wip: any) => wip.location))).filter(Boolean) as string[];
    const defaultLocations = ['Mesin-01', 'Mesin-02', 'Assembly Line', 'QC Station'];
    return activeLocs.length > 0 ? activeLocs : defaultLocations;
  }, [currentMonthWips]);

  const allLocations = activeLocations;

  // Filter WIP data based on search, location, and date inputs
  const filteredWips = currentMonthWips.filter((wip: any) => {
    // Search query matches part number or name
    const matchesSearch = 
      !searchQuery ||
      wip.item.partNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      wip.item.itemName.toLowerCase().includes(searchQuery.toLowerCase());

    // Location matches selected filter option
    const matchesLocation = 
      !selectedLocation || wip.location === selectedLocation;

    // Date matches production date
    const wipDateStr = wip.date ? wip.date.split('T')[0] : '';
    const targetDateStr = selectedDate;

    const matchesDate = 
      !selectedDate || 
      wipDateStr === targetDateStr;

    return matchesSearch && matchesLocation && matchesDate;
  });

  const groupedWips = React.useMemo(() => {
    const groups: Record<string, any> = {};
    for (const wip of filteredWips) {
      const key = wip.item.partNumber;
      if (!groups[key]) {
        groups[key] = {
          id: key,
          itemCode: wip.item.partNumber,
          itemName: wip.item.itemName,
          locations: {},
          ids: [],
          recordedDate: wip.date ? wip.date.split('T')[0] : '',
        };
      }
      groups[key].locations[wip.location] = { id: wip.id, quantity: wip.quantity };
      groups[key].ids.push(wip.id);

      const wipDateStr = wip.date ? wip.date.split('T')[0] : '';
      if (wipDateStr && wipDateStr > groups[key].recordedDate) {
        groups[key].recordedDate = wipDateStr;
      }
    }
    return Object.values(groups).sort((a: any, b: any) => a.itemCode.localeCompare(b.itemCode));
  }, [filteredWips]);

  const itemOptions = items.map((item: any) => ({
    value: item.id,
    label: `${item.itemCode} - ${item.itemName}`
  }));

  const locationOptions = React.useMemo(() => {
    const opts = allLocations.map(loc => ({
      value: loc,
      label: loc
    }));
    if (formData.location && !allLocations.includes(formData.location)) {
      opts.push({ value: formData.location, label: formData.location });
    }
    return opts;
  }, [allLocations, formData.location]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws);
        
        const parsedRecords: any[] = [];
        data.forEach((row: any, index) => {
          const itemKey = Object.keys(row).find(k => k.trim().toLowerCase().includes('no toy')) || Object.keys(row)[1];
          const itemCode = String(row[itemKey] || '').trim();
          
          if (!itemCode) return;
          
          Object.keys(row).forEach(key => {
            const k = key.trim().toLowerCase();
            if (k !== 'no' && !k.includes('no toy') && !k.includes('total wip')) {
              const val = String(row[key]).trim();
              if (val !== '-' && val !== '') {
                const numVal = parseFloat(val);
                if (!isNaN(numVal)) {
                  parsedRecords.push({
                    id: `import-${index}-${key}`,
                    itemCode,
                    location: key.trim(),
                    quantity: numVal * 1000,
                    date: new Date().toISOString().split('T')[0]
                  });
                }
              }
            }
          });
        });
        
        setImportData(parsedRecords);
      } catch (err) {
        alert('Failed to parse file. Please make sure it is a valid Excel/CSV.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleBulkSubmit = async (saveMode: 'overwrite' | 'add') => {
    if (importData.length === 0) return;
    try {
      await bulkUpsertWIP.mutateAsync({
        records: importData,
        saveMode
      });
      setShowImportModal(false);
      setImportData([]);
    } catch (err: any) {
      alert(err.message || 'Failed to bulk import WIP');
    }
  };



  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} selected records?`)) return;
    try {
      await bulkDeleteWIP.mutateAsync({ ids: selectedIds });
      setSelectedIds([]);
    } catch (err: any) {
      alert(err.message || 'Failed to delete records');
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const newIds = new Set([...selectedIds, ...filteredWips.map((s: any) => s.id)]);
      setSelectedIds(Array.from(newIds));
    } else {
      const filteredSet = new Set(filteredWips.map((s: any) => s.id));
      setSelectedIds(selectedIds.filter(id => !filteredSet.has(id)));
    }
  };
  const allFilteredSelected = filteredWips.length > 0 && filteredWips.every((s: any) => selectedIds.includes(s.id));

  const handleSubmit = async (e: React.FormEvent | React.MouseEvent, saveMode: 'overwrite' | 'add') => {
    e.preventDefault();
    if (!formData.itemId || !formData.location) return;

    try {
      await upsertWIP.mutateAsync({
        ...formData,
        shift: Number(formData.shift),
        quantity: Number(formData.quantity),
        progressPercent: Number(formData.progressPercent),
        saveMode
      });
      setShowForm(false);
      setFormData(prev => ({ ...prev, itemId: '', quantity: 0, progressPercent: 0, notes: '' }));
    } catch (err: any) {
      alert(err.message || 'Failed to save WIP');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Work In Progress (WIP)</h2>
          <p className="text-muted-foreground text-sm">Manage items currently in production stages.</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <button 
              onClick={() => setShowImportModal(true)}
              className="bg-secondary text-secondary-foreground border hover:bg-secondary/80 px-4 py-2 rounded-md font-medium text-sm flex items-center space-x-2"
            >
              <Upload size={16} />
              <span>Import Data</span>
            </button>
          )}
          {isAdmin && (
            <button 
              onClick={() => setShowForm(!showForm)}
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md font-medium text-sm flex items-center space-x-2"
            >
              <Plus size={16} />
              <span>Update WIP Status</span>
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <div className="bg-card text-card-foreground border rounded-lg p-6 shadow-sm">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Settings2 size={18} /> Update Work In Progress
          </h3>
          <p className="text-xs text-muted-foreground mb-4">Note: Providing an update for the same Item + Location will OVERWRITE its current WIP data.</p>
          
          <form className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
            <div className="space-y-2 lg:col-span-2">
              <label className="text-sm font-medium">Part Number</label>
              <SearchableSelect
                options={itemOptions}
                value={formData.itemId}
                onChange={val => setFormData({...formData, itemId: val})}
                onAdd={async (search) => {
                  try {
                    const res = await createItem.mutateAsync({ partNumber: search, itemName: search, unit: 'PCS' }) as any;
                    if (res?.data?.id) {
                      setFormData(prev => ({...prev, itemId: res.data.id}));
                    }
                  } catch (e: any) {
                    alert(e.message || "Failed to create part number");
                  }
                }}
                placeholder="Select Part Number..."
              />
            </div>
            <div className="space-y-2 lg:col-span-2">
              <label className="text-sm font-medium">Location / Production Line</label>
              <SearchableSelect
                options={locationOptions}
                value={formData.location}
                onChange={val => setFormData({...formData, location: val})}
                onAdd={(search) => {
                  setFormData(prev => ({...prev, location: search}));
                }}
                placeholder="Select Location..."
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Quantity</label>
              <input 
                type="number" required min="1"
                className="w-full h-10 px-3 border rounded-md bg-background"
                value={formData.quantity} onChange={e => setFormData({...formData, quantity: Number(e.target.value)})}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Recorded Date</label>
              <input 
                type="date" required
                className="w-full h-10 px-3 border rounded-md bg-background"
                value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})}
              />
            </div>

            <div className="lg:col-span-4 flex justify-end gap-3 mt-2">
              <button type="button" onClick={() => setShowForm(false)} className="h-10 border px-6 rounded-md font-medium hover:bg-muted">Cancel</button>
              <button type="button" onClick={(e) => handleSubmit(e, 'add')} disabled={upsertWIP.isPending} className="h-10 bg-green-600 hover:bg-green-700 text-white px-6 rounded-md font-medium flex items-center gap-2">
                <Plus size={16} /> {upsertWIP.isPending ? 'Saving...' : 'Save'}
              </button>
              <button type="button" onClick={(e) => handleSubmit(e, 'overwrite')} disabled={upsertWIP.isPending} className="h-10 bg-primary text-primary-foreground px-6 rounded-md font-medium flex items-center gap-2">
                <Save size={16} /> {upsertWIP.isPending ? 'Saving...' : 'Save Overwrite'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Folder View or Table View */}
      {!selectedMonth ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-in fade-in zoom-in-95 duration-200">
          {groupedMonths.length === 0 && !loadingWIP && (
            <div className="col-span-full py-12 text-center text-muted-foreground border rounded-lg bg-card">
              <Settings2 className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-base font-semibold">Tidak ada data WIP</p>
              <p className="text-sm mt-1">Upload excel atau update status WIP untuk menambahkan data.</p>
            </div>
          )}
          {wips.length > 0 && (
            <div
              onClick={() => setSelectedMonth('ALL')}
              className="cursor-pointer p-5 border-2 border-indigo-500/30 bg-gradient-to-br from-indigo-500/5 to-purple-500/10 hover:from-indigo-500/10 hover:to-purple-500/20 hover:border-indigo-500/60 rounded-lg transition-all flex items-center gap-4 group shadow-sm relative overflow-hidden"
            >
              <div className="p-3 bg-indigo-500/15 rounded-lg group-hover:bg-indigo-500/25 transition-colors">
                <Folder className="w-8 h-8 text-indigo-600 dark:text-indigo-400 fill-indigo-500/20" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    Semua Data
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20 uppercase tracking-wider">
                    All
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{wips.length} Items (Total)</p>
              </div>
            </div>
          )}
          {groupedMonths.map(([monthKey, monthRecords]) => (
            <div
              key={monthKey}
              onClick={() => setSelectedMonth(monthKey)}
              className="cursor-pointer p-5 border rounded-lg bg-card hover:bg-muted/50 hover:border-primary/50 transition-all flex items-center gap-4 group shadow-sm"
            >
              <div className="p-3 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                <Folder className="w-8 h-8 text-blue-500 fill-blue-500/20" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">
                  {format(new Date(monthKey + '-01'), 'MMMM yyyy')}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">{monthRecords.length} Items</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-2 animate-in fade-in slide-in-from-bottom-2">
            <button 
              onClick={() => setSelectedMonth(null)}
              className="p-2 hover:bg-background rounded-md border text-muted-foreground hover:text-foreground transition-colors shrink-0 bg-card"
              title="Kembali ke Folder"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h3 className="font-semibold text-lg">{selectedMonth === 'ALL' ? 'Semua Data (WIP)' : format(new Date(selectedMonth + '-01'), 'MMMM yyyy')}</h3>
          </div>
          {/* Filters Bar */}
          <div className="bg-card text-card-foreground border rounded-lg p-4 shadow-sm flex flex-col md:flex-row gap-4 items-center animate-in fade-in slide-in-from-bottom-2">
        {isAdmin && selectedIds.length > 0 && (
          <button 
            onClick={handleDeleteSelected}
            disabled={bulkDeleteWIP.isPending}
            className="w-full md:w-auto h-10 px-4 flex items-center justify-center gap-2 border bg-red-600 text-white hover:bg-red-700 text-sm font-medium rounded-md transition-colors"
          >
            <Trash2 size={16} />
            <span className="whitespace-nowrap">Delete Selected ({selectedIds.length})</span>
          </button>
        )}
        {/* Search Input */}
        <div className="relative w-full md:flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <input
            type="text"
            placeholder="Search by Part Number or Name..."
            className="w-full h-10 pl-10 pr-10 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Location Dropdown */}
        <div className="relative w-full md:w-64">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground flex items-center pointer-events-none">
            <Filter size={16} />
          </div>
          <select
            className="w-full h-10 pl-10 pr-8 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm appearance-none cursor-pointer"
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
          >
            <option value="">All Locations</option>
            {activeLocations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground flex items-center">
            <span className="text-xs">▼</span>
          </div>
        </div>

        {/* Date Filter */}
        <div className="relative w-full md:w-64">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground flex items-center pointer-events-none">
            <Calendar size={16} />
          </div>
          <input
            type="date"
            className="w-full h-10 pl-10 pr-10 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm cursor-pointer"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
          {selectedDate && (
            <button
              onClick={() => setSelectedDate('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Reset All */}
        {(searchQuery || selectedLocation || selectedDate) && (
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedLocation('');
              setSelectedDate('');
            }}
            className="w-full md:w-auto h-10 px-4 flex items-center justify-center gap-2 border border-red-200 dark:border-red-950/50 bg-red-50/50 dark:bg-red-950/10 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 text-sm font-medium rounded-md transition-colors"
          >
            <X size={16} />
            <span>Reset</span>
          </button>
        )}
      </div>

      <div className="bg-card text-card-foreground border rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-secondary/50 text-muted-foreground uppercase text-xs font-medium">
              <tr>
                {isAdmin && (
                  <th className="px-6 py-3 w-12 text-center">
                    <input type="checkbox" checked={allFilteredSelected} onChange={handleSelectAll} className="rounded border-gray-300" />
                  </th>
                )}
                <th className="px-6 py-3 whitespace-nowrap">Part Number</th>
                <th className="px-6 py-3 whitespace-nowrap">Recorded Date</th>
                {activeLocations.map(loc => (
                  <th key={loc} className="px-6 py-3 text-right whitespace-nowrap">
                    <div>{loc}</div>
                    <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.2 rounded mt-0.5 normal-case ${
                      getWipUnit(loc) === 'Sheet'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                        : 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                    }`}>
                      {getWipUnit(loc)}
                    </span>
                  </th>
                ))}
                {isAdmin && <th className="px-6 py-3 text-center whitespace-nowrap">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loadingWIP ? (
                <tr><td colSpan={isAdmin ? activeLocations.length + 4 : activeLocations.length + 2} className="p-8 text-center">Loading WIP data...</td></tr>
              ) : wips.length === 0 ? (
                <tr><td colSpan={isAdmin ? activeLocations.length + 4 : activeLocations.length + 2} className="p-8 text-center text-muted-foreground">No active WIP recorded.</td></tr>
              ) : groupedWips.length === 0 ? (
                <tr><td colSpan={isAdmin ? activeLocations.length + 4 : activeLocations.length + 2} className="p-8 text-center text-muted-foreground">No matching WIP records found for current filters.</td></tr>
              ) : (
                groupedWips.map((group: any) => (
                  <tr key={group.id} className="hover:bg-muted/50 transition-colors">
                    {isAdmin && (
                      <td className="px-6 py-4 text-center">
                        <input 
                          type="checkbox" 
                          checked={group.ids.length > 0 && group.ids.every((id: string) => selectedIds.includes(id))} 
                          onChange={(e) => {
                            if (e.target.checked) {
                              const newIds = new Set([...selectedIds, ...group.ids]);
                              setSelectedIds(Array.from(newIds));
                            } else {
                              setSelectedIds(selectedIds.filter(id => !group.ids.includes(id)));
                            }
                          }} 
                          className="rounded border-gray-300"
                        />
                      </td>
                    )}
                    <td className="px-6 py-4 font-medium whitespace-nowrap">{group.itemCode}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">{group.recordedDate ? new Date(group.recordedDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</td>
                    {activeLocations.map(loc => (
                      <td key={loc} className="px-6 py-4 text-right font-medium">
                        {group.locations[loc]?.quantity > 0 ? (
                          <span className="text-amber-600 dark:text-amber-500">{group.locations[loc].quantity}</span>
                        ) : (
                          <span className="text-muted-foreground/30">-</span>
                        )}
                      </td>
                    ))}
                    {isAdmin && (
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => {
                               if (!confirm('Are you sure you want to delete all WIP records for this Part Number?')) return;
                               bulkDeleteWIP.mutateAsync({ ids: group.ids }).catch(err => alert(err.message || 'Failed to delete'));
                            }}
                            className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-md transition-colors"
                            title="Delete All WIP for this Part Number"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}

      {showImportModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card text-card-foreground border rounded-lg shadow-lg max-w-5xl w-full max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-xl font-bold flex items-center gap-2"><Upload size={20} /> Import WIP Data</h3>
              <button onClick={() => setShowImportModal(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            
            <div className="p-6 flex-1 overflow-auto space-y-4">
              <div className="flex items-center gap-4">
                <input 
                  type="file" 
                  accept=".xlsx, .xls, .csv" 
                  onChange={handleFileUpload} 
                  className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                />
              </div>

              {importData.length > 0 && (
                <>
                  <div className="flex justify-between items-center bg-muted/30 p-3 rounded-md">
                    <span className="font-medium text-sm">{importData.length} records loaded</span>
                    <div className="relative w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                      <input 
                        type="text" 
                        placeholder="Search loaded data..." 
                        className="w-full h-9 pl-9 pr-4 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                        value={importSearch}
                        onChange={e => setImportSearch(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="border rounded-md overflow-hidden max-h-[50vh] overflow-y-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-muted text-muted-foreground text-xs uppercase font-medium sticky top-0 shadow-sm">
                        <tr>
                          <th className="px-4 py-3">Part Number</th>
                          <th className="px-4 py-3">Location / Line</th>
                          <th className="px-4 py-3 text-right">Quantity</th>
                          <th className="px-4 py-3 text-center w-20">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {importData.filter(d => d.itemCode.toLowerCase().includes(importSearch.toLowerCase()) || d.location.toLowerCase().includes(importSearch.toLowerCase())).map((row) => (
                          <tr key={row.id} className="hover:bg-muted/50">
                            <td className="px-4 py-2 font-medium">{row.itemCode}</td>
                            <td className="px-4 py-2"><span className="bg-secondary px-2 py-1 rounded text-xs">{row.location}</span></td>
                            <td className="px-4 py-2 text-right">
                              <input 
                                type="number" 
                                className="w-24 h-8 px-2 border rounded text-right bg-background"
                                value={row.quantity}
                                onChange={e => {
                                  const newData = [...importData];
                                  const targetIndex = importData.findIndex(r => r.id === row.id);
                                  newData[targetIndex].quantity = Number(e.target.value);
                                  setImportData(newData);
                                }}
                              />
                            </td>
                            <td className="px-4 py-2 text-center">
                              <button 
                                onClick={() => setImportData(importData.filter(r => r.id !== row.id))}
                                className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-md transition-colors title='Delete Record'"
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
            
            <div className="p-6 border-t flex justify-end gap-3 bg-muted/10">
              <button 
                onClick={() => setShowImportModal(false)}
                className="h-10 border px-6 rounded-md font-medium hover:bg-muted text-sm"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleBulkSubmit('add')} 
                disabled={bulkUpsertWIP.isPending || importData.length === 0} 
                className="h-10 bg-green-600 hover:bg-green-700 text-white px-6 rounded-md font-medium flex items-center gap-2 disabled:opacity-50 text-sm"
              >
                <Plus size={16} /> {bulkUpsertWIP.isPending ? 'Saving...' : 'Save (Add)'}
              </button>
              <button 
                onClick={() => handleBulkSubmit('overwrite')} 
                disabled={bulkUpsertWIP.isPending || importData.length === 0} 
                className="h-10 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white px-6 rounded-md font-medium flex items-center gap-2 disabled:opacity-50 text-sm"
              >
                <Save size={16} /> {bulkUpsertWIP.isPending ? 'Saving...' : 'Save Overwrite'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
