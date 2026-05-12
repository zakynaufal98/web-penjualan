// Halaman ini membutuhkan tabel production_logs di Supabase:
//
// CREATE TABLE production_logs (
//   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
//   product_id uuid REFERENCES products(id) ON DELETE SET NULL,
//   quantity integer NOT NULL CHECK (quantity > 0),
//   production_date timestamptz DEFAULT now(),
//   notes text,
//   created_by uuid REFERENCES auth.users(id)
// );
//
// Setelah membuat tabel, aktifkan RLS dan tambahkan policy sesuai kebutuhan.

import { useState, useEffect } from 'react';
import { Plus, Trash2, X, Loader2, AlertCircle, ClipboardList, UtensilsCrossed, Edit2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import Toast from '../components/ui/Toast';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { friendlyError } from '../lib/errorUtils';
import { format, isSameDay } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

export default function Produksi() {
  const [logs, setLogs] = useState([]);
  const [salesMap, setSalesMap] = useState({});
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tableExists, setTableExists] = useState(true);

  const [formData, setFormData] = useState({ product_id: '', quantity: 1, failed: 0, notes: '', production_date: new Date().toISOString().split('T')[0] });
  const [editingLog, setEditingLog] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });
  const [konsumsiDialog, setKonsumsiDialog] = useState({ open: false, logId: '', productId: '', nama: '', currentKonsumsi: 0, amount: '', mode: 'add' });
  const { user } = useStore();

  const openConfirm = (title, message, onConfirm) => setConfirmDialog({ open: true, title, message, onConfirm });
  const closeConfirm = () => setConfirmDialog(d => ({ ...d, open: false }));

  useEffect(() => {
    fetchLogs();
    fetchProducts();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    const [{ data, error: fetchError }, { data: salesData }] = await Promise.all([
      supabase.from('production_logs').select('*, products(name)').order('production_date', { ascending: false }),
      supabase.from('sales').select('product_id, quantity, transaction_date'),
    ]);

    if (fetchError) {
      setTableExists(false);
    } else {
      setLogs(data || []);
      setTableExists(true);
      // Buat map: "productId_yyyy-MM-dd" → total terjual
      const map = {};
      (salesData || []).forEach(s => {
        const key = `${s.product_id}_${format(new Date(s.transaction_date), 'yyyy-MM-dd')}`;
        map[key] = (map[key] || 0) + s.quantity;
      });
      setSalesMap(map);
    }
    setLoading(false);
  };

  const fetchProducts = async () => {
    const { data } = await supabase.from('products').select('id, name').order('name');
    setProducts(data || []);
  };

  const convertUnit = (qty, fromUnit, toUnit) => {
    if (fromUnit === toUnit) return qty;
    if (fromUnit === 'gr' && toUnit === 'kg') return qty / 1000;
    if (fromUnit === 'kg' && toUnit === 'gr') return qty * 1000;
    if (fromUnit === 'ml' && toUnit === 'liter') return qty / 1000;
    if (fromUnit === 'liter' && toUnit === 'ml') return qty * 1000;
    return qty;
  };

  const adjustIngredientStock = async (productId, batchQty, sign) => {
    const { data: recipeItems } = await supabase
      .from('recipes')
      .select('quantity_per_unit, unit, ingredient_master_id, ingredient_masters(id, unit, items_per_unit, base_unit)')
      .eq('product_id', productId);
    if (!recipeItems || recipeItems.length === 0) return false;
    for (const item of recipeItems) {
      const master = item.ingredient_masters;
      if (!master) continue;

      const totalInRecipeUnit = item.quantity_per_unit * batchQty;
      let delta;

      if (!master.items_per_unit || !master.base_unit || item.unit === master.unit) {
        // Resep pakai satuan beli langsung (mis. 'kaleng', 'pack'), atau bahan tanpa sub-satuan
        delta = convertUnit(totalInRecipeUnit, item.unit, master.unit);
      } else {
        // Resep pakai satuan isi (mis. 'ml', 'gr') → konversi ke base_unit → bagi items_per_unit
        const totalInBaseUnit = convertUnit(totalInRecipeUnit, item.unit, master.base_unit);
        delta = totalInBaseUnit / master.items_per_unit;
      }

      await supabase.rpc('adjust_ingredient_stock', { p_id: master.id, p_delta: delta * sign });
    }
    return true;
  };

  const deductIngredientStock  = (productId, qty) => adjustIngredientStock(productId, qty, -1);
  const restoreIngredientStock = (productId, qty) => adjustIngredientStock(productId, qty, +1);

  const resetForm = () => {
    setEditingLog(null);
    setFormData({ product_id: '', quantity: 1, failed: 0, notes: '', production_date: new Date().toISOString().split('T')[0] });
    setError('');
  };

  const openEdit = (log) => {
    setEditingLog(log);
    setFormData({
      product_id: log.product_id,
      quantity: log.quantity,
      failed: log.failed || 0,
      notes: log.notes || '',
      production_date: format(new Date(log.production_date), 'yyyy-MM-dd'),
    });
    setError('');
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setError('');

    if (!formData.product_id) {
      setError('Silakan pilih produk');
      setFormLoading(false);
      return;
    }

    const newBawa   = parseInt(formData.quantity) || 0;
    const newFailed = parseInt(formData.failed)  || 0;
    const newTotal  = newBawa + newFailed;

    if (editingLog) {
      // ── MODE EDIT ──
      const oldBawa   = editingLog.quantity;
      const oldFailed = editingLog.failed || 0;
      const oldTotal  = oldBawa + oldFailed;

      const { error: updateError } = await supabase.from('production_logs').update({
        product_id: formData.product_id,
        quantity: newBawa,
        failed: newFailed,
        notes: formData.notes || null,
        production_date: new Date(formData.production_date).toISOString(),
      }).eq('id', editingLog.id);

      if (updateError) {
        setError(friendlyError(updateError));
        setFormLoading(false);
        return;
      }

      // Sesuaikan stok produk (selisih bawa)
      const { data: currentProduct } = await supabase
        .from('products').select('stock').eq('id', formData.product_id).single();
      const { data: stockUpdated } = await supabase
        .from('products')
        .update({ stock: Math.max(0, (currentProduct?.stock || 0) + (newBawa - oldBawa)) })
        .eq('id', formData.product_id)
        .select();
      if (!stockUpdated || stockUpdated.length === 0) {
        setToast({ message: 'Data diperbarui tapi stok produk gagal disesuaikan. Jalankan SQL: CREATE POLICY "Allow update products" ON products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);', type: 'error' });
        setIsModalOpen(false);
        resetForm();
        await fetchLogs();
        setFormLoading(false);
        return;
      }

      // Sesuaikan stok bahan (selisih total)
      const totalDiff = newTotal - oldTotal;
      if (totalDiff > 0) await deductIngredientStock(formData.product_id, totalDiff);
      else if (totalDiff < 0) await restoreIngredientStock(formData.product_id, Math.abs(totalDiff));

      setToast({ message: 'Catatan produksi berhasil diperbarui!', type: 'success' });
    } else {
      // ── MODE TAMBAH ──
      const { error: insertError } = await supabase.from('production_logs').insert([{
        product_id: formData.product_id,
        quantity: newBawa,
        failed: newFailed,
        notes: formData.notes || null,
        created_by: user?.id,
        production_date: new Date(formData.production_date).toISOString(),
      }]);

      if (insertError) {
        setError(friendlyError(insertError));
        setFormLoading(false);
        return;
      }

      const { data: currentProduct } = await supabase
        .from('products').select('stock').eq('id', formData.product_id).single();
      const { data: stockUpdated } = await supabase
        .from('products')
        .update({ stock: (currentProduct?.stock || 0) + newBawa })
        .eq('id', formData.product_id)
        .select();

      const hasRecipe = await deductIngredientStock(formData.product_id, newTotal);
      if (!stockUpdated || stockUpdated.length === 0) {
        setToast({ message: 'Produksi tersimpan tapi stok produk gagal bertambah. Jalankan SQL: CREATE POLICY "Allow update products" ON products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);', type: 'error' });
      } else if (!hasRecipe) {
        setToast({ message: 'Produksi tersimpan. Resep belum diatur — stok bahan tidak dikurangi.', type: 'info' });
      } else {
        setToast({ message: 'Produksi berhasil dicatat!', type: 'success' });
      }
    }

    setIsModalOpen(false);
    resetForm();
    fetchLogs();
    setFormLoading(false);
  };

  const handleCatatKonsumsi = async () => {
    const rawAmount = parseInt(konsumsiDialog.amount);
    if (isNaN(rawAmount) || rawAmount < 0) return;
    if (konsumsiDialog.mode === 'add' && rawAmount <= 0) return;

    const currentKonsumsi = konsumsiDialog.currentKonsumsi || 0;
    const newKonsumsi = konsumsiDialog.mode === 'edit' ? rawAmount : currentKonsumsi + rawAmount;
    const stockDiff = newKonsumsi - currentKonsumsi;

    const { data: updated, error: updateErr } = await supabase
      .from('production_logs')
      .update({ konsumsi: newKonsumsi })
      .eq('id', konsumsiDialog.logId)
      .select();

    if (updateErr || !updated || updated.length === 0) {
      setToast({ message: 'Gagal menyimpan konsumsi. Tambahkan UPDATE policy pada tabel production_logs di Supabase.', type: 'error' });
      setKonsumsiDialog(d => ({ ...d, open: false }));
      return;
    }

    if (stockDiff !== 0) {
      const { data: prod } = await supabase.from('products').select('stock').eq('id', konsumsiDialog.productId).single();
      await supabase.from('products').update({ stock: Math.max(0, (prod?.stock || 0) - stockDiff) }).eq('id', konsumsiDialog.productId);
    }

    setKonsumsiDialog({ open: false, logId: '', productId: '', nama: '', currentKonsumsi: 0, amount: '', mode: 'add' });
    const msg = konsumsiDialog.mode === 'edit'
      ? (newKonsumsi === 0 ? 'Konsumsi berhasil dihapus.' : `Konsumsi diperbarui menjadi ${newKonsumsi} pcs.`)
      : `${rawAmount} pcs dicatat sebagai konsumsi sendiri.`;
    setToast({ message: msg, type: 'success' });
    await fetchLogs();
  };

  const handleDelete = (id, productId, quantity, failed, konsumsi) => {
    openConfirm(
      'Hapus Catatan Produksi?',
      'Stok produk dan bahan baku akan dikembalikan ke jumlah semula.',
      () => executeDelete(id, productId, quantity, failed, konsumsi)
    );
  };

  const executeDelete = async (id, productId, quantity, failed, konsumsi) => {
    const total = quantity + (failed || 0);
    await restoreIngredientStock(productId, total);
    await supabase.from('production_logs').delete().eq('id', id);

    const { data: currentProduct } = await supabase
      .from('products').select('stock').eq('id', productId).single();
    if (currentProduct) {
      // Kembalikan stok: kurangi dari net yang sudah masuk (bawa - konsumsi yg sudah dikurangi)
      const netToRestore = quantity - (konsumsi || 0);
      await supabase
        .from('products')
        .update({ stock: Math.max(0, (currentProduct.stock || 0) - netToRestore) })
        .eq('id', productId);
    }
    setToast({ message: 'Catatan produksi dihapus dan stok dikembalikan.', type: 'success' });
    fetchLogs();
  };

  const today = new Date();
  const todayLogs = logs.filter(l => isSameDay(new Date(l.production_date), today));
  const todayTotal = todayLogs.reduce((sum, l) => sum + l.quantity, 0);

  if (!tableExists) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Produksi Harian</h1>
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" size={20} />
            <div>
              <p className="font-medium text-amber-800 dark:text-amber-300">Tabel database belum dibuat</p>
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                Buat tabel <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">production_logs</code> di Supabase terlebih dahulu.
                Lihat komentar di bagian atas file <code>src/pages/Produksi.jsx</code> untuk SQL-nya.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Produksi Harian</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Catat berapa banyak produk yang dibuat hari ini.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm shadow-primary-600/20"
        >
          <Plus size={18} /> Catat Produksi
        </button>
      </div>

      {/* Ringkasan hari ini */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-100 dark:border-gray-800 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Total Produksi Hari Ini</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{todayTotal} <span className="text-base font-normal text-gray-400">pcs</span></p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-100 dark:border-gray-800 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Jenis Produk Hari Ini</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{todayLogs.length} <span className="text-base font-normal text-gray-400">item</span></p>
        </div>
      </div>

      {/* Tabel */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400">
            <ClipboardList size={16} /> Riwayat Produksi
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[500px]">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                <th className="p-4 font-medium">Tanggal & Waktu</th>
                <th className="p-4 font-medium">Produk</th>
                <th className="p-4 font-medium text-right">Bawa</th>
                <th className="p-4 font-medium text-right">Gagal</th>
                <th className="p-4 font-medium text-right">Terjual</th>
                <th className="p-4 font-medium text-right">Konsumsi</th>
                <th className="p-4 font-medium text-right">Sisa</th>
                <th className="p-4 font-medium">Catatan</th>
                <th className="p-4 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
              {loading ? (
                <tr><td colSpan="9" className="p-8 text-center text-gray-500">Memuat data...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan="9" className="p-8 text-center text-gray-500">Belum ada catatan produksi.</td></tr>
              ) : (
                logs.map((log) => {
                  const dateKey  = format(new Date(log.production_date), 'yyyy-MM-dd');
                  const terjual  = salesMap[`${log.product_id}_${dateKey}`] || 0;
                  const konsumsi = log.konsumsi || 0;
                  const sisa     = Math.max(0, log.quantity - terjual - konsumsi);
                  return (
                  <tr key={log.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="p-4 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {format(new Date(log.production_date), 'dd MMM yyyy, HH:mm', { locale: localeId })}
                    </td>
                    <td className="p-4 font-medium text-gray-900 dark:text-gray-100">
                      {log.products?.name || 'Produk Dihapus'}
                    </td>
                    <td className="p-4 text-right font-bold text-primary-600 dark:text-primary-400">
                      {log.quantity} pcs
                    </td>
                    <td className="p-4 text-right">
                      {log.failed > 0
                        ? <span className="font-semibold text-red-500">{log.failed} pcs</span>
                        : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                    <td className="p-4 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                      {terjual > 0 ? `${terjual} pcs` : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {konsumsi > 0
                          ? <span className="font-semibold text-orange-500 dark:text-orange-400">{konsumsi} pcs</span>
                          : <span className="text-gray-300 dark:text-gray-600">—</span>}
                        <button
                          title="Tambah Konsumsi"
                          onClick={() => setKonsumsiDialog({ open: true, logId: log.id, productId: log.product_id, nama: log.products?.name || '', currentKonsumsi: konsumsi, amount: '', mode: 'add' })}
                          className="p-1 text-orange-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-md transition-colors"
                        >
                          <Plus size={13} />
                        </button>
                        {konsumsi > 0 && (
                          <button
                            title="Edit / Hapus Konsumsi"
                            onClick={() => setKonsumsiDialog({ open: true, logId: log.id, productId: log.product_id, nama: log.products?.name || '', currentKonsumsi: konsumsi, amount: String(konsumsi), mode: 'edit' })}
                            className="p-1 text-orange-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-md transition-colors"
                          >
                            <Edit2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <span className={`font-semibold ${sisa > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`}>
                        {sisa > 0 ? `${sisa} pcs` : <span className="text-emerald-500 text-xs font-medium">Habis</span>}
                      </span>
                    </td>
                    <td className="p-4 text-gray-500 dark:text-gray-400 text-sm">
                      {log.notes || '-'}
                    </td>
                    <td className="p-4">
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEdit(log)}
                          className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(log.id, log.product_id, log.quantity, log.failed, log.konsumsi)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      {/* Dialog Konsumsi Sendiri */}
      {konsumsiDialog.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 w-full max-w-sm">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <UtensilsCrossed size={18} className="text-orange-500" />
                <h2 className="text-base font-bold text-gray-900 dark:text-white">
                  {konsumsiDialog.mode === 'edit' ? 'Edit Konsumsi' : 'Tambah Konsumsi'}
                </h2>
              </div>
              <button onClick={() => setKonsumsiDialog(d => ({ ...d, open: false }))} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Produk: <span className="font-semibold text-gray-900 dark:text-white">{konsumsiDialog.nama}</span>
                {konsumsiDialog.currentKonsumsi > 0 && (
                  <span className="ml-2 text-orange-500 text-xs">(sudah tercatat {konsumsiDialog.currentKonsumsi} pcs)</span>
                )}
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  {konsumsiDialog.mode === 'edit' ? 'Total konsumsi baru (pcs)' : 'Jumlah ditambah (pcs)'}
                </label>
                <input
                  type="number" min="0" autoFocus
                  value={konsumsiDialog.amount}
                  onChange={(e) => setKonsumsiDialog(d => ({ ...d, amount: e.target.value === '' ? '' : parseInt(e.target.value) }))}
                  onKeyDown={(e) => e.key === 'Enter' && handleCatatKonsumsi()}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-orange-200 dark:border-orange-900/40 rounded-xl text-sm focus:border-orange-400 outline-none"
                  placeholder={konsumsiDialog.mode === 'edit' ? 'Masukkan total baru' : 'Cth: 2'}
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {konsumsiDialog.mode === 'edit'
                  ? 'Nilai ini menggantikan catatan lama. Masukkan 0 untuk menghapus konsumsi.'
                  : 'Stok produk akan berkurang sesuai jumlah yang diisi.'}
              </p>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setKonsumsiDialog(d => ({ ...d, open: false }))} className="flex-1 py-2.5 rounded-xl text-sm border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  Batal
                </button>
                <button
                  onClick={handleCatatKonsumsi}
                  disabled={konsumsiDialog.amount === '' || parseInt(konsumsiDialog.amount) < 0 || (konsumsiDialog.mode === 'add' && parseInt(konsumsiDialog.amount) <= 0)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white transition-colors disabled:opacity-50"
                >
                  {konsumsiDialog.mode === 'edit' ? 'Simpan Perubahan' : 'Catat Konsumsi'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={() => { closeConfirm(); confirmDialog.onConfirm?.(); }}
        onCancel={closeConfirm}
      />

      {/* Modal Tambah */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 w-full max-w-md my-8 sm:my-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {editingLog ? 'Edit Produksi' : 'Catat Produksi'}
              </h2>
              <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-4 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm flex gap-2">
                  <AlertCircle size={18} /> {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Produk</label>
                <select
                  required
                  value={formData.product_id}
                  onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                >
                  <option value="">-- Pilih Produk --</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Tanggal Produksi</label>
                <input
                  type="date" required
                  value={formData.production_date}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setFormData({ ...formData, production_date: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Berhasil / Bawa (pcs)</label>
                  <input
                    type="number" min="1" required
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value === '' ? '' : parseInt(e.target.value) })}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Gagal / Rusak (pcs)</label>
                  <input
                    type="number" min="0"
                    value={formData.failed}
                    onChange={(e) => setFormData({ ...formData, failed: e.target.value === '' ? '' : parseInt(e.target.value) })}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-red-200 dark:border-red-900/40 rounded-xl text-sm focus:border-red-400 outline-none"
                  />
                </div>
              </div>
              {formData.failed > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg">
                  Total dibuat: {formData.quantity + formData.failed} pcs · Bahan dikurangi dari {formData.quantity + formData.failed} pcs · Stok bertambah {formData.quantity} pcs
                </p>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Catatan (Opsional)</label>
                <input
                  type="text" placeholder="Cth: Brownies loyang ke-2"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit" disabled={formLoading}
                  className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm disabled:opacity-70"
                >
                  {formLoading ? <Loader2 className="animate-spin" size={18} /> : (editingLog ? 'Simpan Perubahan' : 'Simpan Produksi')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
