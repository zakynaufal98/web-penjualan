import { User, Mail, Shield, LogOut } from 'lucide-react';
import { useStore } from '../store/useStore';
import { supabase } from '../lib/supabase';
import { useState } from 'react';
import Toast from '../components/ui/Toast';

export default function Profil() {
  const { user, profileName, setProfileName } = useStore();
  const [name, setName] = useState(profileName || 'Admin Kukis');
  const [toast, setToast] = useState({ message: '', type: 'success' });

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleSave = () => {
    setProfileName(name.trim() || 'Admin Kukis');
    setToast({ message: 'Profil berhasil disimpan.', type: 'success' });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Profil Pengguna</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Kelola informasi akun Anda.</p>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 md:p-8">
        <div className="flex flex-col sm:flex-row items-center gap-6 mb-8">
          <div className="w-24 h-24 rounded-full bg-primary-100 dark:bg-primary-900/50 flex items-center justify-center text-primary-600 dark:text-primary-400 text-3xl shrink-0">
            <User size={48} />
          </div>
          <div className="text-center sm:text-left">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{profileName || 'Admin Kukis'}</h2>
            <p className="text-gray-500 dark:text-gray-400 flex items-center justify-center sm:justify-start gap-2 mt-1">
              <Mail size={16} /> {user?.email || 'admin@cakefinance.com'}
            </p>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 mt-3 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              <Shield size={14} /> Admin
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nama Lengkap</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:border-primary-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
            <input type="email" value={user?.email || "admin@cakefinance.com"} disabled className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none text-gray-500 cursor-not-allowed" />
          </div>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row gap-4">
          <button onClick={handleSave} className="flex-1 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
            Simpan Perubahan
          </button>
          <button onClick={handleLogout} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/20 dark:hover:bg-red-900/30 dark:text-red-400 px-6 py-2.5 rounded-xl text-sm font-medium transition-colors">
            <LogOut size={18} />
            <span>Keluar</span>
          </button>
        </div>
      </div>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
    </div>
  );
}
