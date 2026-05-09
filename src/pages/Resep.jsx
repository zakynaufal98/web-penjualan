import { useState, useEffect } from 'react';
import { BookOpen, Plus, Trash2, AlertCircle, Loader2, PackageSearch, Package, Edit2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Toast from '../components/ui/Toast';

export default function Resep() {
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

  // Edit stok state
  const [editingMaster, setEditingMaster] = useState(null);
  const [editStockValue, setEditStockValue] = useState('');
  const [editMinStock, setEditMinStock] = useState('');
  const [editItemsPerUnit, setEditItemsPerUnit] = useState('');
  const [editBaseUnit, setEditBaseUnit] = useState('gr');
  const [editStockLoading, setEditStockLoading] = useState(false);
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
    // Weighted average price per base unit, dikelompokkan per nama bahan
    const groups = {};
    data.forEach(ing => {
      const key = ing.name.trim().toLowerCase();
      if (!groups[key]) groups[key] = [];
      groups[key].push(ing);
    });
    const map = {};
    Object.entries(groups).forEach(([key, entries]) => {
      let totalCost = 0, totalQtyBase = 0;
      entries.forEach(ing => {
        let pricePerBase, qtyBase;
        if (ing.items_per_unit && ing.base_unit) {
          pricePerBase = ing.unit_price / ing.items_per_unit;
          qtyBase = ing.quantity * ing.items_per_unit;
        } else if (ing.unit === 'kg') {
          pricePerBase = ing.unit_price / 1000; qtyBase = ing.quantity * 1000;
        } else if (ing.unit === 'liter') {
          pricePerBase = ing.unit_price / 1000; qtyBase = ing.quantity * 1000;
        } else {
          pricePerBase = ing.unit_price; qtyBase = ing.quantity;
        }
        totalCost += pricePerBase * qtyBase;
        totalQtyBase += qtyBase;
      });
      // simpan harga per unit terkecil (gr/ml/pcs)
      map[key] = { pricePerBase: totalQtyBase > 0 ? totalCost / totalQtyBase : 0, template: entries[0] };
    });
    setIngredientPriceMap(map);
  };

  // Hitung biaya per pcs produk untuk satu bahan resep
  const calcItemCostPerPcs = (recipeItem) => {
    const master = recipeItem.ingredient_masters;
    if (!master) return 0;
    const key = master.name.trim().toLowerCase();
    const priceData = ingredientPriceMap[key];
    if (!priceData) return 0;

    const { pricePerBase, template } = priceData;
    const qty = recipeItem.quantity_per_unit;
    const unit = recipeItem.unit;

    // Konversi qty resep ke unit terkecil yang sama dengan pricePerBase
    let baseUnit;
    if (template.items_per_unit && template.base_unit) baseUnit = template.base_unit;
    else if (template.unit === 'kg') baseUnit = 'gr';
    else if (template.unit === 'liter') baseUnit = 'ml';
    else baseUnit = template.unit;

    let qtyInBase = qty;
    if (unit === baseUnit) qtyInBase = qty;
    else if (unit === 'kg' && baseUnit === 'gr') qtyInBase = qty * 1000;
    else if (unit === 'gr' && baseUnit === 'kg') qtyInBase = qty / 1000;
    else if (unit === 'liter' && baseUnit === 'ml') qtyInBase = qty * 1000;
    else if (unit === 'ml' && baseUnit === 'liter') qtyInBase = qty / 1000;

    return pricePerBase * qtyInBase;
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
    if (!freshRecipe || freshRecipe.length === 0) return;
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
      setError(insertError.message.includes('unique') ? 'Bahan ini sudah ada di resep.' : insertError.message);
    } else {
      setNewItem({ ingredient_master_id: '', quantity_per_unit: '', unit: 'gr' });
      await recalcAndUpdateProductHPP(selectedProductId, overhead);
      setToast({ message: 'Bahan ditambahkan & HPP produk diperbarui!', type: 'success' });
      fetchRecipe(selectedProductId);
    }
    setSaving(false);
  };

  const handleDeleteRecipeItem = async (id) => {
    await supabase.from('recipes').delete().eq('id', id);
    await recalcAndUpdateProductHPP(selectedProductId, overhead);
    setToast({ message: 'Bahan dihapus & HPP produk diperbarui.', type: 'success' });
    fetchRecipe(selectedProductId);
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
  };

  const handleSaveStock = async (e) => {
    e.preventDefault();
    setEditStockLoading(true);
    const itemsPerUnit = editItemsPerUnit !== '' ? parseFloat(editItemsPerUnit) : null;
    await supabase
      .from('ingredient_masters')
      .update({
        current_stock: parseFloat(editStockValue) || 0,
        min_stock: parseFloat(editMinStock) || 0,
        items_per_unit: itemsPerUnit,
        base_unit: itemsPerUnit ? editBaseUnit : null,
      })
      .eq('id', editingMaster.id);
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
    if (selectedProductId) {
      fetchRecipe(selectedProductId);
      const p = products.find(p => p.id === selectedProductId);
      setOverhead(p?.overhead_pct ?? 5);
    } else {
      setRecipeItems([]);
    }
  }, [selectedProductId, products]);

  const selectedProduct = products.find(p => p.id === selectedProductId);

  const formatQty = (qty) => {
    const n = parseFloat(qty);
    if (isNaN(n)) return qty;
    if (Number.isInteger(n)) return n.toLocaleString('id-ID');
    return parseFloat(n.toFixed(2)).toLocaleString('id-ID');
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
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
                <BookOpen size={18} className="text-primary-600 dark:text-primary-400" />
                <h2 className="font-bold text-gray-900 dark:text-white text-sm">{selectedProduct?.name}</h2>
                <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">qty per 1 pcs produk</span>
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
                              <button onClick={() => handleDeleteRecipeItem(item.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                                <Trash2 size={15} />
                              </button>
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
                      <select
                        required
                        value={newItem.ingredient_master_id}
                        onChange={(e) => {
                          const master = ingredientMasters.find(m => m.id === e.target.value);
                          setNewItem({ ...newItem, ingredient_master_id: e.target.value, unit: master?.unit || 'gr' });
                        }}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:border-primary-500 outline-none"
                      >
                        <option value="">-- Pilih Bahan --</option>
                        {ingredientMasters.map(m => (
                          <option key={m.id} value={m.id}>{m.name} — stok {formatQty(m.current_stock)} {m.unit}</option>
                        ))}
                      </select>
                    </div>
                    <div className="w-full sm:w-40">
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Qty per 1 pcs</label>
                      <div className="flex">
                        <input
                          type="number" min="0" step="any" required placeholder="100"
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
          <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
            <p className="text-sm text-gray-500 dark:text-gray-400">Klik Edit untuk koreksi stok secara manual jika ada selisih.</p>
          </div>
          <div className="overflow-x-auto">
            {ingredientMasters.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">Belum ada data bahan baku.</div>
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
                  {ingredientMasters.map((master) => {
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Stok Saat Ini ({editingMaster.unit})
                  </label>
                  <input
                    type="number" min="0" step="0.01" required
                    value={editStockValue}
                    onChange={(e) => setEditStockValue(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Stok Minimum ({editingMaster.unit})
                  </label>
                  <input
                    type="number" min="0" step="0.01"
                    value={editMinStock}
                    onChange={(e) => setEditMinStock(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                  />
                </div>
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
                    {editStockValue ? ` · stok total: ${formatQty(parseFloat(editStockValue) * parseFloat(editItemsPerUnit))} ${editBaseUnit}` : ''}
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
