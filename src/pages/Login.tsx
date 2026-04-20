import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, FileCheck2, Award, ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import capacitiMark from "@/assets/capaciti-mark.png";

type LoginMode = "validation" | "assessment";

const Login = () => {
  const [mode, setMode] = useState<LoginMode>("validation");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !password.trim()) {
      toast.error("Please enter both email and password");
      return;
    }

    setLoading(true);
    const result = await login(email, password);
    setLoading(false);

    if (result.success) {
      toast.success("Welcome back!");
      navigate(mode === "assessment" ? "/assessment" : "/");
    } else {
      toast.error(result.error || "Login failed");
    }
  };

  return (
    <div className="min-h-screen w-full bg-background lg:grid lg:grid-cols-[1.1fr_1fr] xl:grid-cols-[1.2fr_1fr] overflow-hidden">
      {/* LEFT — Brand panel */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-space-kadet text-white p-12 xl:p-16">
        {/* Layered gradient blobs */}
        <div
          aria-hidden
          className="absolute -top-32 -left-32 h-[480px] w-[480px] rounded-full blur-3xl opacity-60"
          style={{ background: "radial-gradient(circle, hsl(var(--purple)) 0%, transparent 70%)" }}
        />
        <div
          aria-hidden
          className="absolute -bottom-40 -right-20 h-[520px] w-[520px] rounded-full blur-3xl opacity-50"
          style={{ background: "radial-gradient(circle, hsl(var(--salmon)) 0%, transparent 70%)" }}
        />
        {/* Diagonal grid lines */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--pink)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--pink)) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        {/* Top: Logo */}
        <div className="relative z-10 gap-3 animate-fade-in-up flex items-center justify-center">
          <img src={capacitiMark} alt="CAPACITI" className="h-11 w-11 drop-shadow-lg" />
          <div className="leading-tight">
            <div className="text-[11px] uppercase tracking-[0.25em] text-pink/70">CAPACITI</div>
            <div className="text-lg font-semibold tracking-wide">VerifyFlow AI</div>
          </div>
        </div>

        {/* Center: Floating mark + headline */}
        <div className="relative z-10 flex-col gap-10 my-8 flex items-center justify-start">
          <div className="relative h-56 w-56 xl:h-64 xl:w-64">
            <div
              aria-hidden
              className="absolute inset-0 rounded-full blur-2xl opacity-50"
              style={{ background: "radial-gradient(circle, hsl(var(--salmon)) 0%, transparent 60%)" }}
            />
            <img
              src={capacitiMark}
              alt=""
              aria-hidden
              className="relative h-full w-full animate-float drop-shadow-2xl"
            />
            <div
              aria-hidden
              className="absolute inset-[-12%] rounded-full border border-pink/15 animate-spin-slow"
            />
            <div
              aria-hidden
              className="absolute inset-[-24%] rounded-full border border-pink/10 animate-spin-slow"
              style={{ animationDirection: "reverse", animationDuration: "60s" }}
            />
          </div>

          <div className="space-y-5 max-w-md animate-fade-in-up text-center" style={{ animationDelay: "120ms", opacity: 0 }}>
            <div className="inline-flex items-center gap-2 rounded-full border border-pink/20 bg-white/5 backdrop-blur px-3 py-1 text-xs font-medium text-pink/90 text-center">
              <Sparkles className="h-3.5 w-3.5 text-salmon" />
              Trusted internal portal
            </div>
            <h1 className="text-white text-4xl xl:text-5xl font-bold leading-[1.05] tracking-tight">
              Validate documents.
              <br />
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage: "linear-gradient(90deg, hsl(var(--salmon)), hsl(var(--pink)))",
                }}
              >
                Issue certificates.
              </span>
            </h1>
            <p className="text-pink/70 text-base leading-relaxed">
              One secure portal for the CAPACITI team — verify HR documents and generate
              assessment results in seconds.
            </p>
          </div>
        </div>

        {/* Bottom: Trust strip */}
        <div className="relative z-10 flex items-center gap-6 text-xs text-pink/60 animate-fade-in-up" style={{ animationDelay: "240ms", opacity: 0 }}>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-salmon" />
            <span>Encrypted &amp; access-controlled</span>
          </div>
          <span aria-hidden className="h-1 w-1 rounded-full bg-pink/30" />
          <span>© {new Date().getFullYear()} CAPACITI</span>
        </div>
      </aside>

      {/* RIGHT — Form panel */}
      <main className="relative flex items-center justify-center p-6 sm:p-10 lg:p-12 min-h-screen">
        {/* Mobile gradient backdrop */}
        <div
          aria-hidden
          className="absolute inset-0 lg:hidden opacity-40"
          style={{
            background:
              "radial-gradient(ellipse at top right, hsl(var(--purple) / 0.18), transparent 60%), radial-gradient(ellipse at bottom left, hsl(var(--salmon) / 0.12), transparent 60%)",
          }}
        />

        <div className="relative w-full max-w-md animate-fade-in-up">
          {/* Mobile-only logo */}
          <div className="flex lg:hidden items-center gap-3 mb-8">
            <img src={capacitiMark} alt="CAPACITI" className="h-10 w-10" />
            <div className="leading-tight">
              <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">CAPACITI</div>
              <div className="text-base font-semibold text-space-kadet">VerifyFlow AI</div>
            </div>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-3xl sm:text-[34px] font-bold text-space-kadet leading-tight tracking-tight">
              Welcome back
            </h2>
            <p className="text-muted-foreground mt-2 text-[15px]">
              Sign in to continue to your workspace.
            </p>
          </div>

          {/* Card with subtle gradient border */}
          <div className="relative rounded-2xl p-[1.5px] bg-gradient-to-br from-purple/40 via-border to-salmon/30 shadow-[0_20px_60px_-20px_hsl(var(--space-kadet)/0.25)]">
            <div className="relative rounded-2xl bg-card p-7 sm:p-8">
              {/* Portal selector — segmented */}
              <div className="mb-6">
                <label className="vf-label">Choose your portal</label>
                <Select value={mode} onValueChange={(v) => setMode(v as LoginMode)}>
                  <SelectTrigger className="vf-input h-12">
                    <div className="flex items-center gap-2.5">
                      {mode === "validation" ? (
                        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-purple/10 text-purple">
                          <FileCheck2 className="h-4 w-4" />
                        </span>
                      ) : (
                        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-salmon/10 text-salmon">
                          <Award className="h-4 w-4" />
                        </span>
                      )}
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="validation">Document Validation</SelectItem>
                    <SelectItem value="assessment">Assessment Tools</SelectItem>
                  </SelectContent>
                </Select>
                <p className="vf-helper">
                  {mode === "assessment"
                    ? "Generate certificates and results from Forms exports."
                    : "Validate HR documents and manage candidate sessions."}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="email" className="vf-label">
                    Email address
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name.surname@capaciti.org.za"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="vf-input h-12"
                    autoComplete="email"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="vf-label">
                    Password
                  </label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="vf-input h-12 pr-11"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-space-kadet hover:bg-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple"
                    >
                      {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="group relative w-full h-12 rounded-lg text-white font-semibold overflow-hidden transition-all hover:shadow-[0_10px_30px_-10px_hsl(var(--purple)/0.6)] focus-visible:ring-2 focus-visible:ring-purple focus-visible:ring-offset-2"
                  style={{
                    backgroundImage:
                      "linear-gradient(135deg, hsl(var(--purple)) 0%, hsl(var(--space-kadet)) 100%)",
                  }}
                >
                  {loading ? (
                    <span className="flex items-center justify-center">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      Sign in
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  )}
                </Button>
              </form>
            </div>
          </div>

          <p className="text-center text-muted-foreground text-xs mt-6 flex items-center justify-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Authorized CAPACITI personnel only
          </p>
        </div>
      </main>
    </div>
  );
};

export default Login;
