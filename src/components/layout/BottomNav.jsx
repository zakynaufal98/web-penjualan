import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, ClipboardList, Wallet,
  MoreHorizontal, Package, BookOpen, Calculator, PieChart, Settings
} from 'lucide-react';
import { cn } from '../../lib/utils';

const mainNavItems = [
  { name: 'Home', path: '/', icon: LayoutDashboard, end: true },
  { name: 'Jual', path: '/penjualan', icon: ShoppingCart },
  { name: 'Produksi', path: '/produksi', icon: ClipboardList },
  { name: 'Beli', path: '/modal', icon: Wallet },
];

const moreNavItems = [
  { name: 'Produk', path: '/produk', icon: Package },
  { name: 'Resep', path: '/resep', icon: BookOpen },
  { name: 'Hitung HPP', path: '/hpp', icon: Calculator },
  { name: 'Laporan', path: '/laporan', icon: PieChart },
  { name: 'Pengaturan', path: '/pengaturan', icon: Settings },
];

export default function BottomNav() {
  const [showMore, setShowMore] = useState(false);
  const navigate = useNavigate();

  const handleMoreNav = (path) => {
    setShowMore(false);
    navigate(path);
  };

  return (
    <>
      {/* Overlay gelap */}
      {showMore && (
        <div
          className="fixed inset-0 z-30 md:hidden bg-black/30"
          onClick={() => setShowMore(false)}
        />
      )}

      {/* Panel "Lainnya" */}
      {showMore && (
        <div className="fixed bottom-16 left-0 right-0 z-40 md:hidden bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 rounded-t-2xl shadow-xl px-4 pt-3 pb-4">
          <div className="w-10 h-1 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-4" />
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3 px-1">Menu Lainnya</p>
          <div className="grid grid-cols-4 gap-2">
            {moreNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.path}
                  onClick={() => handleMoreNav(item.path)}
                  className="flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
                >
                  <Icon size={22} />
                  <span className="text-[10px] font-medium text-center leading-tight">{item.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom Nav Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 z-40 pb-safe">
        <div className="flex items-center justify-around px-2 h-16">
          {mainNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                onClick={() => setShowMore(false)}
                className={({ isActive }) => cn(
                  "flex flex-col items-center justify-center w-full h-full gap-1 transition-colors",
                  isActive
                    ? "text-primary-600 dark:text-primary-400"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                )}
              >
                <Icon size={20} className="shrink-0" />
                <span className="text-[10px] font-medium">{item.name}</span>
              </NavLink>
            );
          })}

          {/* Tombol Lainnya */}
          <button
            onClick={() => setShowMore(!showMore)}
            className={cn(
              "flex flex-col items-center justify-center w-full h-full gap-1 transition-colors",
              showMore
                ? "text-primary-600 dark:text-primary-400"
                : "text-gray-500 dark:text-gray-400"
            )}
          >
            <MoreHorizontal size={20} />
            <span className="text-[10px] font-medium">Lainnya</span>
          </button>
        </div>
      </nav>
    </>
  );
}
