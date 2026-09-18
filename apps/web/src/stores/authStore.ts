import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'PRODUCTION_PLANNER' | 'MATERIAL_PLANNER' | 'USER' | 'VIEWER';

export type ModuleName = 'production' | 'material' | 'masterdata' | 'system';

interface User {
  id: string;
  name: string;
  email: string;
  role: Role; // Updated to specific Role type
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  
  // Actions
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  updateAccessToken: (token: string) => void;
  
  // Permissions derived from current user role
  canEdit: (module: ModuleName) => boolean;
  canView: (module: ModuleName) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      
      setAuth: (user, accessToken, refreshToken) => set({ user, accessToken, refreshToken }),
      logout: () => set({ user: null, accessToken: null, refreshToken: null }),
      updateAccessToken: (accessToken) => set({ accessToken }),
      
      canEdit: (module) => {
        const user = get().user;
        if (!user) return false;
        
        switch (user.role) {
          case 'SUPER_ADMIN':
          case 'ADMIN':
            return true;
          case 'PRODUCTION_PLANNER':
            return module === 'production' || module === 'masterdata';
          case 'MATERIAL_PLANNER':
            return module === 'material' || module === 'masterdata';
          case 'USER':
          case 'VIEWER':
            return false;
          default:
            return false;
        }
      },
      
      canView: (_module) => {
        const user = get().user;
        if (!user) return false;
        
        switch (user.role) {
          case 'SUPER_ADMIN':
          case 'ADMIN':
          case 'PRODUCTION_PLANNER':
          case 'MATERIAL_PLANNER':
          case 'USER':
          case 'VIEWER':
            return true;
          default:
            return false;
        }
      }
    }),
    {
      name: 'auth-storage',
    }
  )
);
