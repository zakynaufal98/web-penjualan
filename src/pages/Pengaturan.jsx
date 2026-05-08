import { Save, Database, Shield, Bell } from 'lucide-react';

export default function Pengaturan() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Pengaturan</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Kelola preferensi dan sistem aplikasi.</p>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="p-6 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 rounded-lg">
              <Database size={20} />
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Database & Backup</h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Data Anda disimpan secara aman di Supabase. Lakukan backup rutin untuk mencegah kehilangan data.</p>
          <button className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
            Backup Sekarang
          </button>
        </div>

        <div className="p-6 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 rounded-lg">
              <Bell size={20} />
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Notifikasi</h2>
          </div>
          <div className="space-y-4">
            <label className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Peringatan Stok Menipis</span>
              <input type="checkbox" className="toggle-checkbox" defaultChecked />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Notifikasi Pengeluaran Besar {'>'} Rp 1.000.000</span>
              <input type="checkbox" className="toggle-checkbox" defaultChecked />
            </label>
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <button className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm shadow-primary-600/20">
          <Save size={18} />
          <span>Simpan Perubahan</span>
        </button>
      </div>
    </div>
  );
}
