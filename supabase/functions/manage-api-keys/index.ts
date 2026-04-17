import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (req.method === "GET") {
      // Return which keys are configured (masked, not the actual values)
      const { data: settings } = await supabase
        .from("settings")
        .select("api_key_encrypted")
        .limit(1)
        .single();

      let apiKeys: Record<string, boolean> = {
        openai: false,
        fal: false,
        google_vision: false,
        aws_textract: false,
      };

      if (settings?.api_key_encrypted) {
        try {
          const stored = JSON.parse(settings.api_key_encrypted);
          apiKeys = {
            openai: !!stored.openai,
            fal: !!stored.fal,
            google_vision: !!stored.google_vision,
            aws_textract: !!stored.aws_textract,
          };
        } catch {
          // ignore parse errors
        }
      }

      return new Response(JSON.stringify({ apiKeys }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST") {
      const { openai, fal, google_vision, aws_textract } = await req.json();

      // Get existing keys to merge (only update non-empty values)
      const { data: settings } = await supabase
        .from("settings")
        .select("id, api_key_encrypted")
        .limit(1)
        .single();

      if (!settings) {
        return new Response(JSON.stringify({ error: "No settings found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let existing: Record<string, string> = {};
      if (settings.api_key_encrypted) {
        try {
          existing = JSON.parse(settings.api_key_encrypted);
        } catch {
          // start fresh
        }
      }

      // Only update keys that were provided (non-empty string)
      if (openai !== undefined && openai !== "") existing.openai = openai;
      if (fal !== undefined && fal !== "") existing.fal = fal;
      if (google_vision !== undefined && google_vision !== "") existing.google_vision = google_vision;
      if (aws_textract !== undefined && aws_textract !== "") existing.aws_textract = aws_textract;

      // Allow clearing keys by passing null
      if (openai === null) delete existing.openai;
      if (fal === null) delete existing.fal;
      if (google_vision === null) delete existing.google_vision;
      if (aws_textract === null) delete existing.aws_textract;

      const { error } = await supabase
        .from("settings")
        .update({ api_key_encrypted: JSON.stringify(existing) })
        .eq("id", settings.id);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  } catch (error) {
    console.error("Error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
