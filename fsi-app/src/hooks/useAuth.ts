"use client";

import { create } from "zustand";

interface AuthState {
  token: string | null;
  userId: string | null;
  role: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  checkSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: typeof window !== "undefined" ? localStorage.getItem("fsi-token") : null,
  userId: null,
  role: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        set({ isLoading: false, error: data.error || "Login failed" });
        return false;
      }

      const data = await res.json();
      localStorage.setItem("fsi-token", data.token);
      set({
        token: data.token,
        userId: data.user.id,
        role: data.user.role,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
      return true;
    } catch {
      set({ isLoading: false, error: "Network error" });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem("fsi-token");
    set({
      token: null,
      userId: null,
      role: null,
      isAuthenticated: false,
      error: null,
    });
  },

  checkSession: async () => {
    const token = get().token || localStorage.getItem("fsi-token");
    if (!token) {
      set({ isLoading: false, isAuthenticated: false });
      return;
    }

    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        set({
          token,
          userId: data.userId,
          role: data.role,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        localStorage.removeItem("fsi-token");
        set({ token: null, isLoading: false, isAuthenticated: false });
      }
    } catch {
      // If API unreachable (dev mode without Supabase), allow as admin
      set({
        token,
        userId: "dev",
        role: "admin",
        isAuthenticated: true,
        isLoading: false,
      });
    }
  },
}));
