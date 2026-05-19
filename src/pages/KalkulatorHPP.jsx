import { useState, useEffect } from 'react';
import { Calculator, Plus, Trash2, Save, ArrowRight, Search, X, Check, Tags, Edit2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Toast from '../components/ui/Toast';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { deleteToppingRecipeFromSupabase, fetchToppingRecipes, saveToppingRecipeToSupabase } from '../lib/toppings';
import {
  averageIngredientsForSelection,
  getIngredientBaseUnit,
  getIngredientDisplayPrice,
  getIngredientPriceForUnit,
  normalizeIngredientName,
} from '../lib/ingredientCosts';

const DRAFT_KEY = 'hpp_draft';

const loadDraft = () => {
  try {
    const saved = localStorage.getItem(DRAFT_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
};

const getBaseUnit = (ingredient) => {
  if (!ingredient) return 'gr';
  return getIngredientBaseUnit(ingredient);
};

const getDisplayPrice = (ingredient) => {
  if (!ingredient) return { price: 0, unit: 'gr' };
  return getIngredientDisplayPrice(ingredient);
};

const IngredientCombobox = ({ item, ingredients, onSelect, placement = 'bottom' }) => {
  const selected = ingredients.find(i => i.id === item.ingredient_id);
  const [query, setQuery] = useState(selected?.name || '');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(selected?.name || '');
  }, [selected?.id, selected?.name]);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = ingredients
    .filter(ing => {
      if (!normalizedQuery) return true;
      return [
        ing.name,
        ing.category,
        ing.supplier,
        ing.unit,
        ing.base_unit,
      ].filter(Boolean).some(value => String(value).toLowerCase().includes(normalizedQuery));
    })
    .slice(0, 8);

  return (
    <div className="relative">
      <div className={`flex items-center gap-2 bg-white dark:bg-gray-900 border rounded-lg transition-colors ${open ? 'border-primary-500 ring-2 ring-primary-500/10' : 'border-gray-200 dark:border-gray-700'}`}>
        <Search size={15} className="ml-3 text-gray-400 shrink-0" />
        <input
          type="text"
          value={query}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          placeholder="Ketik nama bahan..."
          className="w-full min-w-0 bg-transparent py-2 pr-1 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 outline-none"
        />
        {selected && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onSelect(null);
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
          {ingredients.length === 0 ? (
            <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
              Belum ada bahan. Catat pembelian bahan dulu di Modal Bahan.
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
              Tidak ada bahan yang cocok.
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto py-1">
              {filtered.map(ing => {
                const price = getDisplayPrice(ing);
                const isSelected = ing.id === item.ingredient_id;
                return (
                  <button
                    key={ing.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onSelect(ing);
                      setQuery(ing.name);
                      setOpen(false);
                    }}
                    className="w-full px-3 py-2.5 text-left hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{ing.name}</span>
                          {isSelected && <Check size={14} className="text-primary-600 shrink-0" />}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                          <span>{ing.category || 'Tanpa kategori'}</span>
                          <span>Rp {Math.round(price.price).toLocaleString('id-ID')}/{price.unit}</span>
                          {ing._purchaseCount > 1 && <span>rata-rata {ing._purchaseCount} pembelian</span>}
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

export default function KalkulatorHPP() {
  const draft = loadDraft();
  const location = useLocation();
  const navigate = useNavigate();

  const [ingredients, setIngredients] = useState([]);
  const [products, setProducts] = useState([]);
  const [recipeName, setRecipeName] = useState(draft?.recipeName || '');
  const [recipeItems, setRecipeItems] = useState(
    draft?.recipeItems?.length
      ? draft.recipeItems
      : [{ id: Date.now(), ingredient_id: '', used_qty: '', used_unit: 'gr' }]
  );
  const [margin, setMargin] = useState(draft?.margin ?? 50);
  const [overhead, setOverhead] = useState(draft?.overhead ?? 5);
  const [batchSize, setBatchSize] = useState(draft?.batchSize ?? 1);
  const [selectedProductId, setSelectedProductId] = useState(draft?.selectedProductId || '');
  const [activeTab, setActiveTab] = useState(draft?.activeTab || 'produk');
  const [toppingName, setToppingName] = useState(draft?.toppingName || '');
  const [toppingItems, setToppingItems] = useState(
    draft?.toppingItems?.length
      ? draft.toppingItems
      : [{ id: Date.now() + 1, ingredient_id: '', used_qty: '', used_unit: 'gr' }]
  );
  const [toppingBatchSize, setToppingBatchSize] = useState(draft?.toppingBatchSize ?? 1);
  const [toppingOverhead, setToppingOverhead] = useState(draft?.toppingOverhead ?? 5);
  const [toppingMargin, setToppingMargin] = useState(draft?.toppingMargin ?? 50);
  const [savedToppingRecipes, setSavedToppingRecipes] = useState([]);
  const [editingToppingRecipeId, setEditingToppingRecipeId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null, variant: 'danger' });
  const openConfirm = (title, message, onConfirm, variant = 'danger') => setConfirmDialog({ open: true, title, message, onConfirm, variant });
  const closeConfirm = () => setConfirmDialog(d => ({ ...d, open: false }));

  useEffect(() => {
    fetchIngredients();
    fetchProducts();
    fetchSavedToppingRecipes();
  }, []);

  const fetchSavedToppingRecipes = async () => {
    try {
      setSavedToppingRecipes(await fetchToppingRecipes());
    } catch (err) {
      setToast({ message: `Topping Supabase belum siap: ${err.message}`, type: 'error' });
    }
  };

  useEffect(() => {
    const productId = location.state?.productId;
    if (!productId || products.length === 0) return;
    const product = products.find(p => p.id === productId);
    setSelectedProductId(productId);
    if (product && !recipeName) setRecipeName(product.name);
    navigate('/hpp', { replace: true, state: null });
  }, [location.state, products, recipeName, navigate]);

  // Auto-save draft ke localStorage setiap ada perubahan
  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      recipeName,
      recipeItems,
      margin,
      overhead,
      batchSize,
      selectedProductId,
      activeTab,
      toppingName,
      toppingItems,
      toppingBatchSize,
      toppingOverhead,
      toppingMargin,
    }));
  }, [recipeName, recipeItems, margin, overhead, batchSize, selectedProductId, activeTab, toppingName, toppingItems, toppingBatchSize, toppingOverhead, toppingMargin]);

  const clearDraft = () => {
    setRecipeName('');
    setRecipeItems([{ id: Date.now(), ingredient_id: '', used_qty: '', used_unit: 'gr' }]);
    setMargin(50);
    setOverhead(5);
    setBatchSize(1);
    clearToppingDraft();
    // selectedProductId sengaja tidak di-reset agar tidak perlu pilih ulang
  };

  const clearToppingDraft = () => {
    setToppingName('');
    setToppingItems([{ id: Date.now() + 1, ingredient_id: '', used_qty: '', used_unit: 'gr' }]);
    setToppingBatchSize(1);
    setToppingOverhead(5);
    setToppingMargin(50);
    setEditingToppingRecipeId('');
  };

  const fetchIngredients = async () => {
    const { data } = await supabase
      .from('ingredients')
      .select('*')
      .order('purchase_date', { ascending: false });
    if (!data) return;
    setIngredients(averageIngredientsForSelection(data));
  };

  const fetchProducts = async () => {
    const { data } = await supabase.from('products').select('id, name').order('name');
    if (data) setProducts(data);
  };

  const handleSaveToProduct = async () => {
    if (!selectedProductId || hppPerUnit === 0) return;
    const { error } = await supabase
      .from('products')
      .update({ cost_price: Math.round(hppPerUnit), overhead_pct: overhead })
      .eq('id', selectedProductId);
    if (error) {
      setToast({ message: 'Gagal menyimpan HPP, coba lagi.', type: 'error' });
    } else {
      setToast({ message: 'HPP berhasil disimpan ke produk!', type: 'success' });
      clearDraft();
    }
  };

  const handleSaveHPPAndRecipe = async () => {
    if (!selectedProductId || hppPerUnit === 0) return;
    setIsSaving(true);

    // 1. Simpan HPP ke produk
    const { error: hppError } = await supabase
      .from('products')
      .update({ cost_price: Math.round(hppPerUnit), overhead_pct: overhead })
      .eq('id', selectedProductId);
    if (hppError) {
      setToast({ message: 'Gagal menyimpan HPP, coba lagi.', type: 'error' });
      setIsSaving(false);
      return;
    }

    // 2. Ambil semua ingredient_masters sekaligus untuk mapping nama → id
    const { data: masters } = await supabase.from('ingredient_masters').select('id, name');
    const masterMap = {};
    (masters || []).forEach(m => { masterMap[m.name.trim().toLowerCase()] = m.id; });

    const validItems = recipeItems.filter(i => i.ingredient_id && parseFloat(i.used_qty) > 0);
    const insertData = validItems.map(item => {
      const ing = ingredients.find(i => i.id === item.ingredient_id);
      if (!ing) return null;
      const masterId = masterMap[ing.name.trim().toLowerCase()];
      if (!masterId) return null;
      return {
        product_id: selectedProductId,
        ingredient_master_id: masterId,
        quantity_per_unit: parseFloat(item.used_qty) / (batchSize || 1),
        unit: item.used_unit
      };
    }).filter(Boolean);

    if (validItems.length !== insertData.length) {
      setToast({ message: 'Sebagian bahan belum punya master stok. Resep lama tidak diubah.', type: 'error' });
      setIsSaving(false);
      return;
    }

    if (insertData.length > 0) {
      const { error: upsertError } = await supabase
        .from('recipes')
        .upsert(insertData, { onConflict: 'product_id,ingredient_master_id' });
      if (upsertError) {
        setToast({ message: 'Gagal menyimpan resep. Resep lama tidak dihapus.', type: 'error' });
        setIsSaving(false);
        return;
      }

      const masterIds = insertData.map(item => item.ingredient_master_id);
      const { error: deleteStaleError } = await supabase
        .from('recipes')
        .delete()
        .eq('product_id', selectedProductId)
        .not('ingredient_master_id', 'in', `(${masterIds.join(',')})`);
      if (deleteStaleError) {
        setToast({ message: 'Resep tersimpan, tapi bahan lama gagal dibersihkan.', type: 'error' });
        setIsSaving(false);
        return;
      }
    }

    setToast({ message: 'HPP & resep berhasil disimpan ke produk!', type: 'success' });
    clearDraft();
    setIsSaving(false);
  };

  const handleAddItem = () => {
    setRecipeItems([...recipeItems, { id: Date.now(), ingredient_id: '', used_qty: '', used_unit: 'gr' }]);
  };

  const handleRemoveItem = (id) => {
    setRecipeItems(recipeItems.filter(item => item.id !== id));
  };

  const handleItemChange = (id, field, value) => {
    setRecipeItems(recipeItems.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const handleIngredientSelect = (id, ingredient) => {
    setRecipeItems(recipeItems.map(item => {
      if (item.id !== id) return item;
      if (!ingredient) return { ...item, ingredient_id: '', used_unit: 'gr' };
      return { ...item, ingredient_id: ingredient.id, used_unit: getBaseUnit(ingredient) };
    }));
  };

  const handleAddToppingItem = () => {
    setToppingItems([...toppingItems, { id: Date.now(), ingredient_id: '', used_qty: '', used_unit: 'gr' }]);
  };

  const handleRemoveToppingItem = (id) => {
    setToppingItems(toppingItems.filter(item => item.id !== id));
  };

  const handleToppingItemChange = (id, field, value) => {
    setToppingItems(toppingItems.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const handleToppingIngredientSelect = (id, ingredient) => {
    setToppingItems(toppingItems.map(item => {
      if (item.id !== id) return item;
      if (!ingredient) return { ...item, ingredient_id: '', used_unit: 'gr' };
      return { ...item, ingredient_id: ingredient.id, used_unit: getBaseUnit(ingredient) };
    }));
  };

  const handleSaveToppingRecipe = async () => {
    setIsSaving(true);
    const { data: masters, error: mastersError } = await supabase
      .from('ingredient_masters')
      .select('id, name');

    if (mastersError) {
      setToast({ message: 'Gagal membaca master bahan topping.', type: 'error' });
      setIsSaving(false);
      return;
    }

    const masterMap = Object.fromEntries(
      (masters || []).map(master => [normalizeIngredientName(master.name), master])
    );
    const validItems = toppingItems
      .filter(item => item.ingredient_id && parseFloat(item.used_qty) > 0)
      .map(item => {
        const ingredient = ingredients.find(ing => ing.id === item.ingredient_id);
        if (!ingredient) return null;
        const master = masterMap[normalizeIngredientName(ingredient.name)];
        if (!master) return null;
        return {
          ingredient_master_id: master.id,
          ingredient_name: ingredient.name,
          quantity_per_unit: parseFloat(item.used_qty) / (toppingBatchSize || 1),
          unit: item.used_unit,
          cost_per_unit: calculateRowCost(item) / (toppingBatchSize || 1),
        };
      })
      .filter(Boolean);

    if (!toppingName.trim()) {
      setToast({ message: 'Nama topping wajib diisi dulu.', type: 'error' });
      setIsSaving(false);
      return;
    }
    if (validItems.length === 0 || toppingHppPerUnit === 0) {
      setToast({ message: 'Pilih bahan topping yang sudah punya master bahan, lalu isi jumlahnya.', type: 'error' });
      setIsSaving(false);
      return;
    }

    try {
      const existingRecipe = savedToppingRecipes.find(recipe => (
        normalizeIngredientName(recipe.name) === normalizeIngredientName(toppingName)
      ));
      const savedRecipe = await saveToppingRecipeToSupabase({
        id: editingToppingRecipeId || existingRecipe?.id,
        name: toppingName,
        batch_size: toppingBatchSize,
        overhead_pct: toppingOverhead,
        margin_pct: toppingMargin,
        hpp_per_unit: toppingHppPerUnit,
        suggested_price: suggestedToppingPrice,
        items: validItems,
      });
      setEditingToppingRecipeId(savedRecipe.id);
      await fetchSavedToppingRecipes();
      setToast({ message: 'HPP topping berhasil disimpan ke Supabase.', type: 'success' });
    } catch (err) {
      setToast({ message: `Gagal simpan topping: ${err.message}`, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditToppingRecipe = (recipe) => {
    setEditingToppingRecipeId(recipe.id);
    setActiveTab('topping');
    setToppingName(recipe.name);
    setToppingBatchSize(recipe.batch_size || 1);
    setToppingOverhead(recipe.overhead_pct || 0);
    setToppingMargin(recipe.margin_pct || 0);
    setToppingItems(recipe.items.map((item, index) => {
      const ingredient = ingredients.find(ing => normalizeIngredientName(ing.name) === item.ingredient_key);
      return {
        id: `${recipe.id}-${item.id || index}`,
        ingredient_id: ingredient?.id || '',
        used_qty: item.quantity_per_unit * (recipe.batch_size || 1),
        used_unit: item.unit || 'gr',
      };
    }));
    setToast({ message: `Template ${recipe.name} siap diedit.`, type: 'info' });
  };

  const handleDeleteToppingRecipe = (recipe) => {
    openConfirm(
      'Hapus Template Topping?',
      `Template "${recipe.name}" akan dihapus dari Supabase.`,
      async () => {
        try {
          await deleteToppingRecipeFromSupabase(recipe.id);
          if (editingToppingRecipeId === recipe.id) setEditingToppingRecipeId('');
          await fetchSavedToppingRecipes();
          setToast({ message: 'Template topping berhasil dihapus.', type: 'success' });
        } catch (err) {
          setToast({ message: `Gagal hapus topping: ${err.message}`, type: 'error' });
        }
      },
      'danger'
    );
  };

  // Hitung harga per satuan dasar (gr atau ml) dari data pembelian
  const getNormalizedPricePerUnit = (ingredient, targetUnit) => {
    if (ingredient?.__pricePerBase !== undefined) {
      return getIngredientPriceForUnit(ingredient, targetUnit);
    }
    if (!ingredient) return 0;

    // Kasus 1: beli per kemasan (pack/bungkus/botol/kaleng) dengan isi yang diketahui
    // Contoh: 1 pack santan 65ml → items_per_unit=65, base_unit='ml'
    if (ingredient.items_per_unit && ingredient.base_unit) {
      const pricePerBase = ingredient.unit_price / ingredient.items_per_unit;
      if (targetUnit === 'kg' || targetUnit === 'liter') return pricePerBase * 1000;
      return pricePerBase;
    }

    // Kasus 2: beli per kg atau liter → konversi ke gr/ml
    // unit_price adalah total harga pembelian, jadi dibagi total gr/ml yang dibeli.
    if (ingredient.unit === 'kg' || ingredient.unit === 'liter') {
      const qtyBase = (ingredient.quantity || 0) * 1000;
      const pricePerBase = qtyBase > 0 ? ingredient.unit_price / qtyBase : 0;
      if (targetUnit === 'kg' || targetUnit === 'liter') return pricePerBase * 1000;
      return pricePerBase;
    }

    // Kasus 3: beli per gr, ml, pcs — langsung pakai unit_price
    if (ingredient.unit === 'gr' || ingredient.unit === 'ml') {
      const pricePerBase = ingredient.quantity > 0 ? ingredient.unit_price / ingredient.quantity : 0;
      if (targetUnit === 'kg' || targetUnit === 'liter') return pricePerBase * 1000;
      return pricePerBase;
    }

    if (targetUnit === 'kg' || targetUnit === 'liter') return ingredient.unit_price * 1000;
    return ingredient.unit_price;
  };

  const calculateRowCost = (item) => {
    const qty = parseFloat(item.used_qty);
    if (!item.ingredient_id || !qty) return 0;
    const ing = ingredients.find(i => i.id === item.ingredient_id);
    if (!ing) return 0;

    const pricePerUnit = getNormalizedPricePerUnit(ing, item.used_unit);
    return pricePerUnit * qty;
  };

  const totalHPP = recipeItems.reduce((acc, item) => acc + calculateRowCost(item), 0);
  const overheadAmount = totalHPP * ((overhead || 0) / 100);
  const totalHPPWithOverhead = totalHPP + overheadAmount;
  const hppPerUnit = totalHPPWithOverhead / (batchSize || 1);
  const suggestedPrice = hppPerUnit + (hppPerUnit * (margin / 100));
  const totalToppingHPP = toppingItems.reduce((acc, item) => acc + calculateRowCost(item), 0);
  const toppingOverheadAmount = totalToppingHPP * ((toppingOverhead || 0) / 100);
  const totalToppingWithOverhead = totalToppingHPP + toppingOverheadAmount;
  const toppingHppPerUnit = totalToppingWithOverhead / (toppingBatchSize || 1);
  const suggestedToppingPrice = toppingHppPerUnit + (toppingHppPerUnit * (toppingMargin / 100));
  const hasProductDraft = recipeName || recipeItems.some(i => i.ingredient_id || i.used_qty);
  const hasToppingDraft = toppingName || toppingItems.some(i => i.ingredient_id || i.used_qty);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Kalkulator HPP</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Hitung Harga Pokok Penjualan berdasarkan gramasi resep.</p>
        </div>
        {(hasProductDraft || hasToppingDraft) && (
          <button
            onClick={() => openConfirm('Reset Kalkulator?', 'Semua input akan dihapus dan tidak bisa dikembalikan.', clearDraft, 'warning')}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-red-500 transition-colors"
          >
            <Trash2 size={15} /> Reset Kalkulator
          </button>
        )}
      </div>

      <div className="inline-flex gap-1 rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
        {[
          { id: 'produk', label: 'HPP Produk', icon: Calculator },
          { id: 'topping', label: 'HPP Topping', icon: Tags },
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${activeTab === tab.id ? 'bg-white dark:bg-gray-900 text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
            >
              <Icon size={15} /> {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'produk' ? (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
            <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Nama Resep / Produk</label>
                <input
                  type="text"
                  placeholder="Cth: Resep Brownies 1 Loyang"
                  value={recipeName}
                  onChange={(e) => setRecipeName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Dihasilkan (pcs)</label>
                <input
                  type="number" min="1" step="1"
                  value={batchSize}
                  onChange={(e) => setBatchSize(e.target.value === '' ? 1 : parseInt(e.target.value) || 1)}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none transition-colors"
                />
                <p className="text-xs text-gray-400 mt-1">Contoh: vla 60 gr untuk 12 cup, isi 12 di sini.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
                <h3 className="font-bold text-gray-900 dark:text-white">Bahan-bahan</h3>
                <button 
                  onClick={handleAddItem}
                  className="flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700"
                >
                  <Plus size={16} /> Tambah Bahan
                </button>
              </div>

              {recipeItems.map((item, index) => (
                <div key={item.id} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_13rem_8rem_auto] gap-4 items-end p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800">
                  <div className="flex-1 w-full">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Pilih Bahan</label>
                    <IngredientCombobox
                      item={item}
                      ingredients={ingredients}
                      placement={recipeItems.length > 1 && index >= recipeItems.length - 2 ? 'top' : 'bottom'}
                      onSelect={(ingredient) => handleIngredientSelect(item.id, ingredient)}
                    />
                  </div>
                  
                  <div className="w-full">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Gramasi/Jumlah batch</label>
                    <div className="flex">
                      <input
                        type="number" min="0" step="any"
                        value={item.used_qty}
                        onChange={(e) => handleItemChange(item.id, 'used_qty', e.target.value)}
                        className="w-full min-w-0 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-l-lg text-sm focus:border-primary-500 outline-none"
                      />
                      <select
                        value={item.used_unit}
                        onChange={(e) => handleItemChange(item.id, 'used_unit', e.target.value)}
                        className="shrink-0 w-20 px-1 bg-gray-100 dark:bg-gray-800 border border-l-0 border-gray-200 dark:border-gray-700 rounded-r-lg text-sm outline-none"
                      >
                        <option value="gr">gr</option>
                        <option value="kg">kg</option>
                        <option value="ml">ml</option>
                        <option value="liter">L</option>
                        <option value="pcs">pcs</option>
                        <option value="lembar">lembar</option>
                        <option value="bungkus">bungkus</option>
                        <option value="botol">botol</option>
                        <option value="kaleng">kaleng</option>
                        <option value="pack">pack</option>
                      </select>
                    </div>
                  </div>

                  <div className="w-full">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Biaya</label>
                    <div className="px-3 py-2 bg-gray-100 dark:bg-gray-900 border border-transparent rounded-lg text-sm font-medium text-gray-900 dark:text-gray-100">
                      Rp {Math.round(calculateRowCost(item)).toLocaleString('id-ID')}
                    </div>
                  </div>

                  <button 
                    onClick={() => handleRemoveItem(item.id)}
                    className="p-2 text-gray-400 hover:text-red-600 transition-colors mb-0.5"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}

            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 sticky top-24">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100 dark:border-gray-800">
              <div className="p-2.5 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 rounded-xl">
                <Calculator size={24} />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Hasil Kalkulasi</h2>
            </div>

            <div className="space-y-4">
              {/* Rincian per bahan */}
              {totalHPP > 0 && (
                <div className="space-y-2">
                  {recipeItems.filter(item => calculateRowCost(item) > 0).map(item => {
                    const ing = ingredients.find(i => i.id === item.ingredient_id);
                    const cost = calculateRowCost(item);
                    const pct = totalHPP > 0 ? (cost / totalHPP) * 100 : 0;
                    return (
                      <div key={item.id}>
                        <div className="flex justify-between items-center text-xs mb-0.5">
                          <span className="text-gray-600 dark:text-gray-400 truncate max-w-[60%]">{ing?.name ?? '—'}</span>
                          <span className="text-gray-700 dark:text-gray-300 font-medium shrink-0">
                            Rp {Math.round(cost).toLocaleString('id-ID')}
                            <span className="text-gray-400 ml-1">({Math.round(pct)}%)</span>
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
                          <div
                            className="bg-primary-400 dark:bg-primary-500 h-1.5 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {overheadAmount > 0 && (
                    <div>
                      <div className="flex justify-between items-center text-xs mb-0.5">
                        <span className="text-amber-600 dark:text-amber-400">Overhead ({overhead}%)</span>
                        <span className="text-amber-600 dark:text-amber-400 font-medium">
                          Rp {Math.round(overheadAmount).toLocaleString('id-ID')}
                          <span className="text-amber-400/70 ml-1">({Math.round((overheadAmount / totalHPPWithOverhead) * 100)}%)</span>
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
                        <div
                          className="bg-amber-400 dark:bg-amber-500 h-1.5 rounded-full"
                          style={{ width: `${(overheadAmount / totalHPPWithOverhead) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                  <div className="border-t border-gray-100 dark:border-gray-800 pt-2" />
                </div>
              )}

              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Total HPP (1 resep)</span>
                <span className="font-semibold text-gray-700 dark:text-gray-300">
                  Rp {Math.round(totalHPPWithOverhead).toLocaleString('id-ID')}
                </span>
              </div>

              <div>
                <label className="flex justify-between items-center text-sm text-gray-500 mb-2">
                  <span>Overhead <span className="text-xs text-gray-400">(gas, air, listrik, dll)</span></span>
                  <span className="font-medium text-amber-600 dark:text-amber-400">{overhead}%</span>
                </label>
                <input
                  type="range" min="0" max="30" step="1"
                  value={overhead}
                  onChange={(e) => setOverhead(parseInt(e.target.value))}
                  className="w-full accent-amber-500"
                />
              </div>

              <div className="flex justify-between items-center p-3 bg-primary-50 dark:bg-primary-900/20 rounded-xl">
                <span className="text-sm font-medium text-primary-700 dark:text-primary-300">HPP per unit ({batchSize} pcs)</span>
                <span className="text-lg font-bold text-primary-700 dark:text-primary-300">
                  Rp {Math.round(hppPerUnit).toLocaleString('id-ID')}
                </span>
              </div>

              <div>
                <label className="flex justify-between items-center text-sm text-gray-500 mb-2">
                  <span>Target Margin Keuntungan</span>
                  <span className="font-medium text-primary-600 dark:text-primary-400">{margin}%</span>
                </label>
                <input
                  type="range" min="0" max="200" step="5"
                  value={margin}
                  onChange={(e) => setMargin(e.target.value === '' ? '' : parseInt(e.target.value))}
                  className="w-full accent-primary-600"
                />
              </div>

              <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                <span className="block text-sm text-gray-500 mb-1">Saran Harga Jual / pcs</span>
                <span className="block text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                  Rp {Math.round(suggestedPrice).toLocaleString('id-ID')}
                </span>
                <span className="block text-xs text-gray-400 mt-1">
                  Potensi untung: Rp {Math.round(suggestedPrice - hppPerUnit).toLocaleString('id-ID')} / pcs
                  {batchSize > 1 && ` · Rp ${Math.round((suggestedPrice - hppPerUnit) * batchSize).toLocaleString('id-ID')} / resep`}
                </span>
              </div>
            </div>

            <div className="mt-8 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Simpan HPP ke Produk</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => {
                    setSelectedProductId(e.target.value);
                    const p = products.find(p => p.id === e.target.value);
                    if (p) setRecipeName(p.name);
                  }}
                  className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                >
                  <option value="">-- Pilih Produk --</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleSaveHPPAndRecipe}
                disabled={!selectedProductId || hppPerUnit === 0 || isSaving}
                className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl text-sm font-medium transition-colors shadow-sm shadow-primary-600/20"
              >
                {isSaving
                  ? <><ArrowRight size={18} className="animate-pulse" /> Menyimpan...</>
                  : <><Save size={18} /> Simpan HPP + Resep ke Produk</>}
              </button>

              <button
                onClick={handleSaveToProduct}
                disabled={!selectedProductId || hppPerUnit === 0 || isSaving}
                className="w-full flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 py-2 rounded-xl text-xs font-medium transition-colors"
              >
                <Save size={14} /> HPP saja (tanpa update resep)
              </button>
            </div>
          </div>
        </div>
      </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
              <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Nama Topping</label>
                  <input
                    type="text"
                    placeholder="Cth: Keju parut, vla, coklat crumble"
                    value={toppingName}
                    onChange={(e) => setToppingName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Dihasilkan</label>
                  <input
                    type="number" min="1" step="1"
                    value={toppingBatchSize}
                    onChange={(e) => setToppingBatchSize(e.target.value === '' ? 1 : parseInt(e.target.value) || 1)}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none transition-colors"
                  />
                  <p className="text-xs text-gray-400 mt-1">Jumlah porsi topping yang dihasilkan.</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
                  <h3 className="font-bold text-gray-900 dark:text-white">Bahan topping</h3>
                  <button
                    type="button"
                    onClick={handleAddToppingItem}
                    className="flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700"
                  >
                    <Plus size={16} /> Tambah Bahan
                  </button>
                </div>

                {toppingItems.map((item, index) => (
                  <div key={item.id} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_13rem_8rem_auto] gap-4 items-end p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800">
                    <div className="flex-1 w-full">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Pilih Bahan</label>
                      <IngredientCombobox
                        item={item}
                        ingredients={ingredients}
                        placement={toppingItems.length > 1 && index >= toppingItems.length - 2 ? 'top' : 'bottom'}
                        onSelect={(ingredient) => handleToppingIngredientSelect(item.id, ingredient)}
                      />
                    </div>

                    <div className="w-full">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Jumlah batch</label>
                      <div className="flex">
                        <input
                          type="number" min="0" step="any"
                          value={item.used_qty}
                          onChange={(e) => handleToppingItemChange(item.id, 'used_qty', e.target.value)}
                          className="w-full min-w-0 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-l-lg text-sm focus:border-primary-500 outline-none"
                        />
                        <select
                          value={item.used_unit}
                          onChange={(e) => handleToppingItemChange(item.id, 'used_unit', e.target.value)}
                          className="shrink-0 w-20 px-1 bg-gray-100 dark:bg-gray-800 border border-l-0 border-gray-200 dark:border-gray-700 rounded-r-lg text-sm outline-none"
                        >
                          <option value="gr">gr</option>
                          <option value="kg">kg</option>
                          <option value="ml">ml</option>
                          <option value="liter">L</option>
                          <option value="pcs">pcs</option>
                          <option value="lembar">lembar</option>
                          <option value="bungkus">bungkus</option>
                          <option value="botol">botol</option>
                          <option value="kaleng">kaleng</option>
                          <option value="pack">pack</option>
                        </select>
                      </div>
                    </div>

                    <div className="w-full">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Biaya</label>
                      <div className="px-3 py-2 bg-gray-100 dark:bg-gray-900 border border-transparent rounded-lg text-sm font-medium text-gray-900 dark:text-gray-100">
                        Rp {Math.round(calculateRowCost(item)).toLocaleString('id-ID')}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveToppingItem(item.id)}
                      className="p-2 text-gray-400 hover:text-red-600 transition-colors mb-0.5"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 sticky top-24">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100 dark:border-gray-800">
                <div className="p-2.5 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 rounded-xl">
                  <Tags size={24} />
                </div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Hasil Topping</h2>
              </div>

              <div className="space-y-4">
                {totalToppingHPP > 0 && (
                  <div className="space-y-2">
                    {toppingItems.filter(item => calculateRowCost(item) > 0).map(item => {
                      const ing = ingredients.find(i => i.id === item.ingredient_id);
                      const cost = calculateRowCost(item);
                      const pct = totalToppingHPP > 0 ? (cost / totalToppingHPP) * 100 : 0;
                      return (
                        <div key={item.id}>
                          <div className="flex justify-between items-center text-xs mb-0.5">
                            <span className="text-gray-600 dark:text-gray-400 truncate max-w-[60%]">{ing?.name ?? '-'}</span>
                            <span className="text-gray-700 dark:text-gray-300 font-medium shrink-0">
                              Rp {Math.round(cost).toLocaleString('id-ID')}
                              <span className="text-gray-400 ml-1">({Math.round(pct)}%)</span>
                            </span>
                          </div>
                          <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
                            <div className="bg-primary-400 dark:bg-primary-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                    <div className="border-t border-gray-100 dark:border-gray-800 pt-2" />
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Total HPP topping</span>
                  <span className="font-semibold text-gray-700 dark:text-gray-300">
                    Rp {Math.round(totalToppingWithOverhead).toLocaleString('id-ID')}
                  </span>
                </div>

                <div>
                  <label className="flex justify-between items-center text-sm text-gray-500 mb-2">
                    <span>Overhead</span>
                    <span className="font-medium text-amber-600 dark:text-amber-400">{toppingOverhead}%</span>
                  </label>
                  <input
                    type="range" min="0" max="30" step="1"
                    value={toppingOverhead}
                    onChange={(e) => setToppingOverhead(parseInt(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                </div>

                <div className="flex justify-between items-center p-3 bg-primary-50 dark:bg-primary-900/20 rounded-xl">
                  <span className="text-sm font-medium text-primary-700 dark:text-primary-300">HPP per porsi ({toppingBatchSize})</span>
                  <span className="text-lg font-bold text-primary-700 dark:text-primary-300">
                    Rp {Math.round(toppingHppPerUnit).toLocaleString('id-ID')}
                  </span>
                </div>

                <div>
                  <label className="flex justify-between items-center text-sm text-gray-500 mb-2">
                    <span>Target Margin</span>
                    <span className="font-medium text-primary-600 dark:text-primary-400">{toppingMargin}%</span>
                  </label>
                  <input
                    type="range" min="0" max="200" step="5"
                    value={toppingMargin}
                    onChange={(e) => setToppingMargin(e.target.value === '' ? '' : parseInt(e.target.value))}
                    className="w-full accent-primary-600"
                  />
                </div>

                <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                  <span className="block text-sm text-gray-500 mb-1">Saran harga topping / porsi</span>
                  <span className="block text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                    Rp {Math.round(suggestedToppingPrice).toLocaleString('id-ID')}
                  </span>
                  <span className="block text-xs text-gray-400 mt-1">
                    Potensi untung: Rp {Math.round(suggestedToppingPrice - toppingHppPerUnit).toLocaleString('id-ID')} / porsi
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleSaveToppingRecipe}
                  disabled={!toppingName.trim() || toppingHppPerUnit === 0 || isSaving}
                  className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
                >
                  <Save size={16} /> {editingToppingRecipeId ? 'Update HPP Topping' : 'Simpan HPP Topping'}
                </button>

                {editingToppingRecipeId && (
                  <button
                    type="button"
                    onClick={clearToppingDraft}
                    className="w-full flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 py-2 rounded-xl text-xs font-medium transition-colors"
                  >
                    <Plus size={14} /> Topping Baru
                  </button>
                )}

                {savedToppingRecipes.length > 0 && (
                  <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Topping tersimpan</p>
                    <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                      {savedToppingRecipes.map(recipe => (
                        <div key={recipe.id} className="rounded-xl bg-gray-50 dark:bg-gray-800/70 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{recipe.name}</span>
                            <span className="shrink-0 text-xs font-semibold text-primary-600 dark:text-primary-400">
                              Rp {Math.round(recipe.hpp_per_unit).toLocaleString('id-ID')}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleEditToppingRecipe(recipe)}
                              className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-white dark:hover:bg-gray-900"
                              aria-label={`Edit ${recipe.name}`}
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteToppingRecipe(recipe)}
                              className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-white dark:hover:bg-gray-900"
                              aria-label={`Hapus ${recipe.name}`}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <p className="mt-0.5 text-xs text-gray-400">{recipe.items.length} bahan, update {new Date(recipe.updated_at).toLocaleDateString('id-ID')}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: '', type: 'success' })}
      />
      <ConfirmDialog isOpen={confirmDialog.open} title={confirmDialog.title} message={confirmDialog.message} variant={confirmDialog.variant} onConfirm={() => { closeConfirm(); confirmDialog.onConfirm?.(); }} onCancel={closeConfirm} />
    </div>
  );
}
