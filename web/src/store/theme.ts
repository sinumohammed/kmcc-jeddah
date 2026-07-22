import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark';

interface ThemeState {
  mode: ThemeMode;
  toggle: () => void;
  setMode: (mode: ThemeMode) => void;
}

const stored = localStorage.getItem('kmcc_theme');
const initial: ThemeMode = stored === 'dark' ? 'dark' : 'light';

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: initial,
  toggle: () => {
    const next = get().mode === 'dark' ? 'light' : 'dark';
    localStorage.setItem('kmcc_theme', next);
    set({ mode: next });
  },
  setMode: (mode) => {
    localStorage.setItem('kmcc_theme', mode);
    set({ mode });
  },
}));
