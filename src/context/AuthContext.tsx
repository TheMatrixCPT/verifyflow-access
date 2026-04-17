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

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
      // Fetch admin user by email
      const { data: adminData, error: fetchError } = await supabase
        .from("admin_users")
        .select("*")
        .eq("email", email.toLowerCase().trim())
        .single();

      if (fetchError || !adminData) {
        return { success: false, error: "Invalid email or password" };
      }

      // Simple password comparison for demo
      if (adminData.password_hash !== password) {
        return { success: false, error: "Invalid email or password" };
      }

      const adminUser: AdminUser = {
        id: adminData.id,
        email: adminData.email,
        name: adminData.name,
        surname: adminData.surname,
        can_access_settings: adminData.can_access_settings,
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

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};