import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { document_id, file_url, file_name } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update document status to processing
    await supabase.from("documents").update({ validation_status: "processing" }).eq("id", document_id);

    // Use Lovable AI to analyze the document based on filename and metadata
    const analysisPrompt = `Analyze this document filename and determine:
1. The type of document (one of: "ID Document", "Qualification", "Proof of Address", "Tax Certificate", "Police Clearance", "CV/Resume", "Reference Letter", "Medical Certificate", "Bank Statement", "Employment Contract", "Other")
2. Extract any person's name that might be in the filename
3. Provide a validation assessment

Filename: "${file_name}"

Respond using the extract_document_info function.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a document classification AI for HR document validation. You analyze document filenames and metadata to determine document type and extract candidate names. Be precise and professional. Common document types in HR: ID documents (passport, driver's license, national ID), qualifications (degrees, diplomas, certificates), proof of address (utility bills, bank statements showing address), tax certificates, police clearance certificates, CVs/resumes, reference letters, medical certificates, bank statements, employment contracts.`
          },
          { role: "user", content: analysisPrompt }
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_document_info",
            description: "Extract document type and candidate name from a document",
            parameters: {
              type: "object",
              properties: {
                document_type: {
                  type: "string",
                  enum: ["ID Document", "Qualification", "Proof of Address", "Tax Certificate", "Police Clearance", "CV/Resume", "Reference Letter", "Medical Certificate", "Bank Statement", "Employment Contract", "Other"],
                  description: "The type of HR document"
                },
                candidate_name: {
                  type: "string",
                  description: "The person's name extracted from the filename, or 'Unknown' if not determinable"
                },
                confidence: {
                  type: "number",
                  description: "Confidence score from 0 to 100"
                },
                validation_status: {
                  type: "string",
                  enum: ["pass", "warning", "fail"],
                  description: "Initial validation status based on filename analysis"
                },
                issues: {
                  type: "array",
                  items: { type: "string" },
                  description: "Any issues found"
                },
                summary: {
                  type: "string",
                  description: "Brief validation summary"
                }
              },
              required: ["document_type", "candidate_name", "confidence", "validation_status", "summary"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "extract_document_info" } }
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const errText = await aiResponse.text();
      console.error("AI error:", status, errText);
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    let extracted = {
      document_type: "Other",
      candidate_name: "Unknown",
      confidence: 50,
      validation_status: "warning",
      issues: [] as string[],
      summary: "Could not fully analyze document"
    };

    if (toolCall?.function?.arguments) {
      try {
        extracted = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error("Failed to parse AI response:", e);
      }
    }

    // Update document with AI results
    await supabase.from("documents").update({
      document_type: extracted.document_type,
      candidate_name_extracted: extracted.candidate_name,
      confidence_score: extracted.confidence,
      validation_status: extracted.validation_status,
      issues: extracted.issues || [],
      validation_details: { summary: extracted.summary },
      processed_at: new Date().toISOString(),
    }).eq("id", document_id);

    return new Response(JSON.stringify({
      success: true,
      document_id,
      ...extracted,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("process-document error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
