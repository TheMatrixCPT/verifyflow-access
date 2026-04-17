import { Settings, Search, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

const Header = () => {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <header className="bg-card h-[64px] px-6 flex items-center justify-between border-b border-border">
      <Link to="/" className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-purple flex items-center justify-center">
          <span className="text-primary-foreground font-bold text-sm">VF</span>
        </div>
        <span className="text-foreground text-lg font-bold">VerifyFlow AI</span>
      </Link>

      <div className="flex-1 max-w-[500px] mx-8">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            className="vf-input pl-10 h-10 bg-background"
            placeholder="Search documents, users, or settings..."
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Admin Name Display */}
        {admin && (
          <div className="flex items-center gap-2 text-sm text-foreground">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{admin.name} {admin.surname}</span>
          </div>
        )}

        {admin?.can_access_settings && (
          <Link to="/settings">
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
              <Settings className="h-5 w-5" />
            </Button>
          </Link>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground"
          onClick={handleLogout}
          title="Sign out"
        >
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
};

export default Header;
