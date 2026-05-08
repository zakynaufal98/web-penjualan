import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Calculator,
  Wallet
} from 'lucide-react';
import { cn } from '../../lib/utils';

const navItems = [
  { name: 'Home', path: '/', icon: LayoutDashboard },
  { name: 'Jual', path: '/penjualan', icon: ShoppingCart },
  { name: 'Beli', path: '/modal', icon: Wallet },
  { name: 'Produk', path: '/produk', icon: Package },
  { name: 'HPP', path: '/hpp', icon: Calculator },
];

export default function BottomNav() {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 z-40 pb-safe">
      <div className="flex items-center justify-around px-2 h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => cn(
                "flex flex-col items-center justify-center w-full h-full gap-1 transition-colors",
                isActive 
                  ? "text-primary-600 dark:text-primary-400" 
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              )}
            >
              <Icon size={20} className={cn("shrink-0")} />
              <span className="text-[10px] font-medium">{item.name}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
