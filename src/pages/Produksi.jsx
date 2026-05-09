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
import { Plus, Trash2, X, Loader2, AlertCircle, ClipboardList } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import Toast from '../components/ui/Toast';
import { format, isSameDay } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

export default function Produksi() {
  const [logs, setLogs] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tableExists, setTableExists] = useState(true);

  const [formData, setFormData] = useState({ product_id: '', quantity: 1, notes: '' });
  const [formLoading, setFormLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const { user } = useStore();

  useEffect(() => {
    fetchLogs();
    fetchProducts();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from('production_logs')
      .select('*, products(name)')
      .order('production_date', { ascending: false });

    if (fetchError) {
      setTableExists(false);
    } else {
      setLogs(data || []);
      setTableExists(true);
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

  const deductIngredientStock = async (productId, batchQty) => {
    const { data: recipeItems } = await supabase
      .from('recipes')
      .select('quantity_per_unit, unit, ingredient_master_id, ingredient_masters(id, unit, current_stock)')
      .eq('product_id', productId);
    if (!recipeItems || recipeItems.length === 0) return false;
    for (const item of recipeItems) {
      const master = item.ingredient_masters;
      if (!master) continue;
      const deductQty = convertUnit(item.quantity_per_unit * batchQty, item.unit, master.unit);
      await supabase
        .from('ingredient_masters')
        .update({ current_stock: Math.max(0, (master.current_stock || 0) - deductQty) })
        .eq('id', master.id);
    }
    return true;
  };

  const restoreIngredientStock = async (productId, batchQty) => {
    const { data: recipeItems } = await supabase
      .from('recipes')
      .select('quantity_per_unit, unit, ingredient_master_id, ingredient_masters(id, unit, current_stock)')
      .eq('product_id', productId);
    if (!recipeItems || recipeItems.length === 0) return;
    for (const item of recipeItems) {
      const master = item.ingredient_masters;
      if (!master) continue;
      const restoreQty = convertUnit(item.quantity_per_unit * batchQty, item.unit, master.unit);
      await supabase
        .from('ingredient_masters')
        .update({ current_stock: (master.current_stock || 0) + restoreQty })
        .eq('id', master.id);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setError('');

    if (!formData.product_id) {
      setError('Silakan pilih produk');
      setFormLoading(false);
      return;
    }

    const { error: insertError } = await supabase.from('production_logs').insert([{
      product_id: formData.product_id,
      quantity: formData.quantity,
      notes: formData.notes || null,
      created_by: user?.id
    }]);

    if (insertError) {
      setError(insertError.message);
      setFormLoading(false);
      return;
    }

    // Tambah stok produk jadi
    const { data: currentProduct } = await supabase
      .from('products').select('stock').eq('id', formData.product_id).single();
    await supabase
      .from('products')
      .update({ stock: (currentProduct?.stock || 0) + formData.quantity })
      .eq('id', formData.product_id);

    // Kurangi stok bahan baku sesuai resep
    const hasRecipe = await deductIngredientStock(formData.product_id, formData.quantity);

    setIsModalOpen(false);
    setFormData({ product_id: '', quantity: 1, notes: '' });
    fetchLogs();
    setFormLoading(false);

    if (!hasRecipe) {
      setToast({ message: 'Produksi tersimpan. Resep belum diatur — stok bahan tidak dikurangi.', type: 'info' });
    } else {
      setToast({ message: 'Produksi berhasil dicatat!', type: 'success' });
    }
  };

  const handleDelete = async (id, productId, quantity) => {
    if (!confirm('Yakin ingin hapus catatan produksi ini? Stok produk dan bahan akan dikembalikan.')) return;

    await restoreIngredientStock(productId, quantity);
    await supabase.from('production_logs').delete().eq('id', id);

    const { data: currentProduct } = await supabase
      .from('products').select('stock').eq('id', productId).single();
    if (currentProduct) {
      await supabase
        .from('products')
        .update({ stock: Math.max(0, (currentProduct.stock || 0) - quantity) })
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
                <th className="p-4 font-medium text-right">Jumlah</th>
                <th className="p-4 font-medium">Catatan</th>
                <th className="p-4 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
              {loading ? (
                <tr><td colSpan="5" className="p-8 text-center text-gray-500">Memuat data...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan="5" className="p-8 text-center text-gray-500">Belum ada catatan produksi.</td></tr>
              ) : (
                logs.map((log) => (
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
                    <td className="p-4 text-gray-500 dark:text-gray-400 text-sm">
                      {log.notes || '-'}
                    </td>
                    <td className="p-4">
                      <button
                        onClick={() => handleDelete(log.id, log.product_id, log.quantity)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      >
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

      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      {/* Modal Tambah */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 w-full max-w-md my-8 sm:my-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Catat Produksi</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAdd} className="p-4 space-y-4">
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Jumlah Diproduksi (pcs)</label>
                <input
                  type="number" min="1" required
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value === '' ? 1 : parseInt(e.target.value) })}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                />
                <p className="text-xs text-gray-400 mt-1">Stok produk akan bertambah secara otomatis.</p>
              </div>

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
                  {formLoading ? <Loader2 className="animate-spin" size={18} /> : 'Simpan Produksi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
