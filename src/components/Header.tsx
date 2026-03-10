import { Settings, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const Header = () => {
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

      <Link to="/settings">
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <Settings className="h-5 w-5" />
        </Button>
      </Link>
    </header>
  );
};

export default Header;
