import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const Header = () => {
  return (
    <header className="bg-space-kadet h-[72px] px-8 flex items-center justify-between shadow-[0_2px_4px_rgba(29,41,81,0.1)]">
      <Link to="/" className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-salmon flex items-center justify-center">
          <span className="text-accent-foreground font-bold text-sm">VF</span>
        </div>
        <div>
          <div className="text-primary-foreground text-xl font-bold leading-tight">VerifyFlow AI</div>
          <div className="text-primary-foreground/70 text-xs">Document Validation System</div>
        </div>
      </Link>
      <Link to="/settings">
        <Button variant="icon" size="icon" className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10">
          <Settings className="h-5 w-5" />
        </Button>
      </Link>
    </header>
  );
};

export default Header;
