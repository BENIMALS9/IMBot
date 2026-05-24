import { create } from "zustand";
import { authApi } from "@/lib/api";
import type { UserInfo } from "@/types";

interface AuthState {
  user: UserInfo | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem("token"),
  loading: true,
  login: async (username, password) => {
    const res = await authApi.login({ username, password });
    const token = res.data.access_token;
    localStorage.setItem("token", token);
    set({ token });
  },
  register: async (username, password) => {
    const res = await authApi.register({ username, password });
    const token = res.data.access_token;
    localStorage.setItem("token", token);
    set({ token });
  },
  logout: () => {
    localStorage.removeItem("token");
    set({ token: null, user: null });
  },
  checkAuth: async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      set({ loading: false });
      return;
    }
    try {
      const res = await authApi.me();
      set({ user: res.data, token, loading: false });
    } catch {
      localStorage.removeItem("token");
      set({ token: null, user: null, loading: false });
    }
  },
}));
