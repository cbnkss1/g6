import { create } from "zustand";

type AdminUiState = {
  mobileNavOpen: boolean;
  sidebarCollapsed: boolean;
  setMobileNavOpen: (v: boolean) => void;
  toggleSidebar: () => void;
};

export const useAdminUiStore = create<AdminUiState>((set) => ({
  mobileNavOpen: false,
  sidebarCollapsed: false,
  setMobileNavOpen: (v) => set({ mobileNavOpen: v }),
  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));
