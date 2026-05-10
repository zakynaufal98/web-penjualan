import { NavLink } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  PieChart,
  Settings,
  Wallet,
  Calculator,
  ClipboardList,
  BookOpen,
  Cookie,
  ChevronLeft,
} from 'lucide-react';
import { cn } from '../../lib/utils';

const navSections = [
  {
    label: 'Operasional',
    items: [
      { name: 'Dashboard',    path: '/',          icon: LayoutDashboard, end: true },
      { name: 'Penjualan',    path: '/penjualan', icon: ShoppingCart },
      { name: 'Produksi',     path: '/produksi',  icon: ClipboardList },
      { name: 'Modal Bahan',  path: '/modal',     icon: Wallet },
    ],
  },
  {
    label: 'Produk & Resep',
    items: [
      { name: 'Produk',      path: '/produk', icon: Package },
      { name: 'Resep',       path: '/resep',  icon: BookOpen },
      { name: 'Hitung HPP',  path: '/hpp',    icon: Calculator },
    ],
  },
  {
    label: 'Analitik',
    items: [
      { name: 'Laporan',      path: '/laporan',     icon: PieChart },
      { name: 'Pengaturan',   path: '/pengaturan',  icon: Settings },
    ],
  },
];

export default function Sidebar() {
  const { sidebarOpen, toggleSidebar, setSidebarOpen, user } = useStore();

  const username = user?.email ? user.email.split('@')[0] : 'Admin';
  const initials = username.slice(0, 2).toUpperCase();

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          'hidden md:flex flex-col z-30 shrink-0 transition-all duration-300 ease-in-out overflow-hidden',
          sidebarOpen ? 'w-60' : 'w-[68px]'
        )}
        style={{ background: '#0D0920' }}
      >
        {/* ── Logo bar ── */}
        <div
          className={cn(
            'h-16 flex items-center shrink-0 border-b border-white/[0.06]',
            sidebarOpen ? 'px-4 justify-between' : 'justify-center'
          )}
        >
          {sidebarOpen ? (
            <>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center shadow-lg shadow-fuchsia-600/40 shrink-0">
                  <Cookie size={16} className="text-white" strokeWidth={2.5} />
                </div>
                <span className="font-extrabold text-[19px] text-white tracking-tight leading-none">
                  Kukis
                </span>
              </div>
              <button
                onClick={toggleSidebar}
                className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.08] transition-colors"
                aria-label="Tutup sidebar"
              >
                <ChevronLeft size={16} />
              </button>
            </>
          ) : (
            <button
              onClick={toggleSidebar}
              aria-label="Buka sidebar"
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center shadow-lg shadow-fuchsia-600/40 hover:shadow-fuchsia-500/50 transition-shadow"
            >
              <Cookie size={16} className="text-white" strokeWidth={2.5} />
            </button>
          )}
        </div>

        {/* ── Navigation ── */}
        <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-4 scrollbar-thin">
          {navSections.map((section, si) => (
            <div key={section.label}>
              {sidebarOpen ? (
                <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-white/50 px-3 mb-1.5">
                  {section.label}
                </p>
              ) : (
                si > 0 && <div className="h-px bg-white/[0.06] mx-2 mb-3" />
              )}

              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.end}
                      title={!sidebarOpen ? item.name : undefined}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-xl transition-all duration-150 text-[13.5px] font-medium',
                          sidebarOpen ? 'px-3 py-2.5' : 'justify-center p-2.5',
                          isActive
                            ? 'bg-fuchsia-600/90 text-white shadow-sm shadow-fuchsia-700/30'
                            : 'text-white/65 hover:text-white hover:bg-white/[0.07]'
                        )
                      }
                    >
                      <Icon size={18} className="shrink-0" />
                      {sidebarOpen && <span>{item.name}</span>}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>


        {/* ── User section ── */}
        {sidebarOpen && (
          <div className="p-2.5 border-t border-white/[0.06] shrink-0">
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.07] transition-colors cursor-default">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-fuchsia-400 to-violet-500 flex items-center justify-center text-white text-[11px] font-bold shrink-0 select-none">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-white/85 truncate leading-tight">
                  {username}
                </p>
                <p className="text-[10.5px] text-white/50 truncate leading-tight">
                  {user?.email || 'Pemilik Toko'}
                </p>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
