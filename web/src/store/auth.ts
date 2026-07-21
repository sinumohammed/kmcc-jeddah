import { create } from 'zustand';
import type { AuthMember } from '../types';

interface AuthState {
  token: string | null;
  member: AuthMember | null;
  login: (token: string, member: AuthMember) => void;
  logout: () => void;
}

const storedToken = localStorage.getItem('kmcc_token');
const storedMember = localStorage.getItem('kmcc_member');

export const useAuthStore = create<AuthState>((set) => ({
  token: storedToken,
  member: storedMember ? JSON.parse(storedMember) : null,
  login: (token, member) => {
    localStorage.setItem('kmcc_token', token);
    localStorage.setItem('kmcc_member', JSON.stringify(member));
    set({ token, member });
  },
  logout: () => {
    localStorage.removeItem('kmcc_token');
    localStorage.removeItem('kmcc_member');
    set({ token: null, member: null });
  },
}));
