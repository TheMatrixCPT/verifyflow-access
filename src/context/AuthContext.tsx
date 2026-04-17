import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  surname: string;
  can_access_settings: boolean;
}

interface AuthContextType {
  admin: AdminUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAdminSession();
  }, []);

  const checkAdminSession = async () => {
    try {
      const storedAdmin = localStorage.getItem("admin_user");
      if (storedAdmin) {
        const parsedAdmin = JSON.parse(storedAdmin) as AdminUser;
        setAdmin(parsedAdmin);
      }
    } catch (error) {
      console.error("Error checking admin session:", error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await (supabase.rpc as any)("verify_admin_login", {
        _email: email.toLowerCase().trim(),
        _password: password,
      });

      if (error) {
        console.error("Login RPC error:", error);
        return { success: false, error: "Login failed. Please try again." };
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        return { success: false, error: "Invalid email or password" };
      }

      const adminUser: AdminUser = {
        id: row.id,
        email: row.email,
        name: row.name,
        surname: row.surname,
        can_access_settings: row.can_access_settings,
      };

      localStorage.setItem("admin_user", JSON.stringify(adminUser));
      setAdmin(adminUser);

      return { success: true };
    } catch (error) {
      console.error("Login error:", error);
      return { success: false, error: "An error occurred during login" };
    }
  };

  const logout = async () => {
    localStorage.removeItem("admin_user");
    setAdmin(null);
  };

  return (
    <AuthContext.Provider value={{ admin, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export { useAuth } from "./useAuth";