import { useState, useEffect } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, Loader2, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import { toast } from "sonner";
import { getSettings, updateSettings } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";

const Settings = () => {
  const [confidence, setConfidence] = useState(80);
  const [stampValidity, setStampValidity] = useState(3);
  const [strictMode, setStrictMode] = useState(false);
  const [fromEmail, setFromEmail] = useState("");
  const [apiExpanded, setApiExpanded] = useState(false);
  const [emailExpanded, setEmailExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // API key state
  const [openaiKey, setOpenaiKey] = useState("");
  const [falKey, setFalKey] = useState("");
  const [googleVisionKey, setGoogleVisionKey] = useState("");
  const [awsTextractKey, setAwsTextractKey] = useState("");
  const [apiKeysConfigured, setApiKeysConfigured] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [settings, apiKeysResult] = await Promise.all([
        getSettings(),
        supabase.functions.invoke("manage-api-keys", { method: "GET" }),
      ]);
      if (settings) {
        setConfidence(settings.confidence_threshold);
        setStampValidity(settings.stamp_validity_months);
        setStrictMode(settings.strict_mode);
        setFromEmail(settings.from_email || "");
      }
      if (apiKeysResult.data?.apiKeys) {
        setApiKeysConfigured(apiKeysResult.data.apiKeys);
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
      // Save general settings and API keys in parallel
      const apiKeysPayload: Record<string, string> = {};
      if (openaiKey) apiKeysPayload.openai = openaiKey;
      if (falKey) apiKeysPayload.fal = falKey;
      if (googleVisionKey) apiKeysPayload.google_vision = googleVisionKey;
      if (awsTextractKey) apiKeysPayload.aws_textract = awsTextractKey;

      const promises: Promise<any>[] = [
        updateSettings({
          confidence_threshold: confidence,
          stamp_validity_months: stampValidity,
          strict_mode: strictMode,
          from_email: fromEmail || undefined,
        }),
      ];

      if (Object.keys(apiKeysPayload).length > 0) {
        promises.push(
          supabase.functions.invoke("manage-api-keys", {
            method: "POST",
            body: apiKeysPayload,
          })
        );
      }

      await Promise.all(promises);

      // Update configured status and clear inputs
      if (Object.keys(apiKeysPayload).length > 0) {
        setApiKeysConfigured(prev => ({
          ...prev,
          ...(openaiKey ? { openai: true } : {}),
          ...(falKey ? { fal: true } : {}),
          ...(googleVisionKey ? { google_vision: true } : {}),
          ...(awsTextractKey ? { aws_textract: true } : {}),
        }));
        setOpenaiKey("");
        setFalKey("");
        setGoogleVisionKey("");
        setAwsTextractKey("");
      }

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

        {/* API Configuration */}
        <div className="vf-card mb-6">
          <button className="w-full flex items-center justify-between" onClick={() => setApiExpanded(!apiExpanded)}>
            <h2 className="text-xl font-semibold text-space-kadet">API Configuration</h2>
            {apiExpanded ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
          </button>
        {apiExpanded && (
            <div className="mt-6 space-y-6">
              <div className="p-4 bg-muted/50 rounded-lg border border-border">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-success bg-success/10 px-2 py-0.5 rounded-full">Active</span>
                  <span className="text-sm font-semibold text-space-kadet">Lovable AI (Built-in)</span>
                </div>
                <p className="vf-helper mb-0">Pre-configured AI gateway. Powers document analysis with Gemini & GPT models. No API key needed.</p>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-sm font-semibold text-space-kadet mb-3">Additional AI Providers (Optional)</p>
                <p className="vf-helper mb-4">Connect additional providers for enhanced image extraction, OCR, and document parsing capabilities.</p>

                <div className="space-y-4">
                  <div>
                    <label className="vf-label">OpenAI API Key</label>
                    <input type="password" className="vf-input" placeholder="sk-..." />
                    <p className="vf-helper">GPT-4o Vision for enhanced image analysis and document understanding</p>
                  </div>

                  <div>
                    <label className="vf-label">Fal.ai API Key</label>
                    <input type="password" className="vf-input" placeholder="fal-..." />
                    <p className="vf-helper">Fast image processing, OCR, and visual document extraction</p>
                  </div>

                  <div>
                    <label className="vf-label">Google Cloud Vision API Key</label>
                    <input type="password" className="vf-input" placeholder="AIza..." />
                    <p className="vf-helper">Advanced OCR, handwriting recognition, and stamp/seal detection</p>
                  </div>

                  <div>
                    <label className="vf-label">AWS Textract Access Key</label>
                    <input type="password" className="vf-input" placeholder="AKIA..." />
                    <p className="vf-helper">Table extraction, form parsing, and structured data extraction from documents</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">
                  These keys are stored securely and used server-side only. The built-in Lovable AI handles all core validation. Additional providers enhance specific capabilities like handwriting OCR, stamp detection, and table extraction.
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
