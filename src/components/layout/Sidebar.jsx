import { NavLink } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  PieChart,
  Settings,
  Menu,
  Wallet,
  Calculator,
  ClipboardList,
  BookOpen
} from 'lucide-react';
import { cn } from '../../lib/utils';

const navItems = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Penjualan', path: '/penjualan', icon: ShoppingCart },
  { name: 'Produksi', path: '/produksi', icon: ClipboardList },
  { name: 'Modal Bahan', path: '/modal', icon: Wallet },
  { name: 'Resep', path: '/resep', icon: BookOpen },
  { name: 'Produk', path: '/produk', icon: Package },
  { name: 'Hitung HPP', path: '/hpp', icon: Calculator },
  { name: 'Laporan', path: '/laporan', icon: PieChart },
  { name: 'Pengaturan', path: '/pengaturan', icon: Settings },
];

export default function Sidebar() {
  const { sidebarOpen, setSidebarOpen, user } = useStore();

  return (
    <>
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col inset-y-0 left-0 z-30 w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transition-all duration-300 ease-in-out",
          sidebarOpen ? "w-64" : "w-20"
        )}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-800">
          <div className={cn("font-bold text-xl text-primary-600 dark:text-primary-400 truncate transition-all", !sidebarOpen && "lg:hidden")}>
            CakeFinance
          </div>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 lg:hidden"
          >
            <Menu size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group",
                  isActive
                    ? "bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 font-medium"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
                )}
              >
                <Icon size={22} className="shrink-0" />
                <span className={cn("transition-opacity duration-200", !sidebarOpen && "lg:hidden")}>
                  {item.name}
                </span>
              </NavLink>
            );
          })}
        </nav>

      </aside>
    </>
  );
}
