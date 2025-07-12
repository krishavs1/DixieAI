import { create } from 'zustand';

interface AuthState {
  isAuthenticated: boolean;
  user: {
    id: string;
    email: string;
    name: string;
    picture?: string;
  } | null;
  accessToken: string | null;
  refreshToken: string | null;
  login: (user: any, tokens: { accessToken: string; refreshToken: string }) => void;
  logout: () => void;
  updateTokens: (tokens: { accessToken: string; refreshToken: string }) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  user: null,
  accessToken: null,
  refreshToken: null,
  login: (user, tokens) => set({
    isAuthenticated: true,
    user,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  }),
  logout: () => set({
    isAuthenticated: false,
    user: null,
    accessToken: null,
    refreshToken: null,
  }),
  updateTokens: (tokens) => set({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  }),
})); 