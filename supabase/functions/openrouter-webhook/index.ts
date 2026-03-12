import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await req.json();
    console.log("Webhook received:", JSON.stringify(payload).slice(0, 500));

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // OpenRouter async webhook payload contains the generation result
    // The custom_data field carries our document_id
    const documentId = payload.custom_data?.document_id;
    if (!documentId) {
      console.error("No document_id in webhook payload");
      return new Response(JSON.stringify({ error: "Missing document_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if this is an error callback
    if (payload.error) {
      console.error("OpenRouter async error for document", documentId, payload.error);
      await supabase.from("documents").update({
        validation_status: "warning",
        validation_details: {
          summary: `Async processing error: ${payload.error.message || "Unknown error"}`,
          checks: [],
          ai_provider: "openrouter-async",
        },
        processed_at: new Date().toISOString(),
      }).eq("id", documentId);

      return new Response(JSON.stringify({ success: true, status: "error_recorded" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract the tool call result from the async response
    const choices = payload.choices || payload.response?.choices;
    const toolCall = choices?.[0]?.message?.tool_calls?.[0];

    let extracted = {
      document_type: "Other",
      candidate_name: "Unknown",
      confidence: 50,
      validation_status: "warning",
      checks: [] as { name: string; status: string; detail: string }[],
      issues: [] as string[],
      summary: "Async processing completed but could not fully parse results",
      extracted_id_number: null as string | null,
      stamp_date: null as string | null,
      stamp_date_valid: null as boolean | null,
      police_station: null as string | null,
      certification_authority: null as string | null,
      extracted_info: null as Record<string, any> | null,
    };

    if (toolCall?.function?.arguments) {
      try {
        extracted = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error("Failed to parse async AI response:", e);
      }
    }

    // Update document with async AI results
    await supabase.from("documents").update({
      document_type: extracted.document_type,
      candidate_name_extracted: extracted.candidate_name,
      confidence_score: extracted.confidence,
      validation_status: extracted.validation_status,
      issues: extracted.issues || [],
      validation_details: {
        summary: extracted.summary,
        checks: extracted.checks || [],
        extracted_id_number: extracted.extracted_id_number || null,
        stamp_date: extracted.stamp_date || null,
        stamp_date_valid: extracted.stamp_date_valid ?? null,
        police_station: extracted.police_station || null,
        certification_authority: extracted.certification_authority || null,
        extracted_info: extracted.extracted_info || null,
        ai_provider: "openrouter-async",
      },
      processed_at: new Date().toISOString(),
    }).eq("id", documentId);

    // Update candidate aggregation
    const { data: doc } = await supabase
      .from("documents")
      .select("session_id, candidate_name_extracted")
      .eq("id", documentId)
      .single();

    if (doc) {
      // Recalculate candidate status for this session
      const candidateName = extracted.candidate_name || doc.candidate_name_extracted || "Unknown";
      const { data: candidateDocs } = await supabase
        .from("documents")
        .select("*")
        .eq("session_id", doc.session_id)
        .eq("candidate_name_extracted", candidateName);

      if (candidateDocs && candidateDocs.length > 0) {
        const avgScore = Math.round(
          candidateDocs.reduce((sum, d) => sum + (Number(d.confidence_score) || 0), 0) / candidateDocs.length
        );
        const hasFailure = candidateDocs.some(d => d.validation_status === "fail");
        const hasWarning = candidateDocs.some(d => d.validation_status === "warning");
        const status = hasFailure ? "fail" : hasWarning ? "warning" : "pass";

        await supabase
          .from("candidates")
          .update({ score: avgScore, status })
          .eq("session_id", doc.session_id)
          .eq("name", candidateName);
      }

      // Check if all documents in session are processed
      const { data: allDocs } = await supabase
        .from("documents")
        .select("validation_status")
        .eq("session_id", doc.session_id);

      if (allDocs) {
        const allProcessed = allDocs.every(d => d.validation_status !== "pending" && d.validation_status !== "processing");
        if (allProcessed) {
          const hasIssues = allDocs.some(d => d.validation_status === "fail" || d.validation_status === "warning");
          await supabase.from("sessions").update({
            status: hasIssues ? "has-issues" : "complete",
            processed_documents: allDocs.length,
          }).eq("id", doc.session_id);
        }
      }
    }

    console.log("Webhook processed successfully for document:", documentId);
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Webhook processing error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
