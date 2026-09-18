import React, { useState, useMemo } from 'react';
import { useItems, useCreateItem, useDeleteItem, useUpdateItem, useMasterCartons, useCreateMasterCarton, useUpdateMasterCarton, useDeleteMasterCarton } from '../hooks/useItems';
import { useWIPs } from '../hooks/useWIP';
import { SearchableSelect } from '../components/SearchableSelect';
import { Plus, Trash2, Pencil, Search, PackageOpen, Sliders, Scale, MapPin, Box, Tag, Layers } from 'lucide-react';

export function Items() {
  const { data, isLoading } = useItems();
  const { data: wipData } = useWIPs();
  
  const wips = wipData?.data || [];
  const items = data?.data || [];

  const activeLocations = useMemo(() => {
    return Array.from(new Set(wips.map((w: any) => w.location))).filter(Boolean) as string[];
  }, [wips]);

  const units = useMemo(() => {
    const activeUnits = Array.from(new Set(items.map((i: any) => i.unit))).filter(Boolean) as string[];
    const defaultUnits = ['pcs', 'kg', 'box', 'liters'];
    return activeUnits.length > 0 ? activeUnits : defaultUnits;
  }, [items]);

  const allLocations = useMemo(() => {
    const defaultLocations = ['Mesin-01', 'Mesin-02', 'Assembly Line', 'QC Station'];
    return activeLocations.length > 0 ? activeLocations : defaultLocations;
  }, [activeLocations]);

  const createItem = useCreateItem();
  const deleteItem = useDeleteItem();
  const updateItem = useUpdateItem();

  const [activeTab, setActiveTab] = useState<'items' | 'toy_names' | 'master_cartons' | 'units' | 'locations'>('items');
  const [search, setSearch] = useState('');

  // 1. Part Numbers / Master Items Form & Edit State
  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItem, setEditingItem] = useState<{ id: string; partNumber: string; itemName: string; unit: string } | null>(null);
  const [itemFormData, setItemFormData] = useState({ itemCode: '', itemName: '', unit: 'pcs' });

  // 1b. Toy Names Form & Edit State
  const [showToyForm, setShowToyForm] = useState(false);
  const [editingToy, setEditingToy] = useState<{ id: string; partNumber: string; itemName: string; unit: string } | null>(null);
  const [toyFormData, setToyFormData] = useState({ itemCode: '', itemName: '', unit: 'SET' });

  const itemUnitOptions = useMemo(() => {
    const opts = units.map(u => ({ value: u, label: u }));
    if (itemFormData.unit && !units.includes(itemFormData.unit)) {
      opts.push({ value: itemFormData.unit, label: itemFormData.unit });
    }
    return opts;
  }, [units, itemFormData.unit]);

  const toyUnitOptions = useMemo(() => {
    const opts = units.map(u => ({ value: u, label: u }));
    if (toyFormData.unit && !units.includes(toyFormData.unit)) {
      opts.push({ value: toyFormData.unit, label: toyFormData.unit });
    }
    return opts;
  }, [units, toyFormData.unit]);

  // 1c. Master Cartons Form & Edit State
  const { data: mcData } = useMasterCartons();
  const createMasterCarton = useCreateMasterCarton();
  const updateMasterCarton = useUpdateMasterCarton();
  const deleteMasterCarton = useDeleteMasterCarton();

  const [showMcForm, setShowMcForm] = useState(false);
  const [editingMc, setEditingMc] = useState<{ id: string; cartonCode: string; toyNameItemId: string; partNumberCode: string } | null>(null);
  const [mcFormData, setMcFormData] = useState({ cartonCode: '', toyNameItemId: '', partNumberCode: '' });

  // CRUD for Part Numbers & Toy Names
  
  // Filter items into Part Numbers (itemName === partNumber)
  const partNumbers = items.filter(item => item.partNumber === item.itemName);
  const filteredItems = partNumbers.filter(
    item => item.partNumber.toLowerCase().includes(search.toLowerCase())
  );

  // Filter items into Toy Names (itemName !== partNumber)
  const toyNames = items.filter(item => item.partNumber !== item.itemName);
  const filteredToyNames = toyNames.filter(
    item => item.itemName.toLowerCase().includes(search.toLowerCase()) ||
            item.partNumber.toLowerCase().includes(search.toLowerCase())
  );

  // Master Cartons
  const masterCartons = mcData?.data || [];
  const filteredMasterCartons = masterCartons.filter(
    mc => mc.cartonCode.toLowerCase().includes(search.toLowerCase()) ||
          mc.partNumberCode.toLowerCase().includes(search.toLowerCase())
  );

  const handleItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await updateItem.mutateAsync({
          id: editingItem.id,
          partNumber: itemFormData.itemCode,
          itemName: itemFormData.itemCode, // Keep them identical for Part Numbers
          unit: itemFormData.unit
        });
        setEditingItem(null);
      } else {
        await createItem.mutateAsync({
          partNumber: itemFormData.itemCode,
          itemName: itemFormData.itemCode, // Keep them identical for Part Numbers
          unit: itemFormData.unit
        });
      }
      setItemFormData({ itemCode: '', itemName: '', unit: units[0] || 'pcs' });
      setShowItemForm(false);
    } catch (err: any) {
      alert(err.message || 'Failed to save part number');
    }
  };

  const handleToySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingToy) {
        await updateItem.mutateAsync({
          id: editingToy.id,
          partNumber: toyFormData.itemCode,
          itemName: toyFormData.itemName,
          unit: toyFormData.unit
        });
        setEditingToy(null);
      } else {
        const randomCode = `PN-${Date.now().toString().slice(-5)}`;
        await createItem.mutateAsync({
          partNumber: toyFormData.itemCode || randomCode,
          itemName: toyFormData.itemName,
          unit: toyFormData.unit
        });
      }
      setToyFormData({ itemCode: '', itemName: '', unit: 'SET' });
      setShowToyForm(false);
    } catch (err: any) {
      alert(err.message || 'Failed to save toy name');
    }
  };

  const handleMcSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingMc) {
        await updateMasterCarton.mutateAsync({
          id: editingMc.id,
          cartonCode: mcFormData.cartonCode,
          toyNameItemId: mcFormData.toyNameItemId,
          partNumberCode: mcFormData.partNumberCode
        });
        setEditingMc(null);
      } else {
        await createMasterCarton.mutateAsync(mcFormData);
      }
      setMcFormData({ cartonCode: '', toyNameItemId: '', partNumberCode: '' });
      setShowMcForm(false);
    } catch (err: any) {
      alert(err.message || 'Failed to save master carton');
    }
  };

  const handleMcDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this master carton?')) {
      try {
        await deleteMasterCarton.mutateAsync(id);
      } catch (err: any) {
        alert(err.message || 'Failed to delete master carton');
      }
    }
  };

  const handleItemDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this part number?')) {
      try {
        await deleteItem.mutateAsync(id);
      } catch (err: any) {
        alert(err.message || 'Failed to delete item');
      }
    }
  };



  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading dropdown settings...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Sliders className="text-primary" size={24} /> Dropdown Management
        </h2>
        <p className="text-muted-foreground text-sm">Configure and manage dropdown options across the entire system catalog.</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border space-x-1 bg-muted/30 p-1 rounded-lg max-w-2xl overflow-x-auto">
        <button
          onClick={() => { setActiveTab('items'); setSearch(''); setEditingItem(null); setShowItemForm(false); }}
          className={`flex-shrink-0 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'items'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
          }`}
        >
          <Box size={16} />
          <span>Part Numbers</span>
        </button>
        <button
          onClick={() => { setActiveTab('toy_names'); setSearch(''); setEditingItem(null); setEditingToy(null); setShowToyForm(false); }}
          className={`flex-shrink-0 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'toy_names'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
          }`}
        >
          <Tag size={16} />
          <span>Toy Names</span>
        </button>
        <button
          onClick={() => { setActiveTab('master_cartons'); setSearch(''); setEditingItem(null); setEditingMc(null); setShowMcForm(false); }}
          className={`flex-shrink-0 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'master_cartons'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
          }`}
        >
          <Layers size={16} />
          <span>Master Cartons</span>
        </button>
        <button
          onClick={() => { setActiveTab('units'); setSearch(''); setEditingItem(null); }}
          className={`flex-shrink-0 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'units'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
          }`}
        >
          <Scale size={16} />
          <span>Measurement Units</span>
        </button>
        <button
          onClick={() => { setActiveTab('locations'); setSearch(''); setEditingItem(null); }}
          className={`flex-shrink-0 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'locations'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
          }`}
        >
          <MapPin size={16} />
          <span>WIP Locations</span>
        </button>
      </div>

      {/* Tab Contents: 1. Part Numbers (Items) */}
      {activeTab === 'items' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-lg">Part Numbers / Master Catalog</h3>
            <button 
              onClick={() => {
                setShowItemForm(!showItemForm);
                setEditingItem(null);
                setItemFormData({ itemCode: '', itemName: '', unit: units[0] || 'pcs' });
              }}
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md font-medium text-sm flex items-center space-x-2"
            >
              <Plus size={16} />
              <span>Add New Part</span>
            </button>
          </div>

          {showItemForm && (
            <div className="bg-card text-card-foreground border rounded-lg p-6 shadow-sm">
              <h4 className="font-semibold mb-4">{editingItem ? 'Edit Catalog Item' : 'Create New Catalog Item'}</h4>
              <form onSubmit={handleItemSubmit} className="flex flex-wrap items-end gap-4">
                <div className="flex-1 min-w-[200px] space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Item Code / Part Number</label>
                  <input 
                    type="text" 
                    required
                    className="w-full h-10 px-3 py-2 border rounded-md"
                    value={itemFormData.itemCode}
                    onChange={e => setItemFormData({...itemFormData, itemCode: e.target.value})}
                    placeholder="e.g. PROD-F006"
                  />
                </div>
                <div className="flex-1 min-w-[250px] space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Item Name</label>
                  <input 
                    type="text" 
                    required
                    className="w-full h-10 px-3 py-2 border rounded-md"
                    value={itemFormData.itemName}
                    onChange={e => setItemFormData({...itemFormData, itemName: e.target.value})}
                    placeholder="e.g. Component X"
                  />
                </div>
                <div className="w-48 space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Unit</label>
                  <SearchableSelect
                    options={itemUnitOptions}
                    value={itemFormData.unit}
                    onChange={val => setItemFormData({ ...itemFormData, unit: val })}
                    onAdd={newUnitVal => {
                      setItemFormData({ ...itemFormData, unit: newUnitVal });
                    }}
                    placeholder="Select or type unit..."
                  />
                </div>
                <button 
                  type="submit" 
                  disabled={createItem.isPending || updateItem.isPending}
                  className="h-10 bg-primary text-primary-foreground hover:bg-primary/90 px-4 rounded-md font-medium disabled:opacity-50 text-sm"
                >
                  {createItem.isPending || updateItem.isPending ? 'Saving...' : editingItem ? 'Update Item' : 'Save Item'}
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    setShowItemForm(false);
                    setEditingItem(null);
                    setItemFormData({ itemCode: '', itemName: '', unit: units[0] || 'pcs' });
                  }}
                  className="h-10 border hover:bg-secondary px-4 rounded-md font-medium text-sm"
                >
                  Cancel
                </button>
              </form>
            </div>
          )}

          <div className="bg-card text-card-foreground border rounded-lg shadow-sm overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between bg-secondary/30">
              <div className="relative w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <input 
                  type="text" 
                  placeholder="Search parts..." 
                  className="w-full h-9 pl-9 pr-4 text-sm border rounded-md bg-background"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <div className="text-sm text-muted-foreground">
                Total: {filteredItems.length} parts
              </div>
            </div>

            {filteredItems.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center text-muted-foreground">
                <PackageOpen size={48} className="mb-4 opacity-20" />
                <p>No catalog parts found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-secondary/50 text-muted-foreground uppercase text-xs font-medium">
                    <tr>
                      <th className="px-6 py-3 w-16">No</th>
                      <th className="px-6 py-3">Part Number</th>
                      <th className="px-6 py-3">Item Name</th>
                      <th className="px-6 py-3">Unit</th>
                      <th className="px-6 py-3 w-24 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredItems.map((item, index) => (
                      <tr key={item.id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-6 py-4">{index + 1}</td>
                        <td className="px-6 py-4 font-medium">{item.partNumber}</td>
                        <td className="px-6 py-4">{item.itemName}</td>
                        <td className="px-6 py-4">
                          <span className="bg-secondary px-2 py-1 rounded text-xs">{item.unit}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setEditingItem(item);
                                setItemFormData({ itemCode: item.partNumber, itemName: item.itemName, unit: item.unit });
                                setShowItemForm(true);
                              }}
                              className="text-muted-foreground hover:text-primary p-1 rounded-md hover:bg-primary/10 transition-colors"
                              title="Edit part"
                            >
                              <Pencil size={16} />
                            </button>
                            <button 
                              onClick={() => handleItemDelete(item.id)}
                              disabled={deleteItem.isPending}
                              className="text-muted-foreground hover:text-destructive p-1 rounded-md hover:bg-destructive/10 transition-colors disabled:opacity-50"
                              title="Delete part"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab Contents: 1b. Toy Names */}
      {activeTab === 'toy_names' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-lg">Toy Names Catalog</h3>
            <button 
              onClick={() => {
                setShowToyForm(!showToyForm);
                setEditingToy(null);
                setToyFormData({ itemCode: '', itemName: '', unit: 'SET' });
              }}
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md font-medium text-sm flex items-center space-x-2"
            >
              <Plus size={16} />
              <span>Add Toy Name</span>
            </button>
          </div>

          {showToyForm && (
            <div className="bg-card text-card-foreground border rounded-lg p-6 shadow-sm">
              <h4 className="font-semibold mb-4">{editingToy ? 'Edit Toy Name' : 'Create New Toy Name'}</h4>
              <form onSubmit={handleToySubmit} className="flex flex-wrap items-end gap-4">
                <div className="flex-1 min-w-[200px] space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Toy Code (Optional, PN-XXXXX auto-generated)</label>
                  <input 
                    type="text" 
                    className="w-full h-10 px-3 py-2 border rounded-md bg-background"
                    value={toyFormData.itemCode}
                    onChange={e => setToyFormData({...toyFormData, itemCode: e.target.value})}
                    placeholder="e.g. PN-12345"
                  />
                </div>
                <div className="flex-1 min-w-[250px] space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Toy Name</label>
                  <input 
                    type="text" 
                    required
                    className="w-full h-10 px-3 py-2 border rounded-md bg-background"
                    value={toyFormData.itemName}
                    onChange={e => setToyFormData({...toyFormData, itemName: e.target.value})}
                    placeholder="e.g. Barbie Milan Edition"
                  />
                </div>
                <div className="w-48 space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Unit</label>
                  <SearchableSelect
                    options={toyUnitOptions}
                    value={toyFormData.unit}
                    onChange={val => setToyFormData({ ...toyFormData, unit: val })}
                    onAdd={newUnitVal => {
                      setToyFormData({ ...toyFormData, unit: newUnitVal });
                    }}
                    placeholder="Select or type unit..."
                  />
                </div>
                <button 
                  type="submit" 
                  disabled={createItem.isPending || updateItem.isPending}
                  className="h-10 bg-primary text-primary-foreground hover:bg-primary/90 px-4 rounded-md font-medium disabled:opacity-50 text-sm"
                >
                  {createItem.isPending || updateItem.isPending ? 'Saving...' : editingToy ? 'Update' : 'Save'}
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    setShowToyForm(false);
                    setEditingToy(null);
                    setToyFormData({ itemCode: '', itemName: '', unit: 'SET' });
                  }}
                  className="h-10 border hover:bg-secondary px-4 rounded-md font-medium text-sm"
                >
                  Cancel
                </button>
              </form>
            </div>
          )}

          <div className="bg-card text-card-foreground border rounded-lg shadow-sm overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between bg-secondary/30">
              <div className="relative w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <input 
                  type="text" 
                  placeholder="Search toys..." 
                  className="w-full h-9 pl-9 pr-4 text-sm border rounded-md bg-background"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <div className="text-sm text-muted-foreground">
                Total: {filteredToyNames.length} toys
              </div>
            </div>

            {filteredToyNames.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center text-muted-foreground">
                <PackageOpen size={48} className="mb-4 opacity-20" />
                <p>No toy names found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-secondary/50 text-muted-foreground uppercase text-xs font-medium">
                    <tr>
                      <th className="px-6 py-3 w-16">No</th>
                      <th className="px-6 py-3">Toy Code</th>
                      <th className="px-6 py-3">Toy Name</th>
                      <th className="px-6 py-3">Unit</th>
                      <th className="px-6 py-3 w-24 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredToyNames.map((item, index) => (
                      <tr key={item.id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-6 py-4">{index + 1}</td>
                        <td className="px-6 py-4 font-mono text-xs">{item.partNumber}</td>
                        <td className="px-6 py-4 font-medium">{item.itemName}</td>
                        <td className="px-6 py-4">
                          <span className="bg-secondary px-2 py-1 rounded text-xs">{item.unit}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setEditingToy(item);
                                setToyFormData({ itemCode: item.partNumber, itemName: item.itemName, unit: item.unit });
                                setShowToyForm(true);
                              }}
                              className="text-muted-foreground hover:text-primary p-1 rounded-md hover:bg-primary/10 transition-colors"
                              title="Edit toy name"
                            >
                              <Pencil size={16} />
                            </button>
                            <button 
                              onClick={() => handleItemDelete(item.id)}
                              disabled={deleteItem.isPending}
                              className="text-muted-foreground hover:text-destructive p-1 rounded-md hover:bg-destructive/10 transition-colors disabled:opacity-50"
                              title="Delete toy name"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab Contents: 1c. Master Cartons */}
      {activeTab === 'master_cartons' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-lg">Master Cartons mapping</h3>
            <button 
              onClick={() => {
                setShowMcForm(!showMcForm);
                setEditingMc(null);
                setMcFormData({ cartonCode: '', toyNameItemId: toyNames[0]?.id || '', partNumberCode: partNumbers[0]?.partNumber || '' });
              }}
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md font-medium text-sm flex items-center space-x-2"
            >
              <Plus size={16} />
              <span>Add Master Carton</span>
            </button>
          </div>

          {showMcForm && (
            <div className="bg-card text-card-foreground border rounded-lg p-6 shadow-sm">
              <h4 className="font-semibold mb-4">{editingMc ? 'Edit Master Carton' : 'Create Master Carton'}</h4>
              <form onSubmit={handleMcSubmit} className="flex flex-wrap items-end gap-4">
                <div className="flex-1 min-w-[200px] space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Carton Code / Master Carton</label>
                  <input 
                    type="text" 
                    required
                    className="w-full h-10 px-3 py-2 border rounded-md bg-background"
                    value={mcFormData.cartonCode}
                    onChange={e => setMcFormData({...mcFormData, cartonCode: e.target.value})}
                    placeholder="e.g. DWJ99-945H"
                  />
                </div>

                <div className="flex-1 min-w-[200px] space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Select Part Number</label>
                  <select
                    className="w-full h-10 px-3 py-2 border rounded-md bg-background"
                    value={mcFormData.partNumberCode}
                    onChange={e => setMcFormData({...mcFormData, partNumberCode: e.target.value})}
                  >
                    {partNumbers.map(p => (
                      <option key={p.id} value={p.partNumber}>{p.partNumber}</option>
                    ))}
                  </select>
                </div>

                <div className="flex-1 min-w-[200px] space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Select Toy Name</label>
                  <select
                    className="w-full h-10 px-3 py-2 border rounded-md bg-background"
                    value={mcFormData.toyNameItemId}
                    onChange={e => setMcFormData({...mcFormData, toyNameItemId: e.target.value})}
                  >
                    {toyNames.map(t => (
                      <option key={t.id} value={t.id}>{t.itemName}</option>
                    ))}
                  </select>
                </div>

                <button 
                  type="submit" 
                  disabled={createMasterCarton.isPending || updateMasterCarton.isPending}
                  className="h-10 bg-primary text-primary-foreground hover:bg-primary/90 px-4 rounded-md font-medium disabled:opacity-50 text-sm"
                >
                  {createMasterCarton.isPending || updateMasterCarton.isPending ? 'Saving...' : editingMc ? 'Update' : 'Save'}
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    setShowMcForm(false);
                    setEditingMc(null);
                    setMcFormData({ cartonCode: '', toyNameItemId: '', partNumberCode: '' });
                  }}
                  className="h-10 border hover:bg-secondary px-4 rounded-md font-medium text-sm"
                >
                  Cancel
                </button>
              </form>
            </div>
          )}

          <div className="bg-card text-card-foreground border rounded-lg shadow-sm overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between bg-secondary/30">
              <div className="relative w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <input 
                  type="text" 
                  placeholder="Search master cartons..." 
                  className="w-full h-9 pl-9 pr-4 text-sm border rounded-md bg-background"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <div className="text-sm text-muted-foreground">
                Total: {filteredMasterCartons.length} cartons
              </div>
            </div>

            {filteredMasterCartons.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center text-muted-foreground">
                <PackageOpen size={48} className="mb-4 opacity-20" />
                <p>No master carton mappings found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-secondary/50 text-muted-foreground uppercase text-xs font-medium">
                    <tr>
                      <th className="px-6 py-3 w-16">No</th>
                      <th className="px-6 py-3">Carton Code</th>
                      <th className="px-6 py-3">Part Number</th>
                      <th className="px-6 py-3">Toy Name</th>
                      <th className="px-6 py-3 w-24 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredMasterCartons.map((mc, index) => {
                      const matchedToy = toyNames.find(t => t.id === mc.toyNameItemId);
                      return (
                        <tr key={mc.id} className="hover:bg-muted/50 transition-colors">
                          <td className="px-6 py-4">{index + 1}</td>
                          <td className="px-6 py-4 font-medium text-blue-600">{mc.cartonCode}</td>
                          <td className="px-6 py-4">{mc.partNumberCode}</td>
                          <td className="px-6 py-4">{matchedToy ? matchedToy.itemName : '-'}</td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => {
                                  setEditingMc(mc);
                                  setMcFormData({ cartonCode: mc.cartonCode, toyNameItemId: mc.toyNameItemId, partNumberCode: mc.partNumberCode });
                                  setShowMcForm(true);
                                }}
                                className="text-muted-foreground hover:text-primary p-1 rounded-md hover:bg-primary/10 transition-colors"
                                title="Edit master carton"
                              >
                                <Pencil size={16} />
                              </button>
                              <button 
                                onClick={() => handleMcDelete(mc.id)}
                                disabled={deleteMasterCarton.isPending}
                                className="text-muted-foreground hover:text-destructive p-1 rounded-md hover:bg-destructive/10 transition-colors disabled:opacity-50"
                                title="Delete master carton"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab Contents: 2. Measurement Units */}
      {activeTab === 'units' && (
        <div className="space-y-4 max-w-3xl">
          <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-lg p-4 text-sm">
            <span className="font-semibold">Info:</span> Units are dynamically loaded from existing Part Numbers and Toy Names in the database. To add a new unit, type it directly into the "Unit" field when adding/editing a Part Number or Toy Name.
          </div>
          <div className="bg-card text-card-foreground border rounded-lg shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-secondary/30 flex justify-between items-center">
              <h4 className="font-semibold text-sm">Measurement Units dropdown list</h4>
              <span className="text-xs text-muted-foreground">{units.length} options active</span>
            </div>
            <div className="divide-y divide-border">
              {units.map((u, index) => (
                <div key={u} className="px-6 py-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-6">{index + 1}</span>
                    <span className="font-medium bg-secondary px-2 py-1 rounded text-xs text-secondary-foreground">{u}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab Contents: 3. WIP Locations */}
      {activeTab === 'locations' && (
        <div className="space-y-4 max-w-3xl">
          <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-lg p-4 text-sm">
            <span className="font-semibold">Info:</span> WIP Locations are dynamically loaded from existing Work In Progress records in the database. To add a new location, type it directly into the "Location / Production Line" field when recording WIP.
          </div>
          <div className="bg-card text-card-foreground border rounded-lg shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-secondary/30 flex justify-between items-center">
              <h4 className="font-semibold text-sm">WIP Production Locations dropdown list</h4>
              <span className="text-xs text-muted-foreground">{allLocations.length} options active</span>
            </div>
            <div className="divide-y divide-border">
              {allLocations.map((loc, index) => (
                <div key={loc} className="px-6 py-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-6">{index + 1}</span>
                    <span className="font-medium">{loc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
