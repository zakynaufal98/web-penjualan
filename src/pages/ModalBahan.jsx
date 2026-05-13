import { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Trash2, X, Loader2, AlertCircle, Camera, Image as ImageIcon, TrendingDown, TrendingUp, Minus, Lightbulb, BarChart2, Edit2, Wallet } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Toast from '../components/ui/Toast';
import { friendlyError } from '../lib/errorUtils';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { uploadToImgBB } from '../lib/uploadImgBB';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { dateInputToLocalISOString, todayInputValue } from '../lib/dateUtils';

export default function ModalBahan() {
  const [activeTab, setActiveTab] = useState('riwayat');
  const [searchTerm, setSearchTerm] = useState('');
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Cart State
  const [cart, setCart] = useState([]);
  const [transactionInfo, setTransactionInfo] = useState({
    supplier: '',
    receipt_url: '',
    purchase_date: todayInputValue()
  });

  // Current Item Form State
  const [currentItem, setCurrentItem] = useState({
    name: '',
    category: '',
    quantity: 1,
    unit: 'kg',
    unit_price: '',
    content_count: '',   // berapa isi per kemasan (cth: 6 sachet) — UI only
    content_weight: '',  // berat/volume per isi (cth: 60gr) — UI only
    items_per_unit: '',  // total yang disimpan ke DB = content_count × content_weight
    base_unit: 'gr'
  });

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    id: '', name: '', category: '', supplier: '', purchase_date: '',
    quantity: 1, unit: 'kg', unit_price: 0,
    content_count: '', content_weight: '', items_per_unit: '', base_unit: 'gr'
  });
  const [originalEditQty, setOriginalEditQty] = useState(0);
  const [originalEditItem, setOriginalEditItem] = useState(null);

  const [formLoading, setFormLoading] = useState(false);
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [localPreview, setLocalPreview] = useState('');
  const [uploadFailed, setUploadFailed] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });
  const openConfirm = (title, message, onConfirm) => setConfirmDialog({ open: true, title, message, onConfirm });
  const closeConfirm = () => setConfirmDialog(d => ({ ...d, open: false }));
  const getItemTotal = (item) =>
    ['gr', 'ml'].includes(item.unit) ? item.unit_price : item.quantity * item.unit_price;
  const cartTotal = cart.reduce((sum, item) => sum + getItemTotal(item), 0);
  const ingredientSuggestions = useMemo(() => {
    const q = currentItem.name.trim().toLowerCase();
    if (!q) return [];

    const uniqueIngredients = Object.values(ingredients.reduce((acc, curr) => {
      if (!acc[curr.name.toLowerCase()]) acc[curr.name.toLowerCase()] = curr;
      return acc;
    }, {}));

    return uniqueIngredients
      .filter(ing => [ing.name, ing.category, ing.supplier, ing.unit]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(q)))
      .slice(0, 8);
  }, [currentItem.name, ingredients]);

  useEffect(() => {
    fetchIngredients();
  }, []);

  const fetchIngredients = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('ingredients')
      .select('*')
      .order('purchase_date', { ascending: false });
    
    if (error) {
      console.error(error);
    } else {
      setIngredients(data || []);
    }
    setLoading(false);
  };

  const computeItemsPerUnit = (count, weight) => {
    const c = parseFloat(count);
    const w = parseFloat(weight);
    if (!w) return '';
    return isNaN(c) ? w : c * w;
  };

  const handleAddToCart = (e) => {
    e.preventDefault();
    setError('');

    if (!currentItem.name || !currentItem.category || currentItem.quantity <= 0 || currentItem.unit_price < 0) {
      setError('Mohon lengkapi form bahan dengan benar');
      return;
    }

    const computed = computeItemsPerUnit(currentItem.content_count, currentItem.content_weight);
    setCart([...cart, { ...currentItem, items_per_unit: computed, id: Date.now() }]);
    setCurrentItem({ name: '', category: '', quantity: 1, unit: 'kg', unit_price: '', content_count: '', content_weight: '', items_per_unit: '', base_unit: 'gr' });
  };

  const removeFromCart = (id) => {
    setCart(cart.filter(item => item.id !== id));
  };

  const handleSaveAll = async () => {
    if (cart.length === 0) {
      setError('Keranjang masih kosong, tambahkan minimal 1 bahan.');
      return;
    }

    setFormLoading(true);
    setError('');

    const insertData = cart.map(item => ({
      name: item.name,
      category: item.category,
      supplier: transactionInfo.supplier || null,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unit_price,
      items_per_unit: item.items_per_unit ? parseFloat(item.items_per_unit) : null,
      base_unit: item.items_per_unit ? item.base_unit : null,
      receipt_url: transactionInfo.receipt_url || null,
      purchase_date: dateInputToLocalISOString(transactionInfo.purchase_date)
    }));

    const { error: insertError } = await supabase.from('ingredients').insert(insertData);

    if (insertError) {
      setError(friendlyError(insertError));
      setFormLoading(false);
      return;
    }

    // Update ingredient_masters: naikkan stok untuk tiap item yang dibeli
    for (const item of cart) {
      const { data: master } = await supabase
        .from('ingredient_masters')
        .select('id, current_stock')
        .eq('name', item.name.trim())
        .maybeSingle();

      const itemsPerUnit = item.items_per_unit ? parseFloat(item.items_per_unit) : null;
      const baseUnit = itemsPerUnit ? item.base_unit : null;

      if (master) {
        await supabase
          .from('ingredient_masters')
          .update({
            current_stock: (master.current_stock || 0) + item.quantity,
            ...(itemsPerUnit && { items_per_unit: itemsPerUnit, base_unit: baseUnit }),
          })
          .eq('id', master.id);
      } else {
        await supabase
          .from('ingredient_masters')
          .insert({ name: item.name.trim(), category: item.category, unit: item.unit, current_stock: item.quantity, items_per_unit: itemsPerUnit, base_unit: baseUnit });
      }
    }

    setIsModalOpen(false);
    setCart([]);
    setTransactionInfo({ supplier: '', receipt_url: '', purchase_date: todayInputValue() });
    setToast({ message: `${cart.length} bahan berhasil disimpan!`, type: 'success' });
    fetchIngredients();
    setFormLoading(false);
  };

  const handleDelete = (id) => {
    openConfirm(
      'Hapus Riwayat Pembelian?',
      'Stok bahan baku akan dikurangi sesuai jumlah pembelian ini.',
      () => executeDelete(id)
    );
  };

  const executeDelete = async (id) => {
    const item = ingredients.find(i => i.id === id);
    const { error: delError } = await supabase.from('ingredients').delete().eq('id', id);
    if (delError) {
      setToast({ message: 'Gagal menghapus data.', type: 'error' });
      return;
    }
    if (item) {
      const { data: master } = await supabase
        .from('ingredient_masters')
        .select('id, current_stock')
        .eq('name', item.name.trim())
        .maybeSingle();
      if (master) {
        await supabase
          .from('ingredient_masters')
          .update({ current_stock: Math.max(0, (master.current_stock || 0) - item.quantity) })
          .eq('id', master.id);
      }
    }
    setToast({ message: 'Riwayat pembelian dihapus dan stok dikurangi.', type: 'success' });
    fetchIngredients();
  };

  const openEditIngredient = (item) => {
    setEditFormData({
      id: item.id,
      name: item.name,
      category: item.category,
      supplier: item.supplier || '',
      purchase_date: item.purchase_date ? item.purchase_date.split('T')[0] : todayInputValue(),
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unit_price,
      content_count: '',
      content_weight: item.items_per_unit || '',
      items_per_unit: item.items_per_unit || '',
      base_unit: item.base_unit || 'gr'
    });
    setOriginalEditQty(item.quantity);
    setOriginalEditItem(item);
    setIsEditModalOpen(true);
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setError('');
    const computed = computeItemsPerUnit(editFormData.content_count, editFormData.content_weight);
    const itemsPerUnit = computed ? parseFloat(computed) : null;

    const { error: dbError } = await supabase
      .from('ingredients')
      .update({
        name: editFormData.name,
        category: editFormData.category,
        supplier: editFormData.supplier || null,
        quantity: editFormData.quantity,
        unit: editFormData.unit,
        unit_price: editFormData.unit_price,
        items_per_unit: itemsPerUnit,
        base_unit: itemsPerUnit ? editFormData.base_unit : null,
        purchase_date: dateInputToLocalISOString(editFormData.purchase_date)
      })
      .eq('id', editFormData.id);

    if (dbError) {
      setError(friendlyError(dbError));
    } else {
      const oldName = originalEditItem?.name?.trim() || editFormData.name.trim();
      const newName = editFormData.name.trim();

      if (oldName.toLowerCase() === newName.toLowerCase()) {
        const { data: master } = await supabase
          .from('ingredient_masters')
          .select('id, current_stock')
          .eq('name', newName)
          .maybeSingle();

        if (master) {
          const qtyDiff = editFormData.quantity - originalEditQty;
          await supabase
            .from('ingredient_masters')
            .update({
              current_stock: Math.max(0, (master.current_stock || 0) + qtyDiff),
              category: editFormData.category,
              unit: editFormData.unit,
              items_per_unit: itemsPerUnit,
              base_unit: itemsPerUnit ? editFormData.base_unit : null,
            })
            .eq('id', master.id);
        }
      } else {
        const { data: oldMaster } = await supabase
          .from('ingredient_masters')
          .select('id, current_stock')
          .eq('name', oldName)
          .maybeSingle();
        if (oldMaster) {
          await supabase
            .from('ingredient_masters')
            .update({ current_stock: Math.max(0, (oldMaster.current_stock || 0) - originalEditQty) })
            .eq('id', oldMaster.id);
        }

        const { data: newMaster } = await supabase
          .from('ingredient_masters')
          .select('id, current_stock')
          .eq('name', newName)
          .maybeSingle();
        if (newMaster) {
          await supabase
            .from('ingredient_masters')
            .update({
              current_stock: (newMaster.current_stock || 0) + editFormData.quantity,
              category: editFormData.category,
              unit: editFormData.unit,
              items_per_unit: itemsPerUnit,
              base_unit: itemsPerUnit ? editFormData.base_unit : null,
            })
            .eq('id', newMaster.id);
        } else {
          await supabase
            .from('ingredient_masters')
            .insert({
              name: newName,
              category: editFormData.category,
              unit: editFormData.unit,
              current_stock: editFormData.quantity,
              items_per_unit: itemsPerUnit,
              base_unit: itemsPerUnit ? editFormData.base_unit : null,
            });
        }
      }

      setIsEditModalOpen(false);
      setOriginalEditItem(null);
      setToast({ message: 'Data pembelian berhasil diperbarui!', type: 'success' });
      fetchIngredients();
    }
    setFormLoading(false);
  };

  // ── Perbandingan Harga ──────────────────────────────────────────────────────

  const getPricePerBaseUnit = (ing) => {
    if (ing.items_per_unit && ing.base_unit) {
      return { price: ing.unit_price / ing.items_per_unit, unit: ing.base_unit };
    }
    if (ing.unit === 'kg')    return { price: ing.unit_price / 1000, unit: 'gr' };
    if (ing.unit === 'liter') return { price: ing.unit_price / 1000, unit: 'ml' };
    if (ing.unit === 'gr' || ing.unit === 'ml') return { price: ing.unit_price / ing.quantity, unit: ing.unit };
    return { price: ing.unit_price, unit: ing.unit };
  };

  const comparisonData = useMemo(() => {
    const grouped = {};
    ingredients.forEach(ing => {
      const key = ing.name.trim().toLowerCase();
      if (!grouped[key]) grouped[key] = { name: ing.name, entries: [] };
      grouped[key].entries.push(ing);
    });

    return Object.values(grouped).map(group => {
      const supplierMap = {};
      group.entries.forEach(ing => {
        const supplier = ing.supplier?.trim() || 'Tanpa Supplier';
        const { price, unit } = getPricePerBaseUnit(ing);
        if (!supplierMap[supplier]) supplierMap[supplier] = { supplier, unit, history: [] };
        supplierMap[supplier].history.push({ date: ing.purchase_date, price: Math.round(price * 10) / 10 });
      });

      const suppliers = Object.values(supplierMap).map(s => {
        const sorted = [...s.history].sort((a, b) => new Date(b.date) - new Date(a.date));
        const trend = sorted.length >= 2
          ? sorted[0].price < sorted[1].price ? 'down'
          : sorted[0].price > sorted[1].price ? 'up' : 'flat'
          : 'flat';
        return { ...s, history: sorted, latestPrice: sorted[0].price, latestDate: sorted[0].date, trend };
      }).sort((a, b) => a.latestPrice - b.latestPrice);

      if (suppliers.length === 0) return null;

      const cheapest = suppliers[0];
      const priciest = suppliers[suppliers.length - 1];

      return {
        name: group.name,
        suppliers,
        baseUnit: cheapest.unit,
        cheapestSupplier: cheapest.supplier,
        cheapestPrice: cheapest.latestPrice,
        maxSavingsPerUnit: suppliers.length > 1 ? priciest.latestPrice - cheapest.latestPrice : 0,
        hasMultipleSuppliers: suppliers.length > 1,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.maxSavingsPerUnit - a.maxSavingsPerUnit);
  }, [ingredients]);

  const summaryStats = useMemo(() => {
    const withAlt = comparisonData.filter(d => d.hasMultipleSuppliers);
    const topSavings = withAlt.slice(0, 3);
    // Estimasi penghematan: ambil quantity terbaru dari non-cheapest supplier
    let totalSavingsEstimate = 0;
    withAlt.forEach(item => {
      const nonCheapest = item.suppliers.slice(1);
      nonCheapest.forEach(s => {
        const diff = s.latestPrice - item.cheapestPrice;
        // Estimasi qty: ambil dari riwayat terakhir pembelian di supplier ini
        const lastEntry = ingredients.find(i =>
          i.name.trim().toLowerCase() === item.name.trim().toLowerCase() &&
          (i.supplier?.trim() || 'Tanpa Supplier') === s.supplier
        );
        if (lastEntry) totalSavingsEstimate += diff * (lastEntry.quantity || 1);
      });
    });
    return { withAlt: withAlt.length, topSavings, totalSavingsEstimate: Math.round(totalSavingsEstimate) };
  }, [comparisonData, ingredients]);

  // ── End Perbandingan Harga ──────────────────────────────────────────────────

  const handleCapturePhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    setLocalPreview(objectUrl);
    setUploadFailed(false);
    setIsUploadingReceipt(true);
    setError('');
    try {
      const url = await uploadToImgBB(file);
      setTransactionInfo(prev => ({ ...prev, receipt_url: url }));
    } catch (err) {
      console.error(err);
      setUploadFailed(true);
      setError(err?.message || 'Upload struk gagal. Periksa konfigurasi ImgBB.');
    } finally {
      setIsUploadingReceipt(false);
      URL.revokeObjectURL(objectUrl);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Modal Bahan Baku</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm sm:text-base">Pencatatan pembelian bahan baku kue.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm shadow-primary-600/20"
        >
          <Plus size={18} />
          <span>Tambah Pembelian</span>
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-full sm:w-fit">
        <button
          onClick={() => setActiveTab('riwayat')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'riwayat' ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
        >
          <Search size={15} /> Riwayat Pembelian
        </button>
        <button
          onClick={() => setActiveTab('perbandingan')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'perbandingan' ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
        >
          <BarChart2 size={15} /> Perbandingan Harga
          {summaryStats.withAlt > 0 && (
            <span className="bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 text-xs px-1.5 py-0.5 rounded-full">{summaryStats.withAlt}</span>
          )}
        </button>
      </div>

      {/* ── TAB: Riwayat Pembelian ── */}
      {activeTab === 'riwayat' && (
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
          <div className="relative w-full sm:w-72">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Cari bahan baku..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 rounded-xl text-sm outline-none transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                <th className="p-4 font-medium">Tanggal</th>
                <th className="p-4 font-medium">Nama Bahan</th>
                <th className="p-4 font-medium">Kategori</th>
                <th className="p-4 font-medium">Supplier</th>
                <th className="p-4 font-medium text-right">Jumlah</th>
                <th className="p-4 font-medium text-right">Harga Satuan</th>
                <th className="p-4 font-medium text-right">Total</th>
                <th className="p-4 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
              {loading ? (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-gray-500">Memuat data...</td>
                </tr>
              ) : ingredients.length === 0 ? (
                <tr>
                  <td colSpan="8" className="p-10">
                    <div className="flex flex-col items-center text-center">
                      <Wallet size={40} className="text-gray-300 dark:text-gray-600 mb-3" />
                      <p className="font-semibold text-gray-900 dark:text-gray-100">Belum ada riwayat pembelian</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Catat pembelian bahan agar stok dan HPP bisa dihitung otomatis.</p>
                      <button onClick={() => setIsModalOpen(true)} className="mt-4 inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
                        <Plus size={15} /> Tambah Pembelian
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                ingredients.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase())).map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="p-4 text-gray-500 dark:text-gray-400 whitespace-nowrap">{new Date(item.purchase_date).toLocaleDateString('id-ID')}</td>
                    <td className="p-4 font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">{item.name}</td>
                    <td className="p-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                        {item.category}
                      </span>
                    </td>
                    <td className="p-4 text-gray-500 dark:text-gray-400 whitespace-nowrap">{item.supplier || '-'}</td>
                    <td className="p-4 text-right text-gray-900 dark:text-gray-100 whitespace-nowrap">{item.quantity} {item.unit}</td>
                    <td className="p-4 text-right text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      Rp {item.unit_price.toLocaleString('id-ID')}
                      {['gr','ml'].includes(item.unit) && (
                        <span className="block text-xs text-gray-400">(total beli)</span>
                      )}
                    </td>
                    <td className="p-4 text-right font-medium text-red-600 dark:text-red-400 whitespace-nowrap">
                      Rp {(['gr','ml'].includes(item.unit) ? item.unit_price : item.quantity * item.unit_price).toLocaleString('id-ID')}
                    </td>
                    <td className="p-4 flex items-center gap-1">
                      {item.receipt_url && (
                        <button onClick={() => setSelectedImage(item.receipt_url)} title="Lihat Struk" className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors">
                          <ImageIcon size={16} />
                        </button>
                      )}
                      <button onClick={() => openEditIngredient(item)} title="Edit" className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => handleDelete(item.id)} title="Hapus" className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      )} {/* end tab riwayat */}

      {/* ── TAB: Perbandingan Harga ── */}
      {activeTab === 'perbandingan' && (
        <div className="space-y-6">

          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-100 dark:border-gray-800 shadow-sm">
              <p className="text-sm text-gray-500 mb-1">Bahan dengan alternatif</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{summaryStats.withAlt} <span className="text-sm font-normal text-gray-400">bahan</span></p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-100 dark:border-gray-800 shadow-sm">
              <p className="text-sm text-gray-500 mb-1">Potensi penghematan</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                Rp {summaryStats.totalSavingsEstimate.toLocaleString('id-ID')}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">jika selalu beli di supplier termurah</p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-100 dark:border-gray-800 shadow-sm">
              <p className="text-sm text-gray-500 mb-1">Penghematan terbesar</p>
              {summaryStats.topSavings[0] ? (
                <>
                  <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{summaryStats.topSavings[0].name}</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                    hemat Rp {summaryStats.topSavings[0].maxSavingsPerUnit.toFixed(1)}/{summaryStats.topSavings[0].baseUnit}
                  </p>
                </>
              ) : <p className="text-sm text-gray-400">Belum ada data</p>}
            </div>
          </div>

          {/* Rekomendasi belanja */}
          {summaryStats.topSavings.length > 0 && (
            <div className="bg-primary-50 dark:bg-primary-900/10 border border-primary-100 dark:border-primary-900/30 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb size={18} className="text-primary-600 dark:text-primary-400" />
                <h3 className="font-semibold text-primary-800 dark:text-primary-300 text-sm">Rekomendasi Belanja</h3>
              </div>
              <ul className="space-y-2">
                {summaryStats.topSavings.map(item => (
                  <li key={item.name} className="flex items-start gap-2 text-sm text-primary-700 dark:text-primary-300">
                    <span className="text-primary-400 mt-0.5">→</span>
                    <span>
                      Beli <strong>{item.name}</strong> di <strong>{item.cheapestSupplier}</strong>
                      {' '}(Rp {item.cheapestPrice.toFixed(1)}/{item.baseUnit})
                      {' '}&nbsp;—&nbsp; hemat Rp {item.maxSavingsPerUnit.toFixed(1)}/{item.baseUnit} dibanding opsi termahal
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Kartu per bahan */}
          {loading ? (
            <div className="p-8 text-center text-gray-500">Memuat data...</div>
          ) : comparisonData.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 text-center border border-gray-100 dark:border-gray-800 text-gray-500">
              Belum ada data bahan baku. Tambahkan pembelian terlebih dahulu.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {comparisonData.map(item => (
                <div key={item.name} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                    <h4 className="font-bold text-gray-900 dark:text-white text-sm">{item.name}</h4>
                    {item.hasMultipleSuppliers ? (
                      <span className="text-xs bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium">
                        {item.suppliers.length} supplier
                      </span>
                    ) : (
                      <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full">1 supplier</span>
                    )}
                  </div>
                  <div className="divide-y divide-gray-50 dark:divide-gray-800">
                    {item.suppliers.map((s, idx) => {
                      const isCheapest = idx === 0;
                      const pctMore = isCheapest ? 0 : Math.round(((s.latestPrice - item.cheapestPrice) / item.cheapestPrice) * 100);
                      return (
                        <div key={s.supplier} className={`px-5 py-3 flex items-center justify-between gap-3 ${isCheapest && item.hasMultipleSuppliers ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''}`}>
                          <div className="flex items-center gap-2 min-w-0">
                            {isCheapest && item.hasMultipleSuppliers && (
                              <span className="shrink-0 text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded font-medium">termurah</span>
                            )}
                            <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{s.supplier}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {/* Tren harga */}
                            <span className={`flex items-center gap-0.5 text-xs ${s.trend === 'down' ? 'text-emerald-500' : s.trend === 'up' ? 'text-red-500' : 'text-gray-400'}`}>
                              {s.trend === 'down' ? <TrendingDown size={13} /> : s.trend === 'up' ? <TrendingUp size={13} /> : <Minus size={13} />}
                            </span>
                            <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                              Rp {s.latestPrice.toFixed(1)}<span className="text-xs font-normal text-gray-400">/{item.baseUnit}</span>
                            </span>
                            {!isCheapest && item.hasMultipleSuppliers && (
                              <span className="text-xs text-red-500 dark:text-red-400">+{pctMore}%</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Riwayat harga terakhir */}
                  {item.suppliers.some(s => s.history.length > 1) && (
                    <div className="px-5 py-3 bg-gray-50/50 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-800">
                      <p className="text-xs text-gray-400 mb-1.5">Riwayat pembelian terakhir:</p>
                      <div className="space-y-1">
                        {item.suppliers.flatMap(s =>
                          s.history.slice(0, 2).map((h, i) => (
                            <div key={`${s.supplier}-${i}`} className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                              <span>{s.supplier} · {format(new Date(h.date), 'd MMM yyyy', { locale: localeId })}</span>
                              <span className="font-medium">Rp {h.price.toFixed(1)}/{item.baseUnit}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )} {/* end tab perbandingan */}

      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
      <ConfirmDialog isOpen={confirmDialog.open} title={confirmDialog.title} message={confirmDialog.message} onConfirm={() => { closeConfirm(); confirmDialog.onConfirm?.(); }} onCancel={closeConfirm} />

      {/* Modal Tambah */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 w-full max-w-2xl my-8 sm:my-auto h-fit">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 rounded-t-2xl z-10">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Tambah Pembelian Bahan Baku</h2>
                      <button onClick={() => { setIsModalOpen(false); setLocalPreview(''); setUploadFailed(false); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4 space-y-6">
              {error && (
                <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm flex gap-2">
                  <AlertCircle size={18} /> {error}
                </div>
              )}

              {/* 1. Info Struk & Supplier */}
              <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700/50 space-y-4">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm flex items-center gap-2">
                  <span className="bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 w-6 h-6 rounded-full flex items-center justify-center text-xs">1</span>
                  Info Struk & Toko
                </h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Tanggal Pembelian</label>
                    <input 
                      type="date" required
                      value={transactionInfo.purchase_date}
                      onChange={(e) => setTransactionInfo({...transactionInfo, purchase_date: e.target.value})}
                      className="w-full px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Supplier / Toko</label>
                    <input 
                      type="text" placeholder="Toko Berkah"
                      value={transactionInfo.supplier}
                      onChange={(e) => setTransactionInfo({...transactionInfo, supplier: e.target.value})}
                      className="w-full px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Foto Struk (Opsional)</label>

                  {/* Preview gambar */}
                  {(localPreview || transactionInfo.receipt_url) && (
                    <div className="relative inline-block mb-3">
                      <img
                        src={transactionInfo.receipt_url || localPreview}
                        alt="Struk"
                        className="h-32 rounded-lg border border-gray-200 dark:border-gray-700 object-cover"
                      />
                      {isUploadingReceipt && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg">
                          <Loader2 className="animate-spin text-white" size={24} />
                          <span className="sr-only">Mengupload...</span>
                        </div>
                      )}
                      {!isUploadingReceipt && (
                        <button
                          type="button"
                          onClick={() => {
                            setTransactionInfo(prev => ({ ...prev, receipt_url: '' }));
                            setLocalPreview('');
                            setUploadFailed(false);
                          }}
                          className="absolute -top-2 -right-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-full p-1 shadow-sm transition-colors"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Tombol upload — hanya tampil jika belum ada gambar */}
                  {!localPreview && !transactionInfo.receipt_url && (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                      <label className="flex-1 w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 shadow-sm transition-all cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                        <Camera className="text-gray-400" size={18} />
                        <span>Kamera</span>
                        <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" capture="environment" onChange={handleCapturePhoto} className="hidden" />
                      </label>
                      <label className="flex-1 w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 shadow-sm transition-all cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                        <ImageIcon className="text-gray-400" size={18} />
                        <span>Galeri</span>
                        <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" onChange={handleCapturePhoto} className="hidden" />
                      </label>
                    </div>
                  )}

                  {/* Fallback: input URL manual jika upload gagal */}
                  {uploadFailed && (
                    <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl space-y-2">
                      <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                        Upload otomatis gagal (masalah koneksi SSL). Tempel URL gambar secara manual:
                      </p>
                      <input
                        type="url"
                        placeholder="https://contoh.com/foto-struk.jpg"
                        value={transactionInfo.receipt_url}
                        onChange={(e) => setTransactionInfo(prev => ({ ...prev, receipt_url: e.target.value }))}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-amber-300 dark:border-amber-700 rounded-lg text-sm focus:border-primary-500 outline-none"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* 2. Form Tambah Bahan */}
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm flex items-center gap-2">
                  <span className="bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 w-6 h-6 rounded-full flex items-center justify-center text-xs">2</span>
                  Tambah Barang Belanjaan
                </h3>
                
                <form onSubmit={handleAddToCart} className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-4 shadow-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="relative">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Nama Bahan</label>
                      <input 
                        type="text" placeholder="Cth: Tepung Terigu" required
                        value={currentItem.name}
                        onChange={(e) => {
                          setCurrentItem({...currentItem, name: e.target.value});
                          setShowSuggestions(true);
                        }}
                        onFocus={() => setShowSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                        className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:border-primary-500 outline-none"
                      />
                      {showSuggestions && currentItem.name && (
                        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl shadow-black/10 max-h-64 overflow-y-auto">
                          {ingredientSuggestions.length === 0 ? (
                            <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                              Bahan belum pernah dicatat.
                            </div>
                          ) : (
                            ingredientSuggestions.map(ing => (
                              <button
                                key={ing.id}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                className="w-full px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 text-left text-sm border-b border-gray-50 dark:border-gray-800/50 last:border-0"
                                onClick={() => {
                                  setCurrentItem({
                                    ...currentItem,
                                    name: ing.name,
                                    category: ing.category,
                                    unit: ing.unit,
                                    unit_price: ing.unit_price ?? '',
                                    items_per_unit: ing.items_per_unit || '',
                                    base_unit: ing.base_unit || 'gr',
                                    content_count: '',
                                    content_weight: ing.items_per_unit || '',
                                  });
                                  setShowSuggestions(false);
                                }}
                              >
                                <div className="font-medium text-gray-900 dark:text-gray-100">{ing.name}</div>
                                <div className="text-xs text-gray-500">
                                  {ing.category} • Rp {ing.unit_price.toLocaleString('id-ID')} / {ing.unit}
                                  {ing.items_per_unit ? ` · ${ing.items_per_unit}${ing.base_unit}/${ing.unit}` : ''}
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Kategori</label>
                      <input 
                        type="text" placeholder="Cth: Tepung" required
                        value={currentItem.category}
                        onChange={(e) => setCurrentItem({...currentItem, category: e.target.value})}
                        className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:border-primary-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Jumlah</label>
                      <div className="flex">
                        <input 
                          type="number" min="0.1" step="0.1" required
                          value={currentItem.quantity}
                          onChange={(e) => setCurrentItem({...currentItem, quantity: e.target.value === '' ? '' : parseFloat(e.target.value)})}
                          className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-l-lg text-sm focus:border-primary-500 outline-none"
                        />
                        <select
                          value={currentItem.unit}
                          onChange={(e) => setCurrentItem({
                            ...currentItem,
                            unit: e.target.value,
                            content_count: '',
                            content_weight: '',
                            items_per_unit: '',
                            base_unit: 'gr'
                          })}
                          className="px-2 bg-gray-100 dark:bg-gray-800 border border-l-0 border-gray-200 dark:border-gray-700 rounded-r-lg text-sm outline-none"
                        >
                          <option value="kg">kg</option>
                          <option value="gr">gr</option>
                          <option value="liter">liter</option>
                          <option value="ml">ml</option>
                          <option value="pcs">pcs</option>
                          <option value="lembar">lembar</option>
                          <option value="bungkus">bungkus</option>
                          <option value="botol">botol</option>
                          <option value="kaleng">kaleng</option>
                          <option value="pack">pack</option>
                        </select>
                      </div>

                      {/* Field isi per kemasan — muncul untuk satuan non-dasar */}
                      {!['kg', 'gr', 'liter', 'ml'].includes(currentItem.unit) && (
                        <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg space-y-2">
                          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                            Isi per {currentItem.unit} <span className="font-normal">(opsional, untuk kalkulasi HPP)</span>
                          </p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <input
                              type="number" min="1" step="1"
                              placeholder="jml isi"
                              value={currentItem.content_count}
                              onChange={(e) => setCurrentItem({ ...currentItem, content_count: e.target.value })}
                              className="w-20 px-2 py-1.5 bg-white dark:bg-gray-900 border border-amber-300 dark:border-amber-700 rounded-lg text-xs focus:border-primary-500 outline-none"
                            />
                            <span className="text-xs text-amber-600 dark:text-amber-400">×</span>
                            <input
                              type="number" min="0.1" step="0.1"
                              placeholder="berat/vol"
                              value={currentItem.content_weight}
                              onChange={(e) => setCurrentItem({ ...currentItem, content_weight: e.target.value })}
                              className="w-24 px-2 py-1.5 bg-white dark:bg-gray-900 border border-amber-300 dark:border-amber-700 rounded-lg text-xs focus:border-primary-500 outline-none"
                            />
                            <select
                              value={currentItem.base_unit}
                              onChange={(e) => setCurrentItem({ ...currentItem, base_unit: e.target.value })}
                              className="px-2 py-1.5 bg-white dark:bg-gray-900 border border-amber-300 dark:border-amber-700 rounded-lg text-xs outline-none"
                            >
                              <option value="gr">gr</option>
                              <option value="ml">ml</option>
                              <option value="pcs">pcs</option>
                            </select>
                            {/* Preview total */}
                            {currentItem.content_weight && (
                              <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                                = {computeItemsPerUnit(currentItem.content_count, currentItem.content_weight)}{currentItem.base_unit}/{currentItem.unit}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-amber-600 dark:text-amber-500">
                            Cth: My Vla → 6 × 60 gr &nbsp;|&nbsp; Susu UHT → × 1000 ml &nbsp;|&nbsp; Cup → × 100 pcs &nbsp;|&nbsp; Stiker → × 96 pcs
                          </p>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        {['gr','ml'].includes(currentItem.unit) ? 'Total Harga Beli' : 'Harga Satuan'}
                      </label>
                      <input
                        type="text" required placeholder="12.000"
                        value={currentItem.unit_price !== '' ? Number(currentItem.unit_price).toLocaleString('id-ID') : ''}
                        onChange={(e) => {
                          const rawValue = e.target.value.replace(/\./g, '');
                          if (rawValue === '') {
                            setCurrentItem({...currentItem, unit_price: ''});
                          } else if (/^\d+$/.test(rawValue)) {
                            setCurrentItem({...currentItem, unit_price: parseInt(rawValue)});
                          }
                        }}
                        className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:border-primary-500 outline-none"
                      />
                      {currentItem.content_weight && !['kg','gr','liter','ml'].includes(currentItem.unit) && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                          HPP: Rp{currentItem.unit_price} ÷ {computeItemsPerUnit(currentItem.content_count, currentItem.content_weight)}{currentItem.base_unit}
                          {' = '}Rp{currentItem.unit_price && currentItem.content_weight
                            ? (currentItem.unit_price / computeItemsPerUnit(currentItem.content_count, currentItem.content_weight)).toFixed(1)
                            : '?'}/{currentItem.base_unit}
                        </p>
                      )}
                      {['gr','ml'].includes(currentItem.unit) && currentItem.unit_price > 0 && currentItem.quantity > 0 && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                          = Rp {(currentItem.unit_price / currentItem.quantity).toFixed(1)}/{currentItem.unit} untuk HPP
                        </p>
                      )}
                    </div>
                  </div>

                  <button 
                    type="submit"
                    className="w-full flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 py-2 rounded-lg text-sm font-medium transition-colors border border-gray-200 dark:border-gray-700"
                  >
                    <Plus size={16} />
                    Tambah ke Daftar
                  </button>
                </form>
              </div>

              {/* 3. Keranjang / Daftar Barang */}
              {cart.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Daftar Barang ({cart.length})</h3>
                  <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                          <th className="p-3 font-medium text-gray-600 dark:text-gray-300">Bahan</th>
                          <th className="p-3 font-medium text-gray-600 dark:text-gray-300 text-right">Jumlah</th>
                          <th className="p-3 font-medium text-gray-600 dark:text-gray-300 text-right">Total</th>
                          <th className="p-3 font-medium"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {cart.map((item) => (
                          <tr key={item.id} className="bg-white dark:bg-gray-900">
                            <td className="p-3">
                              <div className="font-medium text-gray-900 dark:text-gray-100">{item.name}</div>
                              <div className="text-xs text-gray-500">
                                Rp {item.unit_price.toLocaleString('id-ID')} / {item.unit}
                                {item.items_per_unit
                                  ? ` · ${item.content_count ? `${item.content_count}×${item.content_weight}` : item.items_per_unit}${item.base_unit}/${item.unit}`
                                  : ''}
                              </div>
                            </td>
                            <td className="p-3 text-right text-gray-700 dark:text-gray-300">{item.quantity} {item.unit}</td>
                            <td className="p-3 text-right font-medium text-gray-900 dark:text-gray-100">Rp {getItemTotal(item).toLocaleString('id-ID')}</td>
                            <td className="p-3 text-right">
                              <button onClick={() => removeFromCart(item.id)} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-1.5 rounded-md">
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="flex items-center justify-between bg-primary-50 dark:bg-primary-900/20 px-3 py-3 border-t border-primary-100 dark:border-primary-900/30">
                      <span className="text-sm font-semibold text-primary-700 dark:text-primary-300">Total Belanja</span>
                      <span className="text-sm font-bold text-primary-700 dark:text-primary-300">Rp {cartTotal.toLocaleString('id-ID')}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                <button 
                  onClick={handleSaveAll}
                  disabled={formLoading || cart.length === 0}
                  className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-xl text-sm font-bold transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {formLoading ? <Loader2 className="animate-spin" size={18} /> : `Simpan Semua (${cart.length} Barang)`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Edit Bahan */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 w-full max-w-lg my-8 sm:my-auto h-fit">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 rounded-t-2xl z-10">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Edit Pembelian Bahan</h2>
              <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleEditSave} className="p-4 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm flex gap-2">
                  <AlertCircle size={18} /> {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Nama Bahan</label>
                  <input type="text" required value={editFormData.name}
                    onChange={(e) => setEditFormData({...editFormData, name: e.target.value})}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Kategori</label>
                  <input type="text" required value={editFormData.category}
                    onChange={(e) => setEditFormData({...editFormData, category: e.target.value})}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Supplier / Toko</label>
                  <input type="text" placeholder="Toko Berkah" value={editFormData.supplier}
                    onChange={(e) => setEditFormData({...editFormData, supplier: e.target.value})}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Tanggal Beli</label>
                  <input type="date" required value={editFormData.purchase_date}
                    onChange={(e) => setEditFormData({...editFormData, purchase_date: e.target.value})}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Jumlah</label>
                  <div className="flex">
                    <input type="number" min="0.1" step="0.1" required value={editFormData.quantity}
                      onChange={(e) => setEditFormData({...editFormData, quantity: e.target.value === '' ? '' : parseFloat(e.target.value)})}
                      className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-l-xl text-sm focus:border-primary-500 outline-none" />
                    <select value={editFormData.unit}
                      onChange={(e) => setEditFormData({...editFormData, unit: e.target.value, content_count: '', content_weight: '', items_per_unit: '', base_unit: 'gr'})}
                      className="px-2 bg-gray-100 dark:bg-gray-800 border border-l-0 border-gray-200 dark:border-gray-700 rounded-r-xl text-sm outline-none">
                      <option value="kg">kg</option>
                      <option value="gr">gr</option>
                      <option value="liter">liter</option>
                      <option value="ml">ml</option>
                      <option value="pcs">pcs</option>
                      <option value="lembar">lembar</option>
                      <option value="bungkus">bungkus</option>
                      <option value="botol">botol</option>
                      <option value="kaleng">kaleng</option>
                      <option value="pack">pack</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    {['gr','ml'].includes(editFormData.unit) ? 'Total Harga Beli' : 'Harga Satuan'}
                  </label>
                  <input type="text" required
                    value={editFormData.unit_price !== '' ? Number(editFormData.unit_price).toLocaleString('id-ID') : ''}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\./g, '');
                      if (raw === '') setEditFormData({...editFormData, unit_price: ''});
                      else if (/^\d+$/.test(raw)) setEditFormData({...editFormData, unit_price: parseInt(raw)});
                    }}
                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none" />
                  {['gr','ml'].includes(editFormData.unit) && editFormData.unit_price > 0 && editFormData.quantity > 0 && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      = Rp {(editFormData.unit_price / editFormData.quantity).toFixed(1)}/{editFormData.unit} untuk HPP
                    </p>
                  )}
                </div>
              </div>

              {!['kg', 'gr', 'liter', 'ml'].includes(editFormData.unit) && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl space-y-2">
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                    Isi per {editFormData.unit} <span className="font-normal">(opsional, untuk kalkulasi HPP)</span>
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input type="number" min="1" step="1" placeholder="jml isi" value={editFormData.content_count}
                      onChange={(e) => setEditFormData({...editFormData, content_count: e.target.value})}
                      className="w-20 px-2 py-1.5 bg-white dark:bg-gray-900 border border-amber-300 dark:border-amber-700 rounded-lg text-xs focus:border-primary-500 outline-none" />
                    <span className="text-xs text-amber-600 dark:text-amber-400">×</span>
                    <input type="number" min="0.1" step="0.1" placeholder="berat/vol" value={editFormData.content_weight}
                      onChange={(e) => setEditFormData({...editFormData, content_weight: e.target.value})}
                      className="w-24 px-2 py-1.5 bg-white dark:bg-gray-900 border border-amber-300 dark:border-amber-700 rounded-lg text-xs focus:border-primary-500 outline-none" />
                    <select value={editFormData.base_unit}
                      onChange={(e) => setEditFormData({...editFormData, base_unit: e.target.value})}
                      className="px-2 py-1.5 bg-white dark:bg-gray-900 border border-amber-300 dark:border-amber-700 rounded-lg text-xs outline-none">
                      <option value="gr">gr</option>
                      <option value="ml">ml</option>
                      <option value="pcs">pcs</option>
                    </select>
                    {editFormData.content_weight && (
                      <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                        = {computeItemsPerUnit(editFormData.content_count, editFormData.content_weight)}{editFormData.base_unit}/{editFormData.unit}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="pt-2">
                <button type="submit" disabled={formLoading}
                  className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm disabled:opacity-70">
                  {formLoading ? <Loader2 className="animate-spin" size={18} /> : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Lihat Struk */}
      {selectedImage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedImage(null)}>
          <div className="relative max-w-4xl w-full max-h-[90vh] flex items-center justify-center" onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => setSelectedImage(null)}
              className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors p-2"
            >
              <X size={24} />
            </button>
            <img 
              src={selectedImage} 
              alt="Foto Struk" 
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
