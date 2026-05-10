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

      bankInfo: { bank: '', owner: '', number: '' },
      setBankInfo: (info) => set({ bankInfo: info }),
    }),
    {
      name: 'kukis-storage',
    }
  )
);
