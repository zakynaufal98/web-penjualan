import { useState, useRef, useEffect } from 'react';
import {
  Sun, Moon, Bell, Search, Plus, LogOut,
  Settings, Package, ShoppingCart, Wallet, PieChart, Cookie, AlertTriangle
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/utils';

export default function Header() {
  const { theme, toggleTheme, user, notificationSettings, profileName } = useStore();
  const navigate = useNavigate();

  const [showAddMenu,   setShowAddMenu]   = useState(false);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [showUserMenu,  setShowUserMenu]  = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [unreadCount,   setUnreadCount]   = useState(0);

  const addRef   = useRef(null);
  const notifRef = useRef(null);
  const userRef  = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (addRef.current   && !addRef.current.contains(event.target))   setShowAddMenu(false);
      if (notifRef.current && !notifRef.current.contains(event.target)) setShowNotifMenu(false);
      if (userRef.current  && !userRef.current.contains(event.target))  setShowUserMenu(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    fetchNotifications();
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [
    notificationSettings.lowStock,
    notificationSettings.productLowStockThreshold,
    notificationSettings.ingredientLowStock,
    notificationSettings.largeExpense,
    notificationSettings.largeExpenseThreshold,
  ]);

  const fetchNotifications = async () => {
    const notifs = [];
    const productThreshold = notificationSettings.productLowStockThreshold ?? 5;
    if (notificationSettings.lowStock) {
      const { data: lowStockProducts } = await supabase
        .from('products')
        .select('name, stock')
        .lte('stock', productThreshold)
        .eq('is_available', true);
      (lowStockProducts || []).forEach(p => {
        notifs.push({
          id: `stock-${p.name}`,
          title: p.stock <= 0 ? 'Produk Habis' : 'Stok Produk Menipis',
          message: `${p.name} tersisa ${p.stock} pcs.`,
          type: p.stock <= 0 ? 'danger' : 'warning',
          path: '/produk',
        });
      });
    }
    if (notificationSettings.ingredientLowStock ?? true) {
      const { data: lowStockIngredients } = await supabase
        .from('ingredient_masters')
        .select('name, current_stock, min_stock, unit')
        .gt('min_stock', 0);
      (lowStockIngredients || [])
        .filter(item => (item.current_stock || 0) <= (item.min_stock || 0))
        .forEach(item => {
          notifs.push({
            id: `ingredient-${item.name}`,
            title: (item.current_stock || 0) <= 0 ? 'Bahan Habis' : 'Stok Bahan Menipis',
            message: `${item.name}: ${item.current_stock || 0}/${item.min_stock} ${item.unit}.`,
            type: (item.current_stock || 0) <= 0 ? 'danger' : 'warning',
            path: '/resep',
          });
        });
    }
    if (notificationSettings.largeExpense) {
      const { data: expenses } = await supabase
        .from('ingredients')
        .select('name, quantity, unit, unit_price, total_price, purchase_date')
        .gte('purchase_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
      (expenses || []).forEach(item => {
        const measuredUnit = ['kg', 'gr', 'liter', 'ml'].includes(item.unit);
        const total = item.total_price || (measuredUnit ? item.unit_price : (item.quantity || 0) * (item.unit_price || 0));
        if (total >= notificationSettings.largeExpenseThreshold) {
          notifs.push({
            id: `expense-${item.name}-${item.purchase_date}`,
            title: 'Pengeluaran Besar',
            message: `${item.name} mencapai Rp ${total.toLocaleString('id-ID')}.`,
            type: 'warning',
            path: '/modal',
          });
        }
      });
    }
    const sorted = notifs.sort((a, b) => (a.type === 'danger' ? -1 : 0) - (b.type === 'danger' ? -1 : 0));
    setNotifications(sorted);
    setUnreadCount(sorted.length);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleAddAction = (path) => {
    setShowAddMenu(false);
    navigate(path);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const term = searchTerm.trim().toLowerCase();
    if (!term) return;
    if (term.includes('jual') || term.includes('transaksi')) navigate('/penjualan');
    else if (term.includes('produk') || term.includes('stok')) navigate('/produk');
    else if (term.includes('bahan') || term.includes('modal')) navigate('/modal');
    else if (term.includes('produksi')) navigate('/produksi');
    else if (term.includes('laporan') || term.includes('rekap')) navigate('/laporan');
    else navigate('/produk');
    setSearchTerm('');
  };

  const username = profileName || (user?.email ? user.email.split('@')[0] : 'Admin');
  const initials = username.slice(0, 2).toUpperCase();

  return (
    <header className="h-16 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between px-4 sticky top-0 z-10">
      {/* ── Left: hamburger + search ── */}
      <div className="flex items-center gap-3 flex-1">
{/* Mobile brand */}
        <div className="md:hidden flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center shadow-sm shadow-fuchsia-500/30">
            <Cookie size={14} className="text-white" strokeWidth={2.5} />
          </div>
          <span className="font-extrabold text-lg text-gray-900 dark:text-white tracking-tight">Kukis</span>
        </div>

        <form onSubmit={handleSearchSubmit} className="hidden md:flex items-center relative max-w-xs w-full">
          <Search size={16} className="absolute left-3 text-gray-400" />
          <input
            type="text"
            placeholder="Cari transaksi, produk..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border border-transparent focus:bg-white dark:focus:bg-gray-900 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 rounded-xl text-sm outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-gray-500 text-gray-700 dark:text-gray-200"
          />
        </form>
      </div>

      {/* ── Right: actions ── */}
      <div className="flex items-center gap-1.5 md:gap-2">
        {/* Quick add */}
        <div className="relative" ref={addRef}>
          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="hidden md:flex items-center gap-2 bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors shadow-sm shadow-primary-600/25"
          >
            <Plus size={17} strokeWidth={2.5} />
            <span>Tambah Cepat</span>
          </button>

          {showAddMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-900 rounded-2xl shadow-xl shadow-black/10 border border-gray-100 dark:border-gray-800 py-1.5 z-50 animate-fade-up">
              {[
                { label: 'Penjualan Baru',   path: '/penjualan', icon: ShoppingCart },
                { label: 'Beli Bahan Baku',  path: '/modal',     icon: Wallet },
                { label: 'Produk Kue Baru',  path: '/produk',    icon: Package },
              ].map(({ label, path, icon: Icon }) => (
                <button
                  key={path}
                  onClick={() => handleAddAction(path)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <Icon size={15} className="text-gray-400" />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => {
              setShowNotifMenu(!showNotifMenu);
              if (!showNotifMenu) setUnreadCount(0);
            }}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 relative transition-colors"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-gray-900" />
            )}
          </button>

          {showNotifMenu && (
            <div className="absolute right-[-56px] sm:right-0 mt-2 w-[300px] sm:w-80 bg-white dark:bg-gray-900 rounded-2xl shadow-xl shadow-black/10 border border-gray-100 dark:border-gray-800 py-1.5 z-50 animate-fade-up">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <h3 className="font-bold text-sm text-gray-900 dark:text-white">Notifikasi</h3>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-6 text-center text-gray-400 text-sm">
                    Tidak ada notifikasi baru.
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <button
                      key={notif.id}
                      type="button"
                      onClick={() => {
                        setShowNotifMenu(false);
                        setUnreadCount(0);
                        navigate(notif.path || '/');
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-50 dark:border-gray-800/50 last:border-0 transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={15} className={cn('mt-0.5 shrink-0', notif.type === 'danger' ? 'text-red-500' : 'text-amber-500')} />
                        <div className="min-w-0">
                          <p className="text-sm text-gray-900 dark:text-gray-100 font-medium">{notif.title}</p>
                          <p className={cn('text-xs mt-0.5', notif.type === 'danger' ? 'text-red-500' : 'text-amber-500')}>
                            {notif.message}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
              <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-800 text-center">
                <button
                  onClick={() => setUnreadCount(0)}
                  className="text-xs font-semibold text-primary-600 hover:text-primary-700 transition-colors"
                >
                  Tandai semua dibaca
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Dark mode toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
          aria-label="Toggle tema"
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />

        {/* User menu */}
        <div className="relative" ref={userRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 p-1 pl-1 pr-2.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-fuchsia-400 to-violet-500 flex items-center justify-center text-white text-xs font-bold select-none">
              {initials}
            </div>
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 hidden sm:block truncate max-w-[100px]">
              {username}
            </span>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-900 rounded-2xl shadow-xl shadow-black/10 border border-gray-100 dark:border-gray-800 py-1.5 z-50 animate-fade-up">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 mb-1">
                <p className="text-sm text-gray-900 dark:text-white font-semibold truncate">{username}</p>
                <p className="text-xs text-gray-400 truncate mt-0.5">{user?.email || ''}</p>
              </div>
              <button
                onClick={() => { setShowUserMenu(false); navigate('/laporan'); }}
                className="w-full md:hidden flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <PieChart size={15} className="text-gray-400" /> Laporan Bisnis
              </button>
              <button
                onClick={() => { setShowUserMenu(false); navigate('/pengaturan'); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <Settings size={15} className="text-gray-400" /> Pengaturan
              </button>
              <div className="my-1 h-px bg-gray-100 dark:bg-gray-800" />
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <LogOut size={15} /> Keluar
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
