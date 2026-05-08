import { useState, useRef, useEffect } from 'react';
import { Menu, Sun, Moon, Bell, Search, Plus, User, LogOut, Settings, Package, ShoppingCart, Wallet, PieChart } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/utils';

export default function Header() {
  const { toggleSidebar, theme, toggleTheme, user } = useStore();
  const navigate = useNavigate();

  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const addRef = useRef(null);
  const notifRef = useRef(null);
  const userRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (addRef.current && !addRef.current.contains(event.target)) setShowAddMenu(false);
      if (notifRef.current && !notifRef.current.contains(event.target)) setShowNotifMenu(false);
      if (userRef.current && !userRef.current.contains(event.target)) setShowUserMenu(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    
    fetchNotifications();

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchNotifications = async () => {
    const { data: lowStockProducts } = await supabase
      .from('products')
      .select('name, stock')
      .lte('stock', 5)
      .eq('is_available', true);

    const notifs = [];
    
    if (lowStockProducts && lowStockProducts.length > 0) {
      lowStockProducts.forEach(p => {
        notifs.push({
          id: `stock-${p.name}`,
          title: 'Stok Menipis',
          message: `${p.name} tersisa ${p.stock} pcs.`,
          type: 'warning'
        });
      });
    }

    setNotifications(notifs);
    setUnreadCount(notifs.length);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleAddAction = (path) => {
    setShowAddMenu(false);
    navigate(path);
  };

  return (
    <header className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 sticky top-0 z-10">
      <div className="flex items-center gap-4 flex-1">
        <button 
          onClick={toggleSidebar}
          className="hidden md:flex p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors"
        >
          <Menu size={20} />
        </button>

        <div className="md:hidden font-bold text-xl text-primary-600 dark:text-primary-400">
          CakeFinance
        </div>

        <div className="hidden md:flex items-center relative max-w-md w-full">
          <Search size={18} className="absolute left-3 text-gray-400" />
          <input 
            type="text" 
            placeholder="Cari transaksi, produk..." 
            className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border-transparent focus:bg-white dark:focus:bg-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 rounded-xl text-sm outline-none transition-all"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        {/* Tambah Cepat */}
        <div className="relative" ref={addRef}>
          <button 
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="hidden md:flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm shadow-primary-600/20"
          >
            <Plus size={18} />
            <span>Tambah Cepat</span>
          </button>

          {showAddMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-100 dark:border-gray-800 py-2 z-50 animate-in fade-in zoom-in duration-200">
              <button onClick={() => handleAddAction('/penjualan')} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                <ShoppingCart size={16} /> Penjualan Baru
              </button>
              <button onClick={() => handleAddAction('/modal')} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                <Wallet size={16} /> Beli Bahan Baku
              </button>
              <button onClick={() => handleAddAction('/produk')} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                <Package size={16} /> Produk Kue Baru
              </button>
            </div>
          )}
        </div>

        {/* Notifikasi */}
        <div className="relative" ref={notifRef}>
          <button 
            onClick={() => {
              setShowNotifMenu(!showNotifMenu);
              if (!showNotifMenu) setUnreadCount(0); // reset when opened
            }}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 relative transition-colors"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-gray-900"></span>
            )}
          </button>

          {showNotifMenu && (
            <div className="absolute right-[-60px] sm:right-0 mt-2 w-[300px] sm:w-80 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-100 dark:border-gray-800 py-2 z-50 animate-in fade-in zoom-in duration-200">
              <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800">
                <h3 className="font-bold text-gray-900 dark:text-white">Notifikasi</h3>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-6 text-center text-gray-500 text-sm">
                    Tidak ada notifikasi baru.
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div key={notif.id} className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-50 dark:border-gray-800/50 cursor-pointer">
                      <p className="text-sm text-gray-900 dark:text-gray-100 font-medium">{notif.title}</p>
                      <p className={`text-xs mt-0.5 ${notif.type === 'warning' ? 'text-red-500' : 'text-gray-500'}`}>{notif.message}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 text-center">
                <button onClick={() => setUnreadCount(0)} className="text-xs font-medium text-primary-600 hover:text-primary-700">Tandai semua dibaca</button>
              </div>
            </div>
          )}
        </div>
        
        {/* Dark Mode */}
        <button 
          onClick={toggleTheme}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors"
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        <div className="w-px h-6 bg-gray-200 dark:bg-gray-800 mx-1"></div>

        {/* User Profile */}
        <div className="relative" ref={userRef}>
          <button 
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 p-1 pl-2 pr-3 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/50 flex items-center justify-center text-primary-600 dark:text-primary-400">
              <User size={16} />
            </div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 hidden sm:block truncate max-w-[120px]">
              {user?.email ? user.email.split('@')[0] : 'Admin'}
            </span>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-100 dark:border-gray-800 py-2 z-50 animate-in fade-in zoom-in duration-200">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 mb-1">
                <p className="text-sm text-gray-900 dark:text-white font-medium truncate">{user?.email ? user.email.split('@')[0] : 'Admin'}</p>
                <p className="text-xs text-gray-500 truncate">{user?.email || 'admin@cakefinance.com'}</p>
              </div>
              <button onClick={() => { setShowUserMenu(false); navigate('/laporan'); }} className="w-full md:hidden flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                <PieChart size={16} /> Laporan Bisnis
              </button>
              <button onClick={() => { setShowUserMenu(false); navigate('/pengaturan'); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                <Settings size={16} /> Pengaturan
              </button>
              <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                <LogOut size={16} /> Keluar
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
