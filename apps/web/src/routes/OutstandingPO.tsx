import { useState, useRef, useMemo, Fragment } from 'react';
import {
  useOutstandingPO,
  useUploadOutstandingPO,
  useAddManualOutstandingPO,
  useUpdateOutstandingPO,
  useDeleteOutstandingPO,
  useBulkDeleteOutstandingPO,
  useImportOutstandingPO,
  type OutstandingPOData
} from '../hooks/useOutstandingPO';
import { FileSpreadsheet, Plus, Upload, Loader2, Search, Pencil, Trash2, X, Check, Save, Folder, ArrowLeft, ChevronDown, ChevronRight, ChevronsDown, ChevronsUp } from 'lucide-react';
import { format } from 'date-fns';

export function OutstandingPO() {
  const { data: poData, isLoading } = useOutstandingPO();
  const uploadMutation = useUploadOutstandingPO();
  const importMutation = useImportOutstandingPO();
  const addManualMutation = useAddManualOutstandingPO();
  const updateMutation = useUpdateOutstandingPO();
  const deleteMutation = useDeleteOutstandingPO();
  const bulkDeleteMutation = useBulkDeleteOutstandingPO();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [previewData, setPreviewData] = useState<Omit<OutstandingPOData, 'id' | 'createdAt' | 'updatedAt'>[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewSearchTerm, setPreviewSearchTerm] = useState('');
  const [previewEditingIndex, setPreviewEditingIndex] = useState<number | null>(null);
  const [previewEditForm, setPreviewEditForm] = useState({
    supplierName: '',
    itemDesc: '',
    qtyOrder: '',
    qtyOrderUnit: 'kg',
    qtyDelivered: '',
    qtyDeliveredUnit: 'kg',
  });

  const [isManualOpen, setIsManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    planReceivedDate: format(new Date(), 'yyyy-MM-dd'),
    supplierName: '',
    itemDesc: '',
    qtyOrder: '',
    qtyOrderUnit: 'kg',
    qtyDelivered: '',
    qtyDeliveredUnit: 'kg',
  });
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    planReceivedDate: '',
    supplierName: '',
    itemDesc: '',
    qtyOrder: '',
    qtyOrderUnit: 'kg',
    qtyDelivered: '',
    qtyDeliveredUnit: 'kg',
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [expandedItemDescs, setExpandedItemDescs] = useState<Set<string>>(new Set());

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    uploadMutation.mutate(file, {
      onSuccess: (res) => {
        if (res.data && res.data.length > 0) {
          setPreviewData(res.data);
        } else {
          alert('No valid data found in file.');
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
      onError: (error: any) => {
        alert(`Failed to upload file: ${error.message}`);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    });
  };

  const handleSaveImport = (mode: 'add' | 'overwrite') => {
    if (previewData.length === 0) return;
    
    let confirmMsg = 'Are you sure you want to add this data?';
    if (mode === 'overwrite') {
      confirmMsg = 'WARNING: This will delete ALL existing outstanding PO data and replace it with the uploaded data. Continue?';
    }

    if (!window.confirm(confirmMsg)) return;

    importMutation.mutate({ data: previewData, mode }, {
      onSuccess: () => {
        alert('Data imported successfully!');
        setPreviewData([]);
        setPreviewSearchTerm('');
        setPreviewEditingIndex(null);
      },
      onError: (error: any) => {
        alert(`Failed to import data: ${error.message}`);
      }
    });
  };

  const handlePreviewEditClick = (index: number, record: Omit<OutstandingPOData, 'id' | 'createdAt' | 'updatedAt'>) => {
    setPreviewEditingIndex(index);
    setPreviewEditForm({
      supplierName: record.supplierName,
      itemDesc: record.itemDesc,
      qtyOrder: record.qtyOrder.toString(),
      qtyOrderUnit: record.qtyOrderUnit,
      qtyDelivered: record.qtyDelivered.toString(),
      qtyDeliveredUnit: record.qtyDeliveredUnit,
    });
  };

  const handlePreviewSaveEdit = (index: number) => {
    if (!previewEditForm.supplierName || !previewEditForm.itemDesc || !previewEditForm.qtyOrder || !previewEditForm.qtyDelivered) {
      alert('Please fill all required fields');
      return;
    }
    const updatedData = [...previewData];
    updatedData[index] = {
      ...updatedData[index],
      supplierName: previewEditForm.supplierName,
      itemDesc: previewEditForm.itemDesc,
      qtyOrder: parseFloat(previewEditForm.qtyOrder),
      qtyOrderUnit: previewEditForm.qtyOrderUnit,
      qtyDelivered: parseFloat(previewEditForm.qtyDelivered),
      qtyDeliveredUnit: previewEditForm.qtyDeliveredUnit,
    };
    setPreviewData(updatedData);
    setPreviewEditingIndex(null);
  };

  const handlePreviewDelete = (index: number) => {
    if (window.confirm('Are you sure you want to remove this record from the preview?')) {
      const updatedData = [...previewData];
      updatedData.splice(index, 1);
      setPreviewData(updatedData);
      if (previewEditingIndex === index) setPreviewEditingIndex(null);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.planReceivedDate || !manualForm.supplierName || !manualForm.itemDesc || !manualForm.qtyOrder || !manualForm.qtyDelivered) {
      alert('Please fill all required fields');
      return;
    }

    addManualMutation.mutate({
      planReceivedDate: manualForm.planReceivedDate,
      supplierName: manualForm.supplierName,
      itemDesc: manualForm.itemDesc,
      qtyOrder: parseFloat(manualForm.qtyOrder),
      qtyOrderUnit: manualForm.qtyOrderUnit,
      qtyDelivered: parseFloat(manualForm.qtyDelivered),
      qtyDeliveredUnit: manualForm.qtyDeliveredUnit,
    }, {
      onSuccess: () => {
        setManualForm({
          planReceivedDate: format(new Date(), 'yyyy-MM-dd'),
          supplierName: '',
          itemDesc: '',
          qtyOrder: '',
          qtyOrderUnit: 'kg',
          qtyDelivered: '',
          qtyDeliveredUnit: 'kg',
        });
        setIsManualOpen(false);
      },
      onError: (error: any) => {
        alert(`Failed to add record: ${error.message}`);
      }
    });
  };

  const handleEditClick = (record: OutstandingPOData) => {
    setEditingId(record.id);
    setEditForm({
      planReceivedDate: format(new Date(record.planReceivedDate), 'yyyy-MM-dd'),
      supplierName: record.supplierName,
      itemDesc: record.itemDesc,
      qtyOrder: record.qtyOrder.toString(),
      qtyOrderUnit: record.qtyOrderUnit,
      qtyDelivered: record.qtyDelivered.toString(),
      qtyDeliveredUnit: record.qtyDeliveredUnit,
    });
  };

  const handleSaveEdit = (id: string) => {
    if (!editForm.planReceivedDate || !editForm.supplierName || !editForm.itemDesc || !editForm.qtyOrder || !editForm.qtyDelivered) {
      alert('Please fill all required fields');
      return;
    }

    updateMutation.mutate({
      id,
      data: {
        planReceivedDate: editForm.planReceivedDate,
        supplierName: editForm.supplierName,
        itemDesc: editForm.itemDesc,
        qtyOrder: parseFloat(editForm.qtyOrder),
        qtyOrderUnit: editForm.qtyOrderUnit,
        qtyDelivered: parseFloat(editForm.qtyDelivered),
        qtyDeliveredUnit: editForm.qtyDeliveredUnit,
      }
    }, {
      onSuccess: () => setEditingId(null),
      onError: (error: any) => alert(`Failed to update record: ${error.message}`)
    });
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this record?')) {
      deleteMutation.mutate(id, {
        onError: (error: any) => alert(`Failed to delete record: ${error.message}`)
      });
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelectedIds(filteredRecords.map((r) => r.id));
    else setSelectedIds([]);
  };

  const handleSelectOne = (e: React.ChangeEvent<HTMLInputElement>, id: string) => {
    if (e.target.checked) setSelectedIds([...selectedIds, id]);
    else setSelectedIds(selectedIds.filter((s) => s !== id));
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    if (window.confirm(`Are you sure you want to delete ${selectedIds.length} records?`)) {
      bulkDeleteMutation.mutate(selectedIds, {
        onSuccess: () => setSelectedIds([]),
        onError: (error: any) => alert(`Failed to delete records: ${error.message}`)
      });
    }
  };

  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const records = poData || [];
  
  const groupedMonths = useMemo(() => {
    const groups: Record<string, OutstandingPOData[]> = {};
    records.forEach(record => {
      const monthKey = format(new Date(record.planReceivedDate), 'yyyy-MM');
      if (!groups[monthKey]) groups[monthKey] = [];
      groups[monthKey].push(record);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [records]);

  const currentMonthRecords = selectedMonth
    ? selectedMonth === 'ALL'
      ? records
      : (groupedMonths.find(g => g[0] === selectedMonth)?.[1] || [])
    : [];

  const filteredRecords = currentMonthRecords.filter(record => 
    record.itemDesc.toLowerCase().includes(searchTerm.toLowerCase()) || 
    record.supplierName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const groupedByItem = useMemo(() => {
    const groups: Record<string, {
      itemDesc: string;
      supplierNames: string;
      qtyOrderUnit: string;
      qtyDeliveredUnit: string;
      totalQtyOrder: number;
      totalQtyDelivered: number;
      items: OutstandingPOData[];
    }> = {};

    filteredRecords.forEach((record) => {
      const key = record.itemDesc.trim();
      if (!groups[key]) {
        groups[key] = {
          itemDesc: record.itemDesc,
          supplierNames: record.supplierName || '',
          qtyOrderUnit: record.qtyOrderUnit || 'kg',
          qtyDeliveredUnit: record.qtyDeliveredUnit || 'kg',
          totalQtyOrder: 0,
          totalQtyDelivered: 0,
          items: [],
        };
      }
      groups[key].totalQtyOrder += record.qtyOrder;
      groups[key].totalQtyDelivered += record.qtyDelivered;
      groups[key].items.push(record);

      if (record.supplierName) {
        const currentSuppliers = groups[key].supplierNames.split(', ').filter(Boolean);
        if (!currentSuppliers.includes(record.supplierName)) {
          groups[key].supplierNames = currentSuppliers.length > 0
            ? `${groups[key].supplierNames}, ${record.supplierName}`
            : record.supplierName;
        }
      }
    });

    return Object.values(groups).sort((a, b) => a.itemDesc.localeCompare(b.itemDesc));
  }, [filteredRecords]);

  const toggleExpand = (itemDesc: string) => {
    setExpandedItemDescs(prev => {
      const next = new Set(prev);
      if (next.has(itemDesc)) {
        next.delete(itemDesc);
      } else {
        next.add(itemDesc);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedItemDescs(new Set(groupedByItem.map(g => g.itemDesc)));
  };

  const collapseAll = () => {
    setExpandedItemDescs(new Set());
  };

  const handleToggleGroupSelect = (groupItems: OutstandingPOData[]) => {
    const groupIds = groupItems.map(i => i.id);
    const allSelected = groupIds.every(id => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !groupIds.includes(id)));
    } else {
      const newIds = new Set([...selectedIds, ...groupIds]);
      setSelectedIds(Array.from(newIds));
    }
  };

  const filteredPreviewData = previewData.filter(record => 
    record.itemDesc.toLowerCase().includes(previewSearchTerm.toLowerCase()) ||
    record.supplierName.toLowerCase().includes(previewSearchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Outstanding PO</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage outstanding PO data. Upload from Excel or add manually.
          </p>
        </div>
        
        <div className="flex gap-2">
          <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx, .xls, .xlsm" onChange={handleFileUpload} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending || previewData.length > 0}
            className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md font-medium text-sm transition-colors"
          >
            {uploadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Import Excel
          </button>
          
          <button
            onClick={() => setIsManualOpen(!isManualOpen)}
            disabled={previewData.length > 0}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md font-medium text-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Manual
          </button>
        </div>
      </div>

      {previewData.length > 0 ? (
        <div className="bg-card border border-primary/20 rounded-lg shadow-md overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
          <div className="p-5 border-b bg-primary/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-primary flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5" /> Data Preview
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                You are about to import <strong>{previewData.length}</strong> records. Please review the data below and choose how to save.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative w-full sm:w-64 mr-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <input type="text" placeholder="Search preview..." className="w-full pl-9 pr-4 py-1.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary" value={previewSearchTerm} onChange={(e) => setPreviewSearchTerm(e.target.value)} />
              </div>
              <button onClick={() => handleSaveImport('add')} disabled={importMutation.isPending} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-md font-medium text-sm">
                {importMutation.isPending && importMutation.variables?.mode === 'add' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save (Add)
              </button>
              <button onClick={() => handleSaveImport('overwrite')} disabled={importMutation.isPending} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-md font-medium text-sm">
                {importMutation.isPending && importMutation.variables?.mode === 'overwrite' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save (Overwrite)
              </button>
              <button onClick={() => setPreviewData([])} disabled={importMutation.isPending} className="flex items-center gap-2 px-4 py-2 bg-muted text-muted-foreground hover:bg-muted/80 rounded-md font-medium text-sm">
                <X className="w-4 h-4" /> Cancel
              </button>
            </div>
          </div>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-6 py-4 font-semibold">Plan Date</th>
                  <th className="px-6 py-4 font-semibold">Supplier</th>
                  <th className="px-6 py-4 font-semibold w-1/4">Item Desc</th>
                  <th className="px-6 py-4 font-semibold text-right">Qty Order</th>
                  <th className="px-6 py-4 font-semibold text-center">Unit</th>
                  <th className="px-6 py-4 font-semibold text-right">Qty Delivered</th>
                  <th className="px-6 py-4 font-semibold text-center">Unit</th>
                  <th className="px-6 py-4 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredPreviewData.length === 0 ? (
                   <tr><td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">No matching data found in preview.</td></tr>
                ) : filteredPreviewData.map((record) => {
                  const originalIndex = previewData.indexOf(record);
                  return (
                    <tr key={originalIndex} className="hover:bg-muted/30">
                      <td className="px-6 py-3 font-medium whitespace-nowrap">{format(new Date(record.planReceivedDate), 'dd MMM yyyy')}</td>
                      {previewEditingIndex === originalIndex ? (
                        <>
                          <td className="px-6 py-3"><input type="text" className="w-full h-8 px-2 border rounded text-sm" value={previewEditForm.supplierName} onChange={(e) => setPreviewEditForm({ ...previewEditForm, supplierName: e.target.value })} /></td>
                          <td className="px-6 py-3"><input type="text" className="w-full h-8 px-2 border rounded text-sm" value={previewEditForm.itemDesc} onChange={(e) => setPreviewEditForm({ ...previewEditForm, itemDesc: e.target.value })} /></td>
                          <td className="px-6 py-3"><input type="number" step="any" className="w-full h-8 px-2 border rounded text-sm text-right" value={previewEditForm.qtyOrder} onChange={(e) => setPreviewEditForm({ ...previewEditForm, qtyOrder: e.target.value })} /></td>
                          <td className="px-6 py-3">
                            <select className="w-full h-8 px-2 border rounded text-sm" value={previewEditForm.qtyOrderUnit} onChange={(e) => setPreviewEditForm({ ...previewEditForm, qtyOrderUnit: e.target.value })}>
                              <option value="kg">kg</option>
                              <option value="rim">rim</option>
                              <option value="sheets">sheets</option>
                            </select>
                          </td>
                          <td className="px-6 py-3"><input type="number" step="any" className="w-full h-8 px-2 border rounded text-sm text-right" value={previewEditForm.qtyDelivered} onChange={(e) => setPreviewEditForm({ ...previewEditForm, qtyDelivered: e.target.value })} /></td>
                          <td className="px-6 py-3">
                            <select className="w-full h-8 px-2 border rounded text-sm" value={previewEditForm.qtyDeliveredUnit} onChange={(e) => setPreviewEditForm({ ...previewEditForm, qtyDeliveredUnit: e.target.value })}>
                              <option value="kg">kg</option>
                              <option value="rim">rim</option>
                              <option value="sheets">sheets</option>
                            </select>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => handlePreviewSaveEdit(originalIndex)} className="p-1.5 text-green-600 hover:bg-green-50 rounded">
                                <Check className="w-4 h-4" />
                              </button>
                              <button onClick={() => setPreviewEditingIndex(null)} className="p-1.5 text-muted-foreground hover:bg-muted rounded"><X className="w-4 h-4" /></button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-6 py-3">{record.supplierName}</td>
                          <td className="px-6 py-3 font-semibold text-foreground">{record.itemDesc}</td>
                          <td className="px-6 py-3 text-right font-bold">{record.qtyOrder}</td>
                          <td className="px-6 py-3 text-center"><span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs">{record.qtyOrderUnit}</span></td>
                          <td className="px-6 py-3 text-right font-bold">{record.qtyDelivered}</td>
                          <td className="px-6 py-3 text-center"><span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs">{record.qtyDeliveredUnit}</span></td>
                          <td className="px-6 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => handlePreviewEditClick(originalIndex, record)} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded"><Pencil className="w-4 h-4" /></button>
                              <button onClick={() => handlePreviewDelete(originalIndex)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <>
          {isManualOpen && (
            <div className="bg-card border rounded-lg p-5 shadow-sm animate-in slide-in-from-top-2">
              <h2 className="text-sm font-semibold mb-4">Add Outstanding PO Manual</h2>
              <form onSubmit={handleManualSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                <div className="space-y-1.5 md:col-span-3">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Plan Received Date</label>
                  <input type="date" className="w-full h-10 px-3 border rounded-md text-sm" value={manualForm.planReceivedDate} onChange={(e) => setManualForm({ ...manualForm, planReceivedDate: e.target.value })} required />
                </div>
                <div className="space-y-1.5 md:col-span-4">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Supplier</label>
                  <input type="text" className="w-full h-10 px-3 border rounded-md text-sm" placeholder="Supplier Name" value={manualForm.supplierName} onChange={(e) => setManualForm({ ...manualForm, supplierName: e.target.value })} required />
                </div>
                <div className="space-y-1.5 md:col-span-5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Item Desc</label>
                  <input type="text" className="w-full h-10 px-3 border rounded-md text-sm" placeholder="Item Description" value={manualForm.itemDesc} onChange={(e) => setManualForm({ ...manualForm, itemDesc: e.target.value })} required />
                </div>

                <div className="space-y-1.5 md:col-span-3">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Qty Order</label>
                  <input type="number" step="any" className="w-full h-10 px-3 border rounded-md text-sm" placeholder="0" value={manualForm.qtyOrder} onChange={(e) => setManualForm({ ...manualForm, qtyOrder: e.target.value })} required />
                </div>
                <div className="space-y-1.5 md:col-span-3">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Order Unit</label>
                  <select className="w-full h-10 px-3 border rounded-md text-sm" value={manualForm.qtyOrderUnit} onChange={(e) => setManualForm({ ...manualForm, qtyOrderUnit: e.target.value })}>
                    <option value="kg">kg</option>
                    <option value="rim">rim</option>
                    <option value="sheets">sheets</option>
                  </select>
                </div>
                <div className="space-y-1.5 md:col-span-3">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Qty Delivered</label>
                  <input type="number" step="any" className="w-full h-10 px-3 border rounded-md text-sm" placeholder="0" value={manualForm.qtyDelivered} onChange={(e) => setManualForm({ ...manualForm, qtyDelivered: e.target.value })} required />
                </div>
                <div className="space-y-1.5 md:col-span-3">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Delivered Unit</label>
                  <select className="w-full h-10 px-3 border rounded-md text-sm" value={manualForm.qtyDeliveredUnit} onChange={(e) => setManualForm({ ...manualForm, qtyDeliveredUnit: e.target.value })}>
                    <option value="kg">kg</option>
                    <option value="rim">rim</option>
                    <option value="sheets">sheets</option>
                  </select>
                </div>
                
                <div className="flex gap-2 md:col-span-12 justify-end mt-2">
                  <button type="button" onClick={() => setIsManualOpen(false)} className="h-10 px-4 bg-muted text-muted-foreground rounded-md font-medium text-sm">Cancel</button>
                  <button type="submit" disabled={addManualMutation.isPending} className="h-10 px-6 bg-primary text-primary-foreground rounded-md font-medium text-sm flex items-center justify-center gap-2">
                    {addManualMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Save
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Folder View or Data Table */}
          {!selectedMonth ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-in fade-in zoom-in-95 duration-200">
              {groupedMonths.length === 0 && !isLoading && (
                <div className="col-span-full py-12 text-center text-muted-foreground border rounded-lg bg-card">
                  <FileSpreadsheet className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-base font-semibold">Tidak ada data Outstanding PO</p>
                  <p className="text-sm mt-1">Upload excel atau isi manual untuk menambahkan data.</p>
                </div>
              )}
              {records.length > 0 && (
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
                    <p className="text-xs text-muted-foreground mt-0.5">{records.length} Items (Total)</p>
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
          <div className="bg-card border rounded-lg shadow-sm overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="p-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-muted/20">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button 
                  onClick={() => setSelectedMonth(null)}
                  className="p-2 hover:bg-background rounded-md border text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  title="Kembali ke Folder"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <input type="text" placeholder={selectedMonth === 'ALL' ? 'Cari di semua data...' : `Cari di ${format(new Date(selectedMonth + '-01'), 'MMM yyyy')}...`} className="w-full pl-9 pr-4 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                <div className="flex items-center gap-1 bg-background border rounded-md p-0.5 text-xs text-muted-foreground">
                  <button onClick={expandAll} className="px-2 py-1 hover:bg-muted hover:text-foreground rounded flex items-center gap-1 transition-colors" title="Buka Semua Detail">
                    <ChevronsDown className="w-3.5 h-3.5" /> Buka
                  </button>
                  <span className="text-muted-foreground/30">|</span>
                  <button onClick={collapseAll} className="px-2 py-1 hover:bg-muted hover:text-foreground rounded flex items-center gap-1 transition-colors" title="Tutup Semua Detail">
                    <ChevronsUp className="w-3.5 h-3.5" /> Tutup
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {selectedIds.length > 0 && (
                  <button onClick={handleBulkDelete} disabled={bulkDeleteMutation.isPending} className="flex items-center gap-2 px-3 py-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-md font-medium text-sm animate-in fade-in">
                    {bulkDeleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete ({selectedIds.length})
                  </button>
                )}
                <div className="text-sm font-medium text-muted-foreground bg-background px-3 py-1.5 border rounded-md flex items-center gap-2">
                  <span>{groupedByItem.length} Items</span>
                  <span className="text-muted-foreground/40">•</span>
                  <span>{filteredRecords.length} POs</span>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-secondary/50">
                  <tr>
                    <th className="px-4 py-4 w-12 text-center">
                      <input type="checkbox" className="rounded border-gray-300 w-4 h-4" checked={filteredRecords.length > 0 && selectedIds.length === filteredRecords.length} onChange={handleSelectAll} />
                    </th>
                    <th className="px-6 py-4 font-semibold">Plan Date</th>
                    <th className="px-6 py-4 font-semibold">Supplier</th>
                    <th className="px-6 py-4 font-semibold w-1/4">Item Desc</th>
                    <th className="px-6 py-4 font-semibold text-right">Qty Order</th>
                    <th className="px-6 py-4 font-semibold text-center">Unit</th>
                    <th className="px-6 py-4 font-semibold text-right">Qty Delivered</th>
                    <th className="px-6 py-4 font-semibold text-center">Unit</th>
                    <th className="px-6 py-4 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {isLoading ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-12 text-center text-muted-foreground">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                        <p className="mt-2 text-sm font-medium">Memuat data...</p>
                      </td>
                    </tr>
                  ) : groupedByItem.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-12 text-center text-muted-foreground">
                        <FileSpreadsheet className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
                        <p className="text-base font-semibold">Tidak ada data Outstanding PO</p>
                      </td>
                    </tr>
                  ) : (
                    groupedByItem.map((group) => {
                      const isExpanded = expandedItemDescs.has(group.itemDesc);
                      const groupIds = group.items.map(i => i.id);
                      const isGroupAllSelected = groupIds.length > 0 && groupIds.every(id => selectedIds.includes(id));
                      const isGroupSomeSelected = groupIds.some(id => selectedIds.includes(id)) && !isGroupAllSelected;

                      return (
                        <Fragment key={group.itemDesc}>
                          {/* Parent Group Row */}
                          <tr className="hover:bg-muted/40 transition-colors bg-card font-medium border-b">
                            <td className="px-4 py-3.5 text-center">
                              <input
                                type="checkbox"
                                className="rounded border-gray-300 w-4 h-4"
                                checked={isGroupAllSelected}
                                ref={(el) => {
                                  if (el) el.indeterminate = isGroupSomeSelected;
                                }}
                                onChange={() => handleToggleGroupSelect(group.items)}
                              />
                            </td>
                            <td className="px-6 py-3.5 text-muted-foreground text-xs font-medium whitespace-nowrap">
                              {group.items.length === 1
                                ? format(new Date(group.items[0].planReceivedDate), 'dd MMM yyyy')
                                : `${group.items.length} Plan Dates`}
                            </td>
                            <td className="px-6 py-3.5 text-muted-foreground text-xs">{group.supplierNames || '-'}</td>
                            <td className="px-6 py-3.5">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => toggleExpand(group.itemDesc)}
                                  className="p-1 hover:bg-muted/80 rounded transition-colors text-muted-foreground hover:text-foreground shrink-0"
                                  title={isExpanded ? 'Tutup Detail' : 'Buka Detail'}
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="w-4 h-4 text-primary" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4" />
                                  )}
                                </button>
                                <span className="font-bold text-foreground cursor-pointer hover:text-primary transition-colors" onClick={() => toggleExpand(group.itemDesc)}>
                                  {group.itemDesc}
                                </span>
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                                  {group.items.length} {group.items.length > 1 ? 'POs' : 'PO'}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-3.5 text-right font-extrabold text-foreground text-sm">
                              {group.totalQtyOrder.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 })}
                            </td>
                            <td className="px-6 py-3.5 text-center">
                              <span className="bg-primary/10 text-primary font-semibold px-2.5 py-1 rounded text-xs">
                                {group.qtyOrderUnit}
                              </span>
                            </td>
                            <td className="px-6 py-3.5 text-right font-extrabold text-foreground text-sm">
                              {group.totalQtyDelivered.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 })}
                            </td>
                            <td className="px-6 py-3.5 text-center">
                              <span className="bg-primary/10 text-primary font-semibold px-2.5 py-1 rounded text-xs">
                                {group.qtyDeliveredUnit}
                              </span>
                            </td>
                            <td className="px-6 py-3.5 text-right">
                              <button
                                onClick={() => toggleExpand(group.itemDesc)}
                                className="text-xs text-primary hover:text-primary/80 font-medium inline-flex items-center gap-1 p-1 hover:bg-primary/10 rounded transition-colors"
                              >
                                {isExpanded ? 'Tutup' : 'Detail'}
                                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                              </button>
                            </td>
                          </tr>

                          {/* Child Detailed Rows */}
                          {isExpanded &&
                            group.items.map((record, idx) => (
                              <tr
                                key={record.id}
                                className="bg-muted/20 hover:bg-muted/35 transition-colors border-l-4 border-l-primary/60"
                              >
                                <td className="px-4 py-2.5 text-center">
                                  <input
                                    type="checkbox"
                                    className="rounded border-gray-300 w-4 h-4"
                                    checked={selectedIds.includes(record.id)}
                                    onChange={(e) => handleSelectOne(e, record.id)}
                                  />
                                </td>
                                <td className="px-6 py-2.5 font-medium whitespace-nowrap text-xs text-foreground">
                                  {format(new Date(record.planReceivedDate), 'dd MMM yyyy')}
                                </td>
                                {editingId === record.id ? (
                                  <>
                                    <td className="px-6 py-2.5">
                                      <input
                                        type="text"
                                        className="w-full h-8 px-2 border rounded text-xs bg-background"
                                        value={editForm.supplierName}
                                        onChange={(e) => setEditForm({ ...editForm, supplierName: e.target.value })}
                                      />
                                    </td>
                                    <td className="px-6 py-2.5">
                                      <input
                                        type="text"
                                        className="w-full h-8 px-2 border rounded text-xs bg-background"
                                        value={editForm.itemDesc}
                                        onChange={(e) => setEditForm({ ...editForm, itemDesc: e.target.value })}
                                      />
                                    </td>
                                    <td className="px-6 py-2.5">
                                      <input
                                        type="number"
                                        step="any"
                                        className="w-full h-8 px-2 border rounded text-xs text-right bg-background"
                                        value={editForm.qtyOrder}
                                        onChange={(e) => setEditForm({ ...editForm, qtyOrder: e.target.value })}
                                      />
                                    </td>
                                    <td className="px-6 py-2.5">
                                      <select
                                        className="w-full h-8 px-2 border rounded text-xs bg-background"
                                        value={editForm.qtyOrderUnit}
                                        onChange={(e) => setEditForm({ ...editForm, qtyOrderUnit: e.target.value })}
                                      >
                                        <option value="kg">kg</option>
                                        <option value="rim">rim</option>
                                        <option value="sheets">sheets</option>
                                      </select>
                                    </td>
                                    <td className="px-6 py-2.5">
                                      <input
                                        type="number"
                                        step="any"
                                        className="w-full h-8 px-2 border rounded text-xs text-right bg-background"
                                        value={editForm.qtyDelivered}
                                        onChange={(e) => setEditForm({ ...editForm, qtyDelivered: e.target.value })}
                                      />
                                    </td>
                                    <td className="px-6 py-2.5">
                                      <select
                                        className="w-full h-8 px-2 border rounded text-xs bg-background"
                                        value={editForm.qtyDeliveredUnit}
                                        onChange={(e) => setEditForm({ ...editForm, qtyDeliveredUnit: e.target.value })}
                                      >
                                        <option value="kg">kg</option>
                                        <option value="rim">rim</option>
                                        <option value="sheets">sheets</option>
                                      </select>
                                    </td>
                                    <td className="px-6 py-2.5 text-right">
                                      <div className="flex items-center justify-end gap-1.5">
                                        <button
                                          onClick={() => handleSaveEdit(record.id)}
                                          disabled={updateMutation.isPending}
                                          className="p-1 text-green-600 hover:bg-green-50 rounded"
                                        >
                                          {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                        </button>
                                        <button
                                          onClick={() => setEditingId(null)}
                                          className="p-1 text-muted-foreground hover:bg-muted rounded"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td className="px-6 py-2.5 text-xs text-muted-foreground">{record.supplierName}</td>
                                    <td className="px-6 py-2.5">
                                      <div className="pl-6 text-xs text-muted-foreground flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0"></span>
                                        <span>PO #{idx + 1}</span>
                                      </div>
                                    </td>
                                    <td className="px-6 py-2.5 text-right text-xs font-bold text-foreground">
                                      {record.qtyOrder.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 })}
                                    </td>
                                    <td className="px-6 py-2.5 text-center text-xs text-muted-foreground">
                                      <span className="bg-secondary/60 text-secondary-foreground px-2 py-0.5 rounded text-[11px]">
                                        {record.qtyOrderUnit}
                                      </span>
                                    </td>
                                    <td className="px-6 py-2.5 text-right text-xs font-bold text-foreground">
                                      {record.qtyDelivered.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 })}
                                    </td>
                                    <td className="px-6 py-2.5 text-center text-xs text-muted-foreground">
                                      <span className="bg-secondary/60 text-secondary-foreground px-2 py-0.5 rounded text-[11px]">
                                        {record.qtyDeliveredUnit}
                                      </span>
                                    </td>
                                    <td className="px-6 py-2.5 text-right">
                                      <div className="flex items-center justify-end gap-1">
                                        <button
                                          onClick={() => handleEditClick(record)}
                                          className="p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors"
                                          title="Edit PO"
                                        >
                                          <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={() => handleDelete(record.id)}
                                          disabled={deleteMutation.isPending && deleteMutation.variables === record.id}
                                          className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                                          title="Hapus PO"
                                        >
                                          {deleteMutation.isPending && deleteMutation.variables === record.id ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin text-destructive" />
                                          ) : (
                                            <Trash2 className="w-3.5 h-3.5" />
                                          )}
                                        </button>
                                      </div>
                                    </td>
                                  </>
                                )}
                              </tr>
                            ))}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
