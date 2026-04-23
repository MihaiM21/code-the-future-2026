import { create } from "zustand";
import { persist } from "zustand/middleware";

export type UserRole = "user" | "authorized_user";

export interface User {
  id: number;
  username: string;
  email: string;
  role: UserRole;
}

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  isAuthorized: boolean;
  login: (user: User) => void;
  logout: () => void;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isAuthorized: false,
      login: (user: User) => {
        set({
          user,
          isAuthenticated: true,
          isAuthorized: user.role === "authorized_user",
        });
      },
      logout: () => {
        set({ user: null, isAuthenticated: false, isAuthorized: false });
      },
      setUser: (user: User | null) => {
        set({
          user,
          isAuthenticated: user !== null,
          isAuthorized: user?.role === "authorized_user",
        });
      },
    }),
    {
      name: "auth-store",
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        isAuthorized: state.isAuthorized,
      }),
    }
  )
);
