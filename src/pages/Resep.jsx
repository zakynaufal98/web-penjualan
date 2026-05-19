import { useState, useEffect } from 'react';
import { BookOpen, Plus, Trash2, AlertCircle, Loader2, PackageSearch, Package, Edit2, X, ArrowLeftRight, Search, Check } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Toast from '../components/ui/Toast';
import { friendlyError } from '../lib/errorUtils';
import { addActivity } from '../lib/activityLog';
import { buildIngredientPriceMap, calculateIngredientUsageCost } from '../lib/ingredientCosts';

const STOCK_ADJUSTMENT_REASONS = [
  { value: 'trial_resep', label: 'Trial resep' },
  { value: 'konsumsi_pribadi', label: 'Konsumsi pribadi' },
  { value: 'rusak_hilang', label: 'Rusak / hilang' },
  { value: 'expired', label: 'Expired' },
  { value: 'produksi_non_tercatat', label: 'Produksi non-tercatat' },
  { value: 'koreksi_stok', label: 'Koreksi stok fisik' },
  { value: 'lainnya', label: 'Lainnya' },
];

const getRecipeUnit = (master) => {
  if (!master) return 'gr';
  if (master.items_per_unit && master.base_unit) return master.base_unit;
  if (master.unit === 'kg') return 'gr';
  if (master.unit === 'liter') return 'ml';
  return master.unit || 'gr';
};

const IngredientMasterPicker = ({ masters, value, onChange, formatQty, placement = 'bottom' }) => {
  const selected = masters.find(m => m.id === value);
  const [query, setQuery] = useState(selected?.name || '');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(selected?.name || '');
  }, [selected?.id, selected?.name]);

  const filtered = masters
    .filter(master => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return [master.name, master.category, master.unit, master.base_unit].filter(Boolean).some(v => String(v).toLowerCase().includes(q));
    })
    .slice(0, 8);

  return (
    <div className="relative">
      <div className={`flex items-center gap-2 bg-white dark:bg-gray-900 border rounded-lg transition-colors ${open ? 'border-primary-500 ring-2 ring-primary-500/10' : 'border-gray-200 dark:border-gray-700'}`}>
        <Search size={15} className="ml-3 text-gray-400 shrink-0" />
        <input
          required
          value={query}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          placeholder="Cari bahan stok..."
          className="w-full min-w-0 bg-transparent py-2 pr-1 text-sm text-gray-900 dark:text-gray-100 outline-none"
        />
        {selected && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange(null);
              setQuery('');
              setOpen(true);
            }}
            className="mr-2 p-1 text-gray-400 hover:text-red-500 rounded-md"
            aria-label="Kosongkan bahan"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {open && (
        <div className={`absolute z-50 w-full overflow-hidden rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl shadow-black/10 ${placement === 'top' ? 'bottom-full mb-2' : 'mt-2'}`}>
          {filtered.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">Bahan tidak ditemukan.</div>
          ) : (
            <div className="max-h-64 overflow-y-auto py-1">
              {filtered.map(master => {
                const isSelected = master.id === value;
                const isLow = master.min_stock > 0 && master.current_stock <= master.min_stock;
                return (
                  <button
                    key={master.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(master);
                      setQuery(master.name);
                      setOpen(false);
                    }}
                    className="w-full px-3 py-2.5 text-left hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 p-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400">
                        <Package size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{master.name}</span>
                          {isSelected && <Check size={14} className="text-primary-600 shrink-0" />}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                          <span>{master.category || 'Tanpa kategori'}</span>
                          <span className={master.current_stock <= 0 ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-emerald-600'}>
                            Stok {formatQty(master.current_stock)} {master.unit}
                          </span>
                          {master.items_per_unit && master.base_unit && <span>1 {master.unit} = {formatQty(master.items_per_unit)} {master.base_unit}</span>}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default function Resep() {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('resep');
  const [products, setProducts] = useState([]);
  const [ingredientMasters, setIngredientMasters] = useState([]);
  const [ingredientPriceMap, setIngredientPriceMap] = useState({});
  const [selectedProductId, setSelectedProductId] = useState('');
  const [overhead, setOverhead] = useState(5);
  const [savingOverhead, setSavingOverhead] = useState(false);
  const [recipeItems, setRecipeItems] = useState([]);
  const [loadingRecipe, setLoadingRecipe] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [newItem, setNewItem] = useState({ ingredient_master_id: '', quantity_per_unit: '', unit: 'gr' });

  // Edit resep item state
  const [editingRecipeItem, setEditingRecipeItem] = useState(null);
  const [editQty, setEditQty] = useState('');
  const [editUnit, setEditUnit] = useState('gr');
  const [editRecipeLoading, setEditRecipeLoading] = useState(false);

  // Scale resep state
  const [scaleDialog, setScaleDialog] = useState({ open: false, fromPcs: '', toPcs: '' });
  const [scaleLoading, setScaleLoading] = useState(false);

  // Edit stok state
  const [editingMaster, setEditingMaster] = useState(null);
  const [editStockValue, setEditStockValue] = useState('');
  const [editMinStock, setEditMinStock] = useState('');
  const [editItemsPerUnit, setEditItemsPerUnit] = useState('');
  const [editBaseUnit, setEditBaseUnit] = useState('gr');
  const [stockAdjustmentMode, setStockAdjustmentMode] = useState('reduce');
  const [stockAdjustmentQty, setStockAdjustmentQty] = useState('');
  const [stockAdjustmentReason, setStockAdjustmentReason] = useState('trial_resep');
  const [stockAdjustmentNote, setStockAdjustmentNote] = useState('');
  const [editStockLoading, setEditStockLoading] = useState(false);
  const [stockFilter, setStockFilter] = useState('all');
  const [toast, setToast] = useState({ message: '', type: 'success' });

  const fetchProducts = async () => {
    const { data } = await supabase.from('products').select('id, name, overhead_pct').order('name');
    setProducts(data || []);
  };

  const fetchIngredientMasters = async () => {
    const { data } = await supabase.from('ingredient_masters').select('*').order('name');
    setIngredientMasters(data || []);
  };

  const fetchIngredientPrices = async () => {
    const { data } = await supabase.from('ingredients').select('*').order('purchase_date', { ascending: false });
    if (!data) return;
    setIngredientPriceMap(buildIngredientPriceMap(data));
  };

  // Hitung biaya per pcs produk untuk satu bahan resep
  const calcItemCostPerPcs = (recipeItem) => {
    const master = recipeItem.ingredient_masters;
    if (!master) return 0;
    const key = master.name.trim().toLowerCase();
    const priceData = ingredientPriceMap[key];
    if (!priceData) return 0;

    return calculateIngredientUsageCost(priceData, recipeItem.quantity_per_unit, recipeItem.unit);
  };

  const fetchRecipe = async (productId) => {
    setLoadingRecipe(true);
    const { data } = await supabase
      .from('recipes')
      .select('*, ingredient_masters(id, name, unit, current_stock, items_per_unit, base_unit)')
      .eq('product_id', productId);
    setRecipeItems(data || []);
    setLoadingRecipe(false);
  };

  const recalcAndUpdateProductHPP = async (productId, overheadPct) => {
    const { data: freshRecipe } = await supabase
      .from('recipes')
      .select('*, ingredient_masters(id, name, unit, current_stock, items_per_unit, base_unit)')
      .eq('product_id', productId);
    if (!freshRecipe || freshRecipe.length === 0) {
      await supabase.from('products').update({
        cost_price: 0,
        overhead_pct: overheadPct,
      }).eq('id', productId);
      return;
    }
    const ingredientCost = freshRecipe.reduce((sum, item) => sum + calcItemCostPerPcs(item), 0);
    if (ingredientCost > 0) {
      const totalWithOverhead = ingredientCost * (1 + (overheadPct || 0) / 100);
      await supabase.from('products').update({
        cost_price: Math.round(totalWithOverhead),
        overhead_pct: overheadPct,
      }).eq('id', productId);
    }
  };

  const handleAddIngredient = async (e) => {
    e.preventDefault();
    if (!newItem.ingredient_master_id || !newItem.quantity_per_unit) return;
    if (parseFloat(newItem.quantity_per_unit) <= 0) {
      setError('Qty harus lebih dari 0.');
      return;
    }
    setSaving(true);
    setError('');
    const { error: insertError } = await supabase.from('recipes').insert([{
      product_id: selectedProductId,
      ingredient_master_id: newItem.ingredient_master_id,
      quantity_per_unit: parseFloat(newItem.quantity_per_unit),
      unit: newItem.unit
    }]);
    if (insertError) {
      setError(insertError.message.includes('unique') ? 'Bahan ini sudah ada di resep.' : friendlyError(insertError));
    } else {
      setNewItem({ ingredient_master_id: '', quantity_per_unit: '', unit: 'gr' });
      await recalcAndUpdateProductHPP(selectedProductId, overhead);
      setToast({ message: 'Bahan ditambahkan & HPP produk diperbarui!', type: 'success' });
      fetchRecipe(selectedProductId);
    }
    setSaving(false);
  };

  const openEditRecipeItem = (item) => {
    setEditingRecipeItem(item);
    setEditQty(item.quantity_per_unit);
    setEditUnit(item.unit);
  };

  const handleSaveRecipeItem = async (e) => {
    e.preventDefault();
    if (parseFloat(editQty) <= 0) return;
    setEditRecipeLoading(true);
    await supabase.from('recipes').update({
      quantity_per_unit: parseFloat(editQty),
      unit: editUnit,
    }).eq('id', editingRecipeItem.id);
    setEditingRecipeItem(null);
    await recalcAndUpdateProductHPP(selectedProductId, overhead);
    setToast({ message: 'Bahan resep diperbarui & HPP dihitung ulang!', type: 'success' });
    fetchRecipe(selectedProductId);
    setEditRecipeLoading(false);
  };

  const handleDeleteRecipeItem = async (id) => {
    await supabase.from('recipes').delete().eq('id', id);
    await recalcAndUpdateProductHPP(selectedProductId, overhead);
    setToast({ message: 'Bahan dihapus & HPP produk diperbarui.', type: 'success' });
    fetchRecipe(selectedProductId);
  };

  const handleScaleRecipe = async () => {
    const from = parseFloat(scaleDialog.fromPcs);
    const to   = parseFloat(scaleDialog.toPcs);
    if (!from || !to || from <= 0 || to <= 0 || from === to) return;
    setScaleLoading(true);
    const ratio = from / to;
    for (const item of recipeItems) {
      const newQty = parseFloat((item.quantity_per_unit * ratio).toFixed(4));
      await supabase.from('recipes').update({ quantity_per_unit: newQty }).eq('id', item.id);
    }
    await recalcAndUpdateProductHPP(selectedProductId, overhead);
    await fetchRecipe(selectedProductId);
    setScaleDialog({ open: false, fromPcs: '', toPcs: '' });
    setScaleLoading(false);
    setToast({ message: `Resep berhasil diskalakan: ${from} → ${to} pcs. HPP diperbarui!`, type: 'success' });
  };

  const handleSaveOverhead = async () => {
    setSavingOverhead(true);
    await recalcAndUpdateProductHPP(selectedProductId, overhead);
    await fetchProducts();
    setToast({ message: `Overhead ${overhead}% disimpan & HPP diperbarui!`, type: 'success' });
    setSavingOverhead(false);
  };

  const openEditStock = (master) => {
    setEditingMaster(master);
    setEditStockValue(master.current_stock ?? 0);
    setEditMinStock(master.min_stock ?? 0);
    setEditItemsPerUnit(master.items_per_unit ?? '');
    setEditBaseUnit(master.base_unit ?? 'gr');
    setStockAdjustmentMode('reduce');
    setStockAdjustmentQty('');
    setStockAdjustmentReason('trial_resep');
    setStockAdjustmentNote('');
  };

  const handleSaveStock = async (e) => {
    e.preventDefault();
    setEditStockLoading(true);
    const currentStock = parseFloat(editingMaster.current_stock) || 0;
    const adjustmentQty = parseFloat(stockAdjustmentQty) || 0;
    const manualStock = parseFloat(editStockValue) || 0;
    const reasonLabel = STOCK_ADJUSTMENT_REASONS.find(reason => reason.value === stockAdjustmentReason)?.label || 'Koreksi stok';
    let nextStock = manualStock;

    if (stockAdjustmentMode === 'add') {
      if (adjustmentQty <= 0) {
        setToast({ message: 'Jumlah koreksi harus lebih dari 0.', type: 'error' });
        setEditStockLoading(false);
        return;
      }
      nextStock = currentStock + adjustmentQty;
    } else if (stockAdjustmentMode === 'reduce') {
      if (adjustmentQty <= 0) {
        setToast({ message: 'Jumlah pemakaian harus lebih dari 0.', type: 'error' });
        setEditStockLoading(false);
        return;
      }
      nextStock = Math.max(0, currentStock - adjustmentQty);
    }

    const itemsPerUnit = editItemsPerUnit !== '' ? parseFloat(editItemsPerUnit) : null;
    const { error: updateError } = await supabase
      .from('ingredient_masters')
      .update({
        current_stock: parseFloat(nextStock.toFixed(4)),
        min_stock: parseFloat(editMinStock) || 0,
        items_per_unit: itemsPerUnit,
        base_unit: itemsPerUnit ? editBaseUnit : null,
      })
      .eq('id', editingMaster.id);

    if (updateError) {
      setToast({ message: friendlyError(updateError), type: 'error' });
      setEditStockLoading(false);
      return;
    }

    if (stockAdjustmentMode !== 'set') {
      const direction = stockAdjustmentMode === 'reduce' ? 'dikurangi' : 'ditambah';
      addActivity({
        type: stockAdjustmentMode === 'reduce' ? 'warning' : 'info',
        title: `Stok ${editingMaster.name} ${direction}`,
        description: `${formatQty(adjustmentQty)} ${editingMaster.unit} - ${reasonLabel}${stockAdjustmentNote ? ` (${stockAdjustmentNote})` : ''}`,
      });
    } else if (manualStock !== currentStock) {
      addActivity({
        type: 'info',
        title: `Stok ${editingMaster.name} diset manual`,
        description: `${formatQty(currentStock)} ${editingMaster.unit} menjadi ${formatQty(nextStock)} ${editingMaster.unit}${stockAdjustmentNote ? ` (${stockAdjustmentNote})` : ''}`,
      });
    }

    setEditingMaster(null);
    setToast({ message: 'Stok berhasil diperbarui!', type: 'success' });
    fetchIngredientMasters();
    setEditStockLoading(false);
  };

  useEffect(() => {
    fetchProducts();
    fetchIngredientMasters();
    fetchIngredientPrices();
  }, []);

  useEffect(() => {
    const productId = location.state?.productId;
    if (!productId || products.length === 0) return;
    setActiveTab('resep');
    setSelectedProductId(productId);
    navigate('/resep', { replace: true, state: null });
  }, [location.state, products, navigate]);

  useEffect(() => {
    if (selectedProductId) {
      fetchRecipe(selectedProductId);
      const p = products.find(p => p.id === selectedProductId);
      setOverhead(p?.overhead_pct ?? 5);
    } else {
      setRecipeItems([]);
    }
  }, [selectedProductId, products]);

  const selectedProduct = products.find(p => p.id === selectedProductId);
  const filteredIngredientMasters = ingredientMasters.filter(master => {
    if (stockFilter === 'empty') return master.current_stock <= 0;
    if (stockFilter === 'low') return master.min_stock > 0 && master.current_stock > 0 && master.current_stock <= master.min_stock;
    return true;
  });

  const formatQty = (qty) => {
    const n = parseFloat(qty);
    if (isNaN(n)) return qty;
    if (Number.isInteger(n)) return n.toLocaleString('id-ID');
    return parseFloat(n.toFixed(2)).toLocaleString('id-ID');
  };

  const getStockAdjustmentPreview = () => {
    if (!editingMaster) return 0;
    const currentStock = parseFloat(editingMaster.current_stock) || 0;
    const adjustmentQty = parseFloat(stockAdjustmentQty) || 0;
    if (stockAdjustmentMode === 'add') return currentStock + adjustmentQty;
    if (stockAdjustmentMode === 'reduce') return Math.max(0, currentStock - adjustmentQty);
    return parseFloat(editStockValue) || 0;
  };

  // Konversi stok master ke unit yang dipakai di resep untuk hitung "cukup untuk"
  const getStockInRecipeUnit = (master, recipeUnit) => {
    const stock = master.current_stock || 0;
    const mu = master.unit;
    if (mu === recipeUnit) return stock;
    if (mu === 'kg' && recipeUnit === 'gr') return stock * 1000;
    if (mu === 'gr' && recipeUnit === 'kg') return stock / 1000;
    if (mu === 'liter' && recipeUnit === 'ml') return stock * 1000;
    if (mu === 'ml' && recipeUnit === 'liter') return stock / 1000;
    if (master.items_per_unit && master.base_unit) {
      const stockInBase = stock * master.items_per_unit;
      const bu = master.base_unit;
      if (bu === recipeUnit) return stockInBase;
      if (bu === 'gr' && recipeUnit === 'kg') return stockInBase / 1000;
      if (bu === 'kg' && recipeUnit === 'gr') return stockInBase * 1000;
      if (bu === 'ml' && recipeUnit === 'liter') return stockInBase / 1000;
      if (bu === 'liter' && recipeUnit === 'ml') return stockInBase * 1000;
    }
    return stock;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Resep & Stok Bahan</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Atur resep produk agar stok bahan berkurang otomatis saat produksi.</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-full sm:w-fit">
        <button
          onClick={() => setActiveTab('resep')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'resep' ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
        >
          <BookOpen size={15} /> Resep Produk
        </button>
        <button
          onClick={() => setActiveTab('stok')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'stok' ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
        >
          <Package size={15} /> Stok Bahan
          {ingredientMasters.some(m => m.current_stock <= m.min_stock && m.min_stock > 0) && (
            <span className="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs px-1.5 py-0.5 rounded-full">!</span>
          )}
        </button>
      </div>

      {/* ── TAB: Resep Produk ── */}
      {activeTab === 'resep' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Pilih Produk</label>
            <select
              value={selectedProductId}
              onChange={(e) => { setSelectedProductId(e.target.value); setError(''); }}
              className="w-full sm:w-80 px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
            >
              <option value="">-- Pilih Produk --</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {selectedProductId ? (
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
              <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3 flex-wrap">
                <BookOpen size={18} className="text-primary-600 dark:text-primary-400" />
                <h2 className="font-bold text-gray-900 dark:text-white text-sm">{selectedProduct?.name}</h2>
                <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">qty per 1 pcs produk</span>
                {recipeItems.length > 0 && (
                  <button
                    onClick={() => setScaleDialog({ open: true, fromPcs: '', toPcs: '' })}
                    className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/40 border border-violet-200 dark:border-violet-800 rounded-lg transition-colors font-medium"
                  >
                    <ArrowLeftRight size={13} /> Skalakan Resep
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                {loadingRecipe ? (
                  <div className="p-8 text-center text-gray-500">Memuat resep...</div>
                ) : recipeItems.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 text-sm">Belum ada bahan. Tambahkan di bawah.</div>
                ) : (
                  <table className="w-full text-left border-collapse min-w-[580px]">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                        <th className="p-4 font-medium">Bahan</th>
                        <th className="p-4 font-medium text-right">Kebutuhan / pcs</th>
                        <th className="p-4 font-medium text-right">Biaya / pcs</th>
                        <th className="p-4 font-medium">Stok Tersedia</th>
                        <th className="p-4 font-medium text-right">Cukup untuk</th>
                        <th className="p-4 font-medium">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
                      {recipeItems.map((item) => {
                        const master = item.ingredient_masters;
                        const stok = master?.current_stock ?? 0;
                        const masterUnit = master?.unit ?? '';
                        const stockInRecipeUnit = master ? getStockInRecipeUnit(master, item.unit) : 0;
                        const cukupPcs = item.quantity_per_unit > 0 ? Math.floor(stockInRecipeUnit / item.quantity_per_unit) : 0;
                        const isHabis = stok <= 0;
                        const isMenipis = !isHabis && cukupPcs < 5;
                        const hasSubUnit = master?.items_per_unit && master?.base_unit;
                        const totalBase = hasSubUnit ? stok * master.items_per_unit : null;
                        return (
                          <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                            <td className="p-4 font-medium text-gray-900 dark:text-gray-100">{master?.name}</td>
                            <td className="p-4 text-right">
                              <span className="font-semibold text-gray-900 dark:text-gray-100">{formatQty(item.quantity_per_unit)}</span>
                              <span className="text-gray-400 ml-1 text-xs">{item.unit}</span>
                            </td>
                            <td className="p-4 text-right">
                              {calcItemCostPerPcs(item) > 0
                                ? <span className="font-medium text-gray-700 dark:text-gray-300">Rp {Math.round(calcItemCostPerPcs(item)).toLocaleString('id-ID')}</span>
                                : <span className="text-xs text-gray-400">—</span>}
                            </td>
                            <td className="p-4">
                              <span className={`font-semibold ${isHabis ? 'text-red-600 dark:text-red-400' : isMenipis ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                {formatQty(stok)}
                              </span>
                              <span className="text-gray-400 ml-1 text-xs">{masterUnit}</span>
                              {hasSubUnit && (
                                <div className="text-xs text-gray-400 mt-0.5">
                                  = {formatQty(totalBase)} {master.base_unit}
                                </div>
                              )}
                            </td>
                            <td className="p-4 text-right">
                              {isHabis ? (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">Habis</span>
                              ) : (
                                <span className={`text-xs font-medium ${isMenipis ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                  {cukupPcs} pcs
                                </span>
                              )}
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-1">
                                <button onClick={() => openEditRecipeItem(item)} className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors">
                                  <Edit2 size={15} />
                                </button>
                                <button onClick={() => handleDeleteRecipeItem(item.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {recipeItems.length > 0 && (() => {
                      const ingredientCost = recipeItems.reduce((sum, item) => sum + calcItemCostPerPcs(item), 0);
                      const overheadAmt = ingredientCost * (overhead / 100);
                      const totalCost = ingredientCost + overheadAmt;
                      return ingredientCost > 0 ? (
                        <tfoot>
                          {overhead > 0 && (
                            <tr className="bg-amber-50/60 dark:bg-amber-900/10 border-t border-amber-100 dark:border-amber-900/30">
                              <td className="p-3 text-xs text-amber-600 dark:text-amber-400" colSpan={2}>Bahan baku</td>
                              <td className="p-3 text-right text-xs text-amber-600 dark:text-amber-400">Rp {Math.round(ingredientCost).toLocaleString('id-ID')}</td>
                              <td colSpan={3} />
                            </tr>
                          )}
                          {overhead > 0 && (
                            <tr className="bg-amber-50/60 dark:bg-amber-900/10">
                              <td className="p-3 text-xs text-amber-600 dark:text-amber-400" colSpan={2}>Overhead ({overhead}%)</td>
                              <td className="p-3 text-right text-xs text-amber-600 dark:text-amber-400">+ Rp {Math.round(overheadAmt).toLocaleString('id-ID')}</td>
                              <td colSpan={3} />
                            </tr>
                          )}
                          <tr className="bg-primary-50 dark:bg-primary-900/20 border-t-2 border-primary-100 dark:border-primary-800">
                            <td className="p-4 font-bold text-primary-700 dark:text-primary-300 text-sm" colSpan={2}>Total HPP / pcs</td>
                            <td className="p-4 text-right font-bold text-primary-700 dark:text-primary-300">
                              Rp {Math.round(totalCost).toLocaleString('id-ID')}
                            </td>
                            <td colSpan={3} className="p-4 text-xs text-primary-500 dark:text-primary-400">
                              harga rata-rata pembelian terkini
                            </td>
                          </tr>
                        </tfoot>
                      ) : null;
                    })()}
                  </table>
                )}
              </div>

              {/* Overhead */}
              <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 bg-amber-50/50 dark:bg-amber-900/10">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1">
                    <label className="flex justify-between items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      <span>Overhead <span className="font-normal text-gray-400 text-xs">(gas, air, listrik, dll)</span></span>
                      <span className="font-bold text-amber-600 dark:text-amber-400">{overhead}%</span>
                    </label>
                    <input
                      type="range" min="0" max="30" step="1"
                      value={overhead}
                      onChange={(e) => setOverhead(parseInt(e.target.value))}
                      className="w-full accent-amber-500"
                    />
                  </div>
                  <button
                    onClick={handleSaveOverhead}
                    disabled={savingOverhead}
                    className="shrink-0 flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                  >
                    {savingOverhead ? <Loader2 size={14} className="animate-spin" /> : null}
                    Simpan Overhead
                  </button>
                </div>
              </div>

              <div className="p-5 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
                {error && (
                  <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-sm flex gap-2">
                    <AlertCircle size={16} /> {error}
                  </div>
                )}
                {ingredientMasters.length === 0 ? (
                  <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2">
                    <AlertCircle size={15} /> Tambahkan pembelian bahan di Modal Bahan terlebih dahulu.
                  </p>
                ) : (
                  <form onSubmit={handleAddIngredient} className="flex flex-col sm:flex-row gap-3 items-end">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Tambah Bahan ke Resep</label>
                      <IngredientMasterPicker
                        masters={ingredientMasters}
                        value={newItem.ingredient_master_id}
                        formatQty={formatQty}
                        placement="top"
                        onChange={(master) => setNewItem({
                          ...newItem,
                          ingredient_master_id: master?.id || '',
                          unit: master ? getRecipeUnit(master) : 'gr',
                        })}
                      />
                    </div>
                    <div className="w-full sm:w-44">
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Qty per 1 cup/pcs</label>
                      <div className="flex">
                        <input
                          type="number" min="0" step="any" required placeholder="Cth: 5"
                          value={newItem.quantity_per_unit}
                          onChange={(e) => setNewItem({ ...newItem, quantity_per_unit: e.target.value })}
                          className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-l-lg text-sm focus:border-primary-500 outline-none"
                        />
                        <select
                          value={newItem.unit}
                          onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                          className="px-2 bg-gray-100 dark:bg-gray-800 border border-l-0 border-gray-200 dark:border-gray-700 rounded-r-lg text-sm outline-none"
                        >
                          <option value="gr">gr</option>
                          <option value="kg">kg</option>
                          <option value="ml">ml</option>
                          <option value="liter">L</option>
                          <option value="pcs">pcs</option>
                          <option value="lembar">lembar</option>
                        </select>
                      </div>
                      <p className="mt-1 text-[11px] leading-snug text-gray-400">
                        Jika 60 gr untuk 12 cup, isi 5 gr.
                      </p>
                    </div>
                    <button
                      type="submit" disabled={saving}
                      className="w-full sm:w-auto flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-70"
                    >
                      {saving ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}
                      Tambah
                    </button>
                  </form>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-10 text-center shadow-sm">
              <PackageSearch size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-gray-500 dark:text-gray-400 text-sm">Pilih produk di atas untuk mengatur resepnya.</p>
              <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">Resep digunakan untuk mengurangi stok bahan otomatis saat produksi.</p>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Stok Bahan ── */}
      {activeTab === 'stok' && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">Klik Edit untuk koreksi stok secara manual jika ada selisih.</p>
            <div className="flex gap-1 bg-white dark:bg-gray-900 rounded-xl p-1 border border-gray-100 dark:border-gray-700">
              {[
                { id: 'all', label: 'Semua' },
                { id: 'low', label: 'Menipis' },
                { id: 'empty', label: 'Habis' },
              ].map(filter => (
                <button
                  key={filter.id}
                  onClick={() => setStockFilter(filter.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${stockFilter === filter.id ? 'bg-primary-600 text-white' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            {ingredientMasters.length === 0 ? (
              <div className="p-10 text-center">
                <PackageSearch size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <p className="font-semibold text-gray-900 dark:text-gray-100">Belum ada data bahan baku</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Catat pembelian bahan terlebih dahulu agar stok bisa dipantau.</p>
                <button onClick={() => navigate('/modal')} className="mt-4 inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
                  <Plus size={15} /> Tambah Pembelian
                </button>
              </div>
            ) : (
              <table className="w-full text-left border-collapse min-w-[500px]">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                    <th className="p-4 font-medium">Nama Bahan</th>
                    <th className="p-4 font-medium">Kategori</th>
                    <th className="p-4 font-medium text-right">Stok Saat Ini</th>
                    <th className="p-4 font-medium text-right">Stok Minimum</th>
                    <th className="p-4 font-medium">Status</th>
                    <th className="p-4 font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
                  {filteredIngredientMasters.map((master) => {
                    const isLow = master.min_stock > 0 && master.current_stock <= master.min_stock;
                    const isEmpty = master.current_stock <= 0;
                    return (
                      <tr key={master.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                        <td className="p-4 font-medium text-gray-900 dark:text-gray-100">{master.name}</td>
                        <td className="p-4 text-gray-500 dark:text-gray-400">{master.category || '-'}</td>
                        <td className="p-4 text-right">
                          <span className={`font-semibold ${isEmpty ? 'text-red-600 dark:text-red-400' : isLow ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-gray-100'}`}>
                            {formatQty(master.current_stock)}
                          </span>
                          <span className="text-xs font-normal text-gray-400 ml-1">{master.unit}</span>
                          {master.items_per_unit && master.base_unit && (
                            <div className="text-xs text-gray-400 mt-0.5">
                              = {formatQty(master.current_stock * master.items_per_unit)} {master.base_unit}
                            </div>
                          )}
                        </td>
                        <td className="p-4 text-right text-gray-500 dark:text-gray-400">
                          {master.min_stock > 0 ? (
                            <><span className="font-medium">{formatQty(master.min_stock)}</span> <span className="text-xs text-gray-400">{master.unit}</span></>
                          ) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                        </td>
                        <td className="p-4">
                          {isEmpty ? (
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">Habis</span>
                          ) : isLow ? (
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">Menipis</span>
                          ) : (
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">Tersedia</span>
                          )}
                        </td>
                        <td className="p-4">
                          <button onClick={() => openEditStock(master)} className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors">
                            <Edit2 size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      {/* Dialog Skalakan Resep */}
      {scaleDialog.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 w-full max-w-sm">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <ArrowLeftRight size={18} className="text-violet-500" />
                <h2 className="text-base font-bold text-gray-900 dark:text-white">Skalakan Resep</h2>
              </div>
              <button onClick={() => setScaleDialog(d => ({ ...d, open: false }))} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Semua qty bahan akan dikalikan dengan rasio <strong>dari ÷ jadi</strong>. HPP otomatis dihitung ulang.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Hasil sebelumnya (pcs)</label>
                  <input
                    type="number" min="1" placeholder="Cth: 26" autoFocus
                    value={scaleDialog.fromPcs}
                    onChange={(e) => setScaleDialog(d => ({ ...d, fromPcs: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-violet-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Hasil sekarang (pcs)</label>
                  <input
                    type="number" min="1" placeholder="Cth: 25"
                    value={scaleDialog.toPcs}
                    onChange={(e) => setScaleDialog(d => ({ ...d, toPcs: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-violet-500 outline-none"
                  />
                </div>
              </div>
              {scaleDialog.fromPcs && scaleDialog.toPcs && parseFloat(scaleDialog.fromPcs) > 0 && parseFloat(scaleDialog.toPcs) > 0 && parseFloat(scaleDialog.fromPcs) !== parseFloat(scaleDialog.toPcs) && (
                <div className="p-3 bg-violet-50 dark:bg-violet-900/20 rounded-xl text-xs text-violet-700 dark:text-violet-300">
                  Semua qty × {(parseFloat(scaleDialog.fromPcs) / parseFloat(scaleDialog.toPcs)).toFixed(4)}
                  &nbsp;({scaleDialog.fromPcs} ÷ {scaleDialog.toPcs})
                  &nbsp;— {recipeItems.length} bahan akan diperbarui
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setScaleDialog(d => ({ ...d, open: false }))} className="flex-1 py-2.5 rounded-xl text-sm border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  Batal
                </button>
                <button
                  onClick={handleScaleRecipe}
                  disabled={scaleLoading || !scaleDialog.fromPcs || !scaleDialog.toPcs || parseFloat(scaleDialog.fromPcs) === parseFloat(scaleDialog.toPcs)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white transition-colors disabled:opacity-50"
                >
                  {scaleLoading ? <Loader2 size={15} className="animate-spin" /> : <ArrowLeftRight size={15} />}
                  Skalakan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Edit Bahan Resep */}
      {editingRecipeItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 w-full max-w-sm">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="font-bold text-gray-900 dark:text-white text-sm">
                Edit: {editingRecipeItem.ingredient_masters?.name}
              </h2>
              <button onClick={() => setEditingRecipeItem(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveRecipeItem} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Qty per 1 cup/pcs produk
                </label>
                <div className="flex gap-2">
                  <input
                    type="number" min="0" step="any" required autoFocus
                    value={editQty}
                    onChange={(e) => setEditQty(e.target.value)}
                    className="flex-1 px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                  />
                  <select
                    value={editUnit}
                    onChange={(e) => setEditUnit(e.target.value)}
                    className="px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none"
                  >
                    <option value="gr">gr</option>
                    <option value="kg">kg</option>
                    <option value="ml">ml</option>
                    <option value="liter">L</option>
                    <option value="pcs">pcs</option>
                    <option value="lembar">lembar</option>
                  </select>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  Contoh: vla 60 gr untuk 12 cup berarti 5 gr per cup.
                </p>
              </div>
              <button
                type="submit" disabled={editRecipeLoading}
                className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-70"
              >
                {editRecipeLoading ? <Loader2 className="animate-spin" size={16} /> : 'Simpan & Hitung Ulang HPP'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit Stok */}
      {editingMaster && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 w-full max-w-sm">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="font-bold text-gray-900 dark:text-white text-sm">Koreksi Stok: {editingMaster.name}</h2>
              <button onClick={() => setEditingMaster(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveStock} className="p-4 space-y-4">
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">Stok saat ini</p>
                <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">
                  {formatQty(editingMaster.current_stock)} <span className="text-sm font-medium text-gray-400">{editingMaster.unit}</span>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Jenis koreksi</label>
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
                  {[
                    { value: 'reduce', label: 'Kurangi' },
                    { value: 'add', label: 'Tambah' },
                    { value: 'set', label: 'Set manual' },
                  ].map(mode => (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => setStockAdjustmentMode(mode.value)}
                      className={`px-2 py-2 rounded-lg text-xs font-semibold transition-colors ${stockAdjustmentMode === mode.value ? 'bg-white dark:bg-gray-900 text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {stockAdjustmentMode === 'set' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Stok Fisik Sekarang ({editingMaster.unit})
                  </label>
                  <input
                    type="number" min="0" step="any" required autoFocus
                    value={editStockValue}
                    onChange={(e) => setEditStockValue(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Jumlah {stockAdjustmentMode === 'reduce' ? 'Dipakai' : 'Ditambah'} ({editingMaster.unit})
                    </label>
                    <input
                      type="number" min="0" step="any" required autoFocus
                      value={stockAdjustmentQty}
                      onChange={(e) => setStockAdjustmentQty(e.target.value)}
                      className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Alasan</label>
                    <select
                      value={stockAdjustmentReason}
                      onChange={(e) => setStockAdjustmentReason(e.target.value)}
                      className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                    >
                      {STOCK_ADJUSTMENT_REASONS.map(reason => (
                        <option key={reason.value} value={reason.value}>{reason.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-primary-100 dark:border-primary-900/40 bg-primary-50/70 dark:bg-primary-900/10 px-3 py-2 text-xs text-primary-700 dark:text-primary-300">
                Setelah disimpan: <span className="font-bold">{formatQty(getStockAdjustmentPreview())} {editingMaster.unit}</span>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Catatan <span className="font-normal text-gray-400">(opsional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Cth: dipakai buat tester rasa coklat"
                  value={stockAdjustmentNote}
                  onChange={(e) => setStockAdjustmentNote(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Stok Minimum ({editingMaster.unit})
                </label>
                <input
                  type="number" min="0" step="any"
                  value={editMinStock}
                  onChange={(e) => setEditMinStock(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Isi per {editingMaster.unit} <span className="font-normal text-gray-400">(opsional)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="number" min="0" step="any"
                    placeholder={`cth: 6`}
                    value={editItemsPerUnit}
                    onChange={(e) => setEditItemsPerUnit(e.target.value)}
                    className="flex-1 px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                  />
                  <select
                    value={editBaseUnit}
                    onChange={(e) => setEditBaseUnit(e.target.value)}
                    disabled={!editItemsPerUnit}
                    className="px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none disabled:opacity-40"
                  >
                    <option value="pcs">pcs</option>
                    <option value="gr">gr</option>
                    <option value="ml">ml</option>
                    <option value="lembar">lembar</option>
                  </select>
                </div>
                {editItemsPerUnit && (
                  <p className="text-xs text-primary-600 dark:text-primary-400 mt-1.5">
                    1 {editingMaster.unit} = {editItemsPerUnit} {editBaseUnit}
                    {` · stok total setelah koreksi: ${formatQty(getStockAdjustmentPreview() * parseFloat(editItemsPerUnit))} ${editBaseUnit}`}
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-1">Untuk kemasan seperti kotak, pack, botol, dll.</p>
              </div>
              <button
                type="submit" disabled={editStockLoading}
                className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-70"
              >
                {editStockLoading ? <Loader2 className="animate-spin" size={16} /> : 'Simpan'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
