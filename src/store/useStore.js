import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useStore = create(
  persist(
    (set) => ({
      theme: 'light',
      toggleTheme: () =>
        set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      setTheme: (theme) => set({ theme }),

      sidebarOpen: true,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      user: null,
      setUser: (user) => set({ user }),

      profileName: 'Admin Kukis',
      setProfileName: (profileName) => set({ profileName }),

      bankInfo: { bank: '', owner: '', number: '' },
      setBankInfo: (info) => set({ bankInfo: info }),

      notificationSettings: {
        lowStock: true,
        productLowStockThreshold: 5,
        ingredientLowStock: true,
        largeExpense: true,
        largeExpenseThreshold: 1000000,
      },
      setNotificationSettings: (settings) =>
        set((state) => ({
          notificationSettings: { ...state.notificationSettings, ...settings },
        })),
    }),
    {
      name: 'kukis-storage',
    }
  )
);
