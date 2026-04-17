import { useState, useEffect } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, Loader2, ExternalLink, Plus, Trash2, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import Header from "@/components/Header";
import { toast } from "sonner";
import { getSettings, updateSettings } from "@/lib/api";
import { useAuth, AdminUser } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface NewAdmin {
  email: string;
  name: string;
  surname: string;
  password: string;
  can_access_settings: boolean;
}

const Settings = () => {
  const { admin: currentAdmin } = useAuth();
  const [confidence, setConfidence] = useState(80);
  const [stampValidity, setStampValidity] = useState(3);
  const [strictMode, setStrictMode] = useState(false);
  const [fromEmail, setFromEmail] = useState("");
  const [emailExpanded, setEmailExpanded] = useState(false);
  const [apiExpanded, setApiExpanded] = useState(false);
  const [adminExpanded, setAdminExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Admin management state
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [newAdmin, setNewAdmin] = useState<NewAdmin>({
    email: "",
    name: "",
    surname: "",
    password: "",
    can_access_settings: false,
  });
  const [addingAdmin, setAddingAdmin] = useState(false);

  useEffect(() => {
    loadSettings();
    if (currentAdmin?.can_access_settings) {
      loadAdmins();
    }
  }, []);

  const loadAdmins = async () => {
    setLoadingAdmins(true);
    try {
      const { data, error } = await (supabase.rpc as any)("list_admin_users");
      if (error) throw error;
      setAdmins((data as AdminUser[]) || []);
    } catch (e) {
      console.error("Failed to load admins:", e);
    } finally {
      setLoadingAdmins(false);
    }
  };

  const handleAddAdmin = async () => {
    if (!newAdmin.email || !newAdmin.name || !newAdmin.surname || !newAdmin.password) {
      toast.error("Please fill in all fields");
      return;
    }

    // Validate email format
    if (!newAdmin.email.toLowerCase().endsWith("@capaciti.org.za")) {
      toast.error("Email must be a CAPACITI email (name.surname@capaciti.org.za)");
      return;
    }

    if (newAdmin.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setAddingAdmin(true);
    try {
      const { error } = await (supabase.rpc as any)("create_admin_user", {
        _email: newAdmin.email.toLowerCase().trim(),
        _name: newAdmin.name.trim(),
        _surname: newAdmin.surname.trim(),
        _password: newAdmin.password,
        _can_access_settings: newAdmin.can_access_settings,
      });

      if (error) throw error;

      toast.success("Admin added successfully");
      setNewAdmin({
        email: "",
        name: "",
        surname: "",
        password: "",
        can_access_settings: false,
      });
      loadAdmins();
    } catch (e: any) {
      console.error("Failed to add admin:", e);
      if (e.code === "23505") {
        toast.error("An admin with this email already exists");
      } else {
        toast.error("Failed to add admin");
      }
    } finally {
      setAddingAdmin(false);
    }
  };

  const handleDeleteAdmin = async (adminId: string) => {
    if (adminId === currentAdmin?.id) {
      toast.error("You cannot delete yourself");
      return;
    }

    try {
      const { error } = await (supabase.rpc as any)("delete_admin_user", { _id: adminId });

      if (error) throw error;

      toast.success("Admin removed successfully");
      loadAdmins();
    } catch (e) {
      console.error("Failed to delete admin:", e);
      toast.error("Failed to remove admin");
    }
  };

  const loadSettings = async () => {
    try {
      const settings = await getSettings();
      if (settings) {
        setConfidence(settings.confidence_threshold);
        setStampValidity(settings.stamp_validity_months);
        setStrictMode(settings.strict_mode);
        setFromEmail(settings.from_email || "");
      }
    } catch (e) {
      console.error("Failed to load settings:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings({
        confidence_threshold: confidence,
        stamp_validity_months: stampValidity,
        strict_mode: strictMode,
        from_email: fromEmail || undefined,
      });
      toast.success("Settings saved successfully. Changes will apply to all future validations.");
    } catch (e) {
      console.error("Failed to save settings:", e);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-8 w-8 text-purple animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="max-w-[900px] mx-auto px-8 py-12">
        <Link to="/" className="inline-flex items-center gap-1.5 text-muted-foreground text-sm mb-6 hover:text-space-kadet transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </Link>

        <h1 className="text-[32px] font-bold text-space-kadet mb-2">Validation Settings</h1>
        <p className="text-base text-muted-foreground mb-10">Configure global validation parameters. Changes apply to all future validations.</p>

        {/* Validation Thresholds */}
        <div className="vf-card mb-6">
          <h2 className="text-xl font-semibold text-space-kadet mb-6">Validation Thresholds</h2>

          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <label className="vf-label mb-0">Minimum AI Confidence to Pass Validation</label>
              <span className="text-2xl font-bold text-space-kadet">{confidence}%</span>
            </div>
            <input
              type="range"
              min="50"
              max="100"
              value={confidence}
              onChange={(e) => setConfidence(Number(e.target.value))}
              className="w-full h-2 bg-muted rounded-full appearance-none cursor-pointer accent-purple [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple [&::-webkit-slider-thumb]:shadow-md"
            />
            <p className="vf-helper">Lower = more permissive, Higher = more strict</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="vf-label mb-0">ID Stamp Must Be Certified Within</label>
              <span className="text-2xl font-bold text-space-kadet">{stampValidity} months</span>
            </div>
            <input
              type="range"
              min="1"
              max="12"
              value={stampValidity}
              onChange={(e) => setStampValidity(Number(e.target.value))}
              className="w-full h-2 bg-muted rounded-full appearance-none cursor-pointer accent-purple [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple [&::-webkit-slider-thumb]:shadow-md"
            />
            <p className="vf-helper">Documents certified older than this are flagged</p>
          </div>
        </div>

        {/* Validation Mode */}
        <div className="vf-card mb-6">
          <h2 className="text-xl font-semibold text-space-kadet mb-6">Validation Mode</h2>
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold text-space-kadet">Strict Mode</p>
              <p className="text-sm text-muted-foreground mt-1">When enabled, applies strictest interpretation of all rules. May increase false positives.</p>
            </div>
            <button
              onClick={() => setStrictMode(!strictMode)}
              className={`relative w-12 h-7 rounded-full transition-colors duration-200 ${strictMode ? "bg-purple" : "bg-muted"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-card rounded-full shadow-md transition-transform duration-200 ${strictMode ? "translate-x-5" : ""}`} />
            </button>
          </div>
        </div>

        {/* AI Provider */}
        <div className="vf-card mb-6">
          <button className="w-full flex items-center justify-between" onClick={() => setApiExpanded(!apiExpanded)}>
            <h2 className="text-xl font-semibold text-space-kadet">AI Provider</h2>
            {apiExpanded ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
          </button>
          {apiExpanded && (
            <div className="mt-6 space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg border border-border">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-success bg-success/10 px-2 py-0.5 rounded-full">Active</span>
                  <span className="text-sm font-semibold text-space-kadet">OpenRouter</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">All document analysis is powered through OpenRouter. Manage your models and billing from the OpenRouter dashboard.</p>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-sm font-semibold text-space-kadet mb-2">Supported Models</p>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>google/gemini-2.5-flash</span>
                    <span className="text-xs bg-muted px-2 py-0.5 rounded">Default — ~$0.001–$0.005/doc</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>openai/gpt-5.4</span>
                    <span className="text-xs bg-muted px-2 py-0.5 rounded">Premium — ~$0.02–$0.10/doc</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <a
                  href="https://openrouter.ai/settings/credits"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-purple hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Manage credits on OpenRouter
                </a>
                <p className="text-xs text-muted-foreground mt-2">
                  Your API key is stored securely as a backend secret. All AI processing goes through OpenRouter — switch models or manage billing from their dashboard.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Email Settings */}
        <div className="vf-card mb-8">
          <button className="w-full flex items-center justify-between" onClick={() => setEmailExpanded(!emailExpanded)}>
            <h2 className="text-xl font-semibold text-space-kadet">Email Settings</h2>
            {emailExpanded ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
          </button>
          {emailExpanded && (
            <div className="mt-6 space-y-4">
              <div>
                <label className="vf-label">From Email</label>
                <input
                  type="email"
                  className="vf-input"
                  placeholder="noreply@yourcompany.com"
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm">Send Test Email</Button>
            </div>
          )}
        </div>

        {/* Admin Management - Only visible to admins with settings access */}
        {currentAdmin?.can_access_settings && (
          <div className="vf-card mb-8">
            <button className="w-full flex items-center justify-between" onClick={() => setAdminExpanded(!adminExpanded)}>
              <h2 className="text-xl font-semibold text-space-kadet">Admin Management</h2>
              {adminExpanded ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
            </button>
            {adminExpanded && (
              <div className="mt-6 space-y-6">
                {/* Add New Admin Form */}
                <div className="p-4 bg-muted/50 rounded-lg border border-border">
                  <h3 className="font-semibold text-space-kadet mb-4 flex items-center gap-2">
                    <UserPlus className="h-4 w-4" />
                    Add New Admin
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="vf-label">Email</label>
                      <Input
                        type="email"
                        placeholder="name.surname@capaciti.org.za"
                        value={newAdmin.email}
                        onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="vf-label">Password</label>
                      <Input
                        type="password"
                        placeholder="Enter password"
                        value={newAdmin.password}
                        onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="vf-label">Name</label>
                      <Input
                        placeholder="Name"
                        value={newAdmin.name}
                        onChange={(e) => setNewAdmin({ ...newAdmin, name: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="vf-label">Surname</label>
                      <Input
                        placeholder="Surname"
                        value={newAdmin.surname}
                        onChange={(e) => setNewAdmin({ ...newAdmin, surname: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-4">
                    <Checkbox
                      id="canAccessSettings"
                      checked={newAdmin.can_access_settings}
                      onCheckedChange={(checked) => setNewAdmin({ ...newAdmin, can_access_settings: checked as boolean })}
                    />
                    <label htmlFor="canAccessSettings" className="text-sm text-foreground cursor-pointer">
                      Can access Settings
                    </label>
                  </div>
                  <Button
                    className="mt-4"
                    onClick={handleAddAdmin}
                    disabled={addingAdmin}
                  >
                    {addingAdmin ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Admin
                      </>
                    )}
                  </Button>
                </div>

                {/* Existing Admins List */}
                <div>
                  <h3 className="font-semibold text-space-kadet mb-4">Existing Admins</h3>
                  {loadingAdmins ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 text-purple animate-spin" />
                    </div>
                  ) : admins.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No other admins found</p>
                  ) : (
                    <div className="space-y-2">
                      {admins.map((admin) => (
                        <div
                          key={admin.id}
                          className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-purple/20 flex items-center justify-center">
                              <span className="text-sm font-semibold text-purple">
                                {admin.name.charAt(0)}{admin.surname.charAt(0)}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-foreground">{admin.name} {admin.surname}</p>
                              <p className="text-sm text-muted-foreground">{admin.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {admin.can_access_settings ? (
                              <span className="text-xs bg-purple/10 text-purple px-2 py-1 rounded-full">
                                Settings Access
                              </span>
                            ) : (
                              <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full">
                                No Settings
                              </span>
                            )}
                            {admin.id !== currentAdmin?.id && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-destructive"
                                onClick={() => handleDeleteAdmin(admin.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <Button variant="default" size="lg" className="w-full" onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Settings"
          )}
        </Button>
      </div>
    </div>
  );
};

export default Settings;
