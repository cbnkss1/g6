"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SiteConfigState = {
  site_id: string;
  site_name: string;
  is_casino_enabled: boolean;
  is_powerball_enabled: boolean;
  is_toto_enabled: boolean;
};

export type UserPublicState = {
  id: number;
  login_id: string;
  display_name: string | null;
  role: string;
  site_id: string;
  is_store_enabled?: boolean;
  is_partner?: boolean;
  /** 슈퍼가 켠 하부 관리자(파트너) 제한 UI */
  admin_partner_limited_ui?: boolean;
};

type AuthState = {
  token: string | null;
  user: UserPublicState | null;
  site: SiteConfigState | null;
  setSession: (token: string, user: UserPublicState, site: SiteConfigState) => void;
  setSite: (site: SiteConfigState) => void;
  setUser: (user: UserPublicState) => void;
  clear: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      site: null,
      setSession: (token, user, site) => set({ token, user, site }),
      setSite: (site) => set({ site }),
      setUser: (user) => set({ user }),
      clear: () => set({ token: null, user: null, site: null }),
    }),
    { name: "gp-admin-auth" },
  ),
);
