import { useState } from 'react';
import { Save, Database, Bell, CreditCard, Loader2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import Toast from '../components/ui/Toast';
import { supabase } from '../lib/supabase';

export default function Pengaturan() {
  const { bankInfo, setBankInfo, notificationSettings, setNotificationSettings } = useStore();
  const [form, setForm] = useState({
    bank: bankInfo?.bank || '',
    owner: bankInfo?.owner || '',
    number: bankInfo?.number || '',
  });
  const [notifications, setNotifications] = useState(notificationSettings);
  const [backupLoading, setBackupLoading] = useState(false);
  const [toast, setToast] = useState({ message: '', type: 'success' });

  const handleSave = () => {
    setBankInfo(form);
    setNotificationSettings({
      ...notifications,
      productLowStockThreshold: Math.max(0, parseInt(notifications.productLowStockThreshold) || 0),
      largeExpenseThreshold: Math.max(0, parseInt(notifications.largeExpenseThreshold) || 0),
    });
    setToast({ message: 'Pengaturan berhasil disimpan!', type: 'success' });
  };

  const handleBackup = async () => {
    setBackupLoading(true);
    const tables = ['products', 'sales', 'ingredients', 'ingredient_masters', 'recipes', 'production_logs'];
    const backup = {};

    for (const table of tables) {
      const { data, error } = await supabase.from(table).select('*');
      backup[table] = error ? { error: error.message } : data || [];
    }

    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), data: backup }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup-kukis-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setBackupLoading(false);
    setToast({ message: 'Backup JSON berhasil dibuat.', type: 'success' });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Pengaturan</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Kelola preferensi dan sistem aplikasi.</p>
      </div>

      {/* Rekening Bank */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-lg">
            <CreditCard size={20} />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Info Rekening Bank</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Ditampilkan di bagian bawah rekap laporan mingguan.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Nama Bank</label>
            <input
              type="text" placeholder="BSI, BCA, BRI..."
              value={form.bank}
              onChange={(e) => setForm({ ...form, bank: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Nama Pemilik</label>
            <input
              type="text" placeholder="Nama lengkap"
              value={form.owner}
              onChange={(e) => setForm({ ...form, owner: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Nomor Rekening</label>
            <input
              type="text" placeholder="7198800141"
              value={form.number}
              onChange={(e) => setForm({ ...form, number: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
            />
          </div>
        </div>
        {form.number && (
          <p className="mt-3 text-xs text-gray-400 bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded-lg">
            Preview: Nama bank, pemilik &amp; Nomor rekening :{form.number} {form.bank} a/n {form.owner}
          </p>
        )}
      </div>

      {/* Database */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 rounded-lg">
            <Database size={20} />
          </div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Database & Backup</h2>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Data Anda disimpan secara aman di Supabase.</p>
        <button
          onClick={handleBackup}
          disabled={backupLoading}
          className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          {backupLoading && <Loader2 size={15} className="animate-spin" />}
          Backup Sekarang
        </button>
      </div>

      {/* Notifikasi */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 rounded-lg">
            <Bell size={20} />
          </div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Notifikasi</h2>
        </div>
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-4 rounded-xl bg-gray-50 dark:bg-gray-800 p-3">
            <span>
              <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">Peringatan Stok Produk</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">Muncul saat stok produk sama dengan atau di bawah batas.</span>
            </span>
            <input
              type="checkbox"
              className="toggle-checkbox"
              checked={notifications.lowStock}
              onChange={(e) => setNotifications({ ...notifications, lowStock: e.target.checked })}
            />
          </label>
          {notifications.lowStock && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Batas Stok Produk (pcs)</label>
              <input
                type="number"
                min="0"
                value={notifications.productLowStockThreshold ?? 5}
                onChange={(e) => setNotifications({ ...notifications, productLowStockThreshold: e.target.value === '' ? '' : parseInt(e.target.value) })}
                className="w-full sm:w-48 px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
              />
            </div>
          )}
          <label className="flex items-center justify-between gap-4 rounded-xl bg-gray-50 dark:bg-gray-800 p-3">
            <span>
              <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">Peringatan Stok Bahan</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">Mengikuti stok minimum yang diatur di halaman Resep & Stok Bahan.</span>
            </span>
            <input
              type="checkbox"
              className="toggle-checkbox"
              checked={notifications.ingredientLowStock ?? true}
              onChange={(e) => setNotifications({ ...notifications, ingredientLowStock: e.target.checked })}
            />
          </label>
          <label className="flex items-center justify-between gap-4 rounded-xl bg-gray-50 dark:bg-gray-800 p-3">
            <span>
              <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">Notifikasi Pengeluaran Besar</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">Pantau pembelian bahan bernilai besar dalam 7 hari terakhir.</span>
            </span>
            <input
              type="checkbox"
              className="toggle-checkbox"
              checked={notifications.largeExpense}
              onChange={(e) => setNotifications({ ...notifications, largeExpense: e.target.checked })}
            />
          </label>
          {notifications.largeExpense && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Batas Pengeluaran Besar (Rp)</label>
              <input
                type="number"
                min="0"
                value={notifications.largeExpenseThreshold ?? 1000000}
                onChange={(e) => setNotifications({ ...notifications, largeExpenseThreshold: e.target.value === '' ? '' : parseInt(e.target.value) })}
                className="w-full sm:w-64 px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm shadow-primary-600/20"
        >
          <Save size={18} />
          Simpan Perubahan
        </button>
      </div>

      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
    </div>
  );
}
