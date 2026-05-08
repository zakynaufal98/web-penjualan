import { useState, useEffect } from 'react';
import { Calculator, Plus, Trash2, Save, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function KalkulatorHPP() {
  const [ingredients, setIngredients] = useState([]);
  const [recipeName, setRecipeName] = useState('');
  const [recipeItems, setRecipeItems] = useState([
    { id: Date.now(), ingredient_id: '', used_qty: 0, used_unit: 'gr' }
  ]);
  const [margin, setMargin] = useState(50); // Default 50% margin

  useEffect(() => {
    fetchIngredients();
  }, []);

  const fetchIngredients = async () => {
    const { data } = await supabase.from('ingredients').select('*').order('name');
    if (data) setIngredients(data);
  };

  const handleAddItem = () => {
    setRecipeItems([...recipeItems, { id: Date.now(), ingredient_id: '', used_qty: 0, used_unit: 'gr' }]);
  };

  const handleRemoveItem = (id) => {
    setRecipeItems(recipeItems.filter(item => item.id !== id));
  };

  const handleItemChange = (id, field, value) => {
    setRecipeItems(recipeItems.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  // Unit conversion to a base common unit (assuming base is gram/ml)
  const getNormalizedPricePerUnit = (ingredient, targetUnit) => {
    if (!ingredient) return 0;
    
    // Normalize purchase quantity to grams or ml
    let purchaseQtyInBase = ingredient.quantity;
    if (ingredient.unit === 'kg' || ingredient.unit === 'liter') {
      purchaseQtyInBase = ingredient.quantity * 1000;
    }

    const pricePerBaseUnit = ingredient.unit_price / purchaseQtyInBase;

    // Convert to requested unit
    if (targetUnit === 'kg' || targetUnit === 'liter') {
      return pricePerBaseUnit * 1000;
    }
    return pricePerBaseUnit; // for gr, ml, pcs
  };

  const calculateRowCost = (item) => {
    if (!item.ingredient_id || !item.used_qty) return 0;
    const ing = ingredients.find(i => i.id === item.ingredient_id);
    if (!ing) return 0;

    const pricePerUnit = getNormalizedPricePerUnit(ing, item.used_unit);
    return pricePerUnit * item.used_qty;
  };

  const totalHPP = recipeItems.reduce((acc, item) => acc + calculateRowCost(item), 0);
  const suggestedPrice = totalHPP + (totalHPP * (margin / 100));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Kalkulator HPP</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Hitung Harga Pokok Penjualan berdasarkan gramasi resep.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Nama Resep / Produk</label>
              <input 
                type="text" 
                placeholder="Cth: Resep Brownies 1 Loyang"
                value={recipeName}
                onChange={(e) => setRecipeName(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none transition-colors"
              />
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
                <div key={item.id} className="flex flex-col sm:flex-row gap-4 items-end p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800">
                  <div className="flex-1 w-full">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Pilih Bahan</label>
                    <select
                      value={item.ingredient_id}
                      onChange={(e) => handleItemChange(item.id, 'ingredient_id', e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:border-primary-500 outline-none"
                    >
                      <option value="">-- Pilih Bahan --</option>
                      {ingredients.map(ing => (
                        <option key={ing.id} value={ing.id}>
                          {ing.name} (Rp {ing.unit_price.toLocaleString('id-ID')} / {ing.quantity}{ing.unit})
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="w-full sm:w-32">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Gramasi/Jumlah</label>
                    <div className="flex">
                      <input
                        type="number" min="0" step="0.1"
                        value={item.used_qty}
                        onChange={(e) => handleItemChange(item.id, 'used_qty', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-l-lg text-sm focus:border-primary-500 outline-none"
                      />
                      <select
                        value={item.used_unit}
                        onChange={(e) => handleItemChange(item.id, 'used_unit', e.target.value)}
                        className="px-2 bg-gray-100 dark:bg-gray-800 border border-l-0 border-gray-200 dark:border-gray-700 rounded-r-lg text-sm outline-none"
                      >
                        <option value="gr">gr</option>
                        <option value="kg">kg</option>
                        <option value="ml">ml</option>
                        <option value="liter">L</option>
                        <option value="pcs">pcs</option>
                        <option value="bungkus">bungkus</option>
                        <option value="botol">botol</option>
                        <option value="kaleng">kaleng</option>
                        <option value="pack">pack</option>
                      </select>
                    </div>
                  </div>

                  <div className="w-full sm:w-32">
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
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Total HPP (Modal)</span>
                <span className="text-lg font-bold text-gray-900 dark:text-white">
                  Rp {Math.round(totalHPP).toLocaleString('id-ID')}
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
                <span className="block text-sm text-gray-500 mb-1">Saran Harga Jual</span>
                <span className="block text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                  Rp {Math.round(suggestedPrice).toLocaleString('id-ID')}
                </span>
                <span className="block text-xs text-gray-400 mt-1">Potensi untung: Rp {Math.round(suggestedPrice - totalHPP).toLocaleString('id-ID')} / resep</span>
              </div>
            </div>

            <div className="mt-8">
              <button className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-xl text-sm font-medium transition-colors shadow-sm shadow-primary-600/20">
                <Save size={18} /> Simpan ke Produk
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
