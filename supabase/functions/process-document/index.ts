import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const toolSchema = {
  type: "function",
  function: {
    name: "extract_document_info",
    description: "Extract and validate document information, including all readable content",
    parameters: {
      type: "object",
      properties: {
        document_type: {
          type: "string",
          enum: [
            "ID Document", "Signed Contract", "EEA1 Form", "Affidavit",
            "Attendance Register", "Qualification", "Proof of Address",
            "Tax Certificate", "Police Clearance", "CV/Resume",
            "Reference Letter", "Medical Certificate", "Bank Statement",
            "Employment Contract", "Other"
          ],
          description: "The type of HR document"
        },
        candidate_name: { type: "string", description: "Person's full name or 'Unknown'" },
        confidence: { type: "number", description: "Confidence score 0-100" },
        validation_status: { type: "string", enum: ["pass", "warning", "fail"] },
        checks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              status: { type: "string", enum: ["pass", "warning", "fail"] },
              detail: { type: "string" }
            },
            required: ["name", "status", "detail"]
          }
        },
        issues: { type: "array", items: { type: "string" } },
        summary: { type: "string", description: "Plain-English validation summary" },
        extracted_id_number: { type: "string", description: "SA ID number if found (13 digits)" },
        stamp_date: { type: "string", description: "Date on certification stamp if found (ISO format YYYY-MM-DD)" },
        stamp_date_valid: { type: "boolean", description: "Whether the stamp date is within the configured validity period" },
        police_station: { type: "string", description: "Police station name if found on stamp or document" },
        certification_authority: { type: "string", description: "Commissioner of Oaths or Police station that certified the document" },
        extracted_info: {
          type: "object",
          description: "All extracted information from the document",
          properties: {
            full_name: { type: "string", description: "Full name of person on document" },
            id_number: { type: "string", description: "ID number if present" },
            date_of_birth: { type: "string", description: "Date of birth if present" },
            gender: { type: "string", description: "Gender if present" },
            nationality: { type: "string", description: "Nationality or citizenship status" },
            address: { type: "string", description: "Physical address if present" },
            phone_number: { type: "string", description: "Phone number if present" },
            email: { type: "string", description: "Email address if present" },
            employer: { type: "string", description: "Employer name if present" },
            job_title: { type: "string", description: "Job title or position if present" },
            qualification_name: { type: "string", description: "Qualification/certificate name if applicable" },
            institution: { type: "string", description: "Educational institution if applicable" },
            issue_date: { type: "string", description: "Document issue date" },
            expiry_date: { type: "string", description: "Document expiry date if present" },
            reference_number: { type: "string", description: "Reference or document number" },
            signature_present: { type: "boolean", description: "Whether a signature is present" },
            additional_notes: { type: "string", description: "Any other extracted text or notable information" }
          }
        }
      },
      required: ["document_type", "candidate_name", "confidence", "validation_status", "checks", "issues", "summary", "extracted_info"],
      additionalProperties: false
    }
  }
};

function buildSystemPrompt(confidenceThreshold: number, stampValidityMonths: number, strictMode: boolean): string {
  const today = new Date().toISOString().split("T")[0];
  return `You are a South African HR document validation AI for CapaCiTi / Capaciti training programme compliance.
Your job is to validate uploaded candidate documents against strict rules. You do NOT approve candidates — you flag issues clearly so a human admin can make the final decision.

TODAY'S DATE: ${today}

GLOBAL SETTINGS:
- Minimum confidence to pass: ${confidenceThreshold}%
- ID certification stamp must be within ${stampValidityMonths} months
- Strict mode: ${strictMode ? "ENABLED — flag any ambiguity, apply strictest interpretation" : "DISABLED — standard validation"}

DOCUMENT TYPES AND THEIR SPECIFIC VALIDATION RULES:

═══ 1. ID DOCUMENT ═══
Required checks (each must be reported as pass/fail):
- Image clarity: Is the image clear and not blurry?
- Full document visible: No clipping or cut-off edges
- ID number readable: Can the SA ID number (13 digits) be extracted?
- Certification stamp present: Is there a commissioner of oaths / police stamp?
- Stamp authority: Identify WHO stamped it — is it a Police Station (name the station) or Commissioner of Oaths? Report the police station name or commissioner details.
- Stamp date present: Can you read a date on the stamp?
- Stamp date validity: Is the stamp date ≤ ${stampValidityMonths} months old from today (${today})? Calculate the difference.
- Is Certified: Does the document bear a "certified true copy" notation or equivalent certification mark?
- Commissioner signature: Is there a signature next to the stamp?
- Document may be skewed/folded (photo from camera on uneven surface) — still must be readable
- The stamp may be faint — the critical parts are: date of validation + commissioner's signature next to stamp
- IMPORTANT: Extract and report the stamp date, police station name, and certification authority in dedicated fields.

═══ 2. SIGNED CONTRACT ═══
Required checks:
- Signature present at the end of the document
- Date present at the end of the document
- ID number present in the contract
- ID number matches the candidate's ID document (cross-reference if available)

═══ 3. EEA1 FORM (Employment Equity Act) ═══
Required checks:
- All required fields completed (not blank)
- Text is legible
- Signature present
- Date present
- CRITICAL: Check whether "South African" or "Foreigner" is ticked
  → If "Foreigner" is ticked → REJECT (status: fail)
  → If neither is ticked (left blank) → REJECT (status: fail)
  → If "South African" is ticked → PASS this check

═══ 4. AFFIDAVIT ═══
Required checks:
- Document is signed
- Document is dated
- ID number is present
- ID number matches the candidate's ID document
- Commissioner of Oaths stamp present — identify the police station or commissioner
- Stamp date present and valid (within ${stampValidityMonths} months)
- Follows standard Capaciti affidavit format

═══ 5. ATTENDANCE / TRAINING REGISTER ═══
Required checks:
- Candidate's ID number appears in the document
- ID matches the candidate
- Signature present next to the candidate's name/ID
- Date present and valid
- This may be a scanned paper register with multiple candidate names

═══ 6. POLICE CLEARANCE ═══
Required checks:
- Document issued by SAPS (South African Police Service)
- Police station name clearly visible — extract and report it
- Issue date present and valid
- Reference number present
- Candidate name matches
- ID number present and matches
- Document is not expired (check validity period)
- Official SAPS stamp/seal present

═══ 7. QUALIFICATION / CERTIFICATE ═══
Required checks:
- Institution name visible
- Qualification/certificate title visible
- Candidate name matches
- Date of issue present
- Is it certified (stamped as a true copy)?
- If certified: identify the certifying authority (police station or commissioner)
- Stamp date validity (within ${stampValidityMonths} months)

═══ OTHER DOCUMENTS ═══
For any document that doesn't match the above types:
- Check image clarity
- Check for signatures where expected
- Check for dates where expected
- Check for stamps and certification marks
- If stamped: identify police station or commissioner
- Extract any ID numbers present

INFORMATION EXTRACTION RULES:
- You MUST extract ALL readable information from the document into the extracted_info object
- Extract names, ID numbers, dates, addresses, phone numbers, emails, reference numbers — everything visible
- For ID documents: extract full name, ID number, date of birth, gender, nationality
- For contracts: extract employer name, job title, signature status, dates
- For qualifications: extract institution name, qualification title, date of issue
- For police clearance: extract SAPS reference number, station name, issue date
- For proof of address: extract full address, account holder name, date
- Leave fields empty string if not found — do not make up information

STAMP DATE VALIDITY:
- When a stamp date is found, calculate whether it is within ${stampValidityMonths} months from today (${today})
- Set stamp_date_valid to true if within period, false if expired
- If stamp is expired, add this as a FAIL check and include in issues

VALIDATION OUTPUT RULES:
- For each check performed, include it in the "checks" array with name, status (pass/warning/fail), and detail
- Overall status: "fail" if ANY critical check fails, "warning" if non-critical issues exist, "pass" if all checks pass
- Provide a plain-English explanation of findings
- Be specific about what failed and why
- ALWAYS extract and report: stamp_date, police_station, certification_authority when visible
- If analysing from filename only (no image content), note that visual checks are pending and set appropriate confidence`;
}

function isPdfFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.pdf');
}

async function analyzeWithOpenRouter(apiKey: string, systemPrompt: string, fileUrl: string, fileName: string, asyncMode: boolean = false, documentId?: string) {
  const userContent = isPdfFile(fileName)
    ? [
        { type: "text", text: `Analyze this document and determine its type, validate it against the rules, and extract candidate information.\n\nFilename: "${fileName}"\nFile URL: ${fileUrl}\n\nRemember to extract stamp dates, police station names, and certification authority details. Respond using the extract_document_info function. Be thorough in your validation checks.` },
      ]
    : [
        { type: "text", text: `Analyze this document and validate it thoroughly. Filename: "${fileName}". Remember to extract stamp dates, police station names, and certification authority details.` },
        { type: "image_url", image_url: { url: fileUrl, detail: "high" } }
      ];

  const body: Record<string, any> = {
    model: "google/gemini-2.5-flash",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ],
    tools: [toolSchema],
    tool_choice: { type: "function", function: { name: "extract_document_info" } }
  };

  // For async mode, use OpenRouter's callback webhook
  if (asyncMode && documentId) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    body.route = "async";
    body.provider = {
      callback_url: `${supabaseUrl}/functions/v1/openrouter-webhook`,
      custom_data: { document_id: documentId },
    };
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": Deno.env.get("SUPABASE_URL") || "https://lovable.dev",
      "X-Title": "CapaCiTi Document Validator",
    },
    body: JSON.stringify(body),
  });
  return response;
}

async function analyzeWithOpenAI(apiKey: string, systemPrompt: string, fileUrl: string, fileName: string) {
  if (isPdfFile(fileName)) {
    console.log("Skipping OpenAI for PDF file - not supported by Vision API");
    return null;
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: `Analyze this document and validate it thoroughly. Filename: "${fileName}". Remember to extract stamp dates, police station names, and certification authority details.` },
            { type: "image_url", image_url: { url: fileUrl, detail: "high" } }
          ]
        }
      ],
      tools: [toolSchema],
      tool_choice: { type: "function", function: { name: "extract_document_info" } }
    }),
  });
  return response;
}

async function analyzeWithLovableAI(apiKey: string, systemPrompt: string, fileUrl: string, fileName: string) {
  const userContent = isPdfFile(fileName)
    ? [
        { type: "text", text: `Analyze this document and determine its type, validate it against the rules, and extract candidate information.\n\nFilename: "${fileName}"\nFile URL: ${fileUrl}\n\nRemember to extract stamp dates, police station names, and certification authority details. Respond using the extract_document_info function. Be thorough in your validation checks.` },
      ]
    : [
        { type: "text", text: `Analyze this document and validate it thoroughly. Filename: "${fileName}". Remember to extract stamp dates, police station names, and certification authority details.` },
        { type: "image_url", image_url: { url: fileUrl, detail: "high" } }
      ];

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ],
      tools: [toolSchema],
      tool_choice: { type: "function", function: { name: "extract_document_info" } }
    }),
  });
  return response;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { document_id, file_url, file_name, async_mode } = await req.json();

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    if (!OPENROUTER_API_KEY && !LOVABLE_API_KEY && !OPENAI_API_KEY) {
      throw new Error("No AI API key configured. Need OPENROUTER_API_KEY, LOVABLE_API_KEY, or OPENAI_API_KEY.");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    await supabase.from("documents").update({ validation_status: "processing" }).eq("id", document_id);

    const { data: settings } = await supabase.from("settings").select("*").limit(1).single();
    const confidenceThreshold = settings?.confidence_threshold || 80;
    const stampValidityMonths = settings?.stamp_validity_months || 3;
    const strictMode = settings?.strict_mode || false;

    const systemPrompt = buildSystemPrompt(confidenceThreshold, stampValidityMonths, strictMode);

    let aiResponse: Response;
    let aiProvider = "openrouter";

    // Priority: OpenRouter > OpenAI > Lovable AI
    // For async_mode (batch processing), use OpenRouter webhooks
    if (OPENROUTER_API_KEY) {
      if (async_mode) {
        console.log("Using OpenRouter ASYNC mode with webhook callback for document:", document_id);
        const asyncResult = await analyzeWithOpenRouter(OPENROUTER_API_KEY, systemPrompt, file_url, file_name, true, document_id);
        
        if (asyncResult.ok) {
          // Async request accepted - webhook will handle the result
          return new Response(JSON.stringify({
            success: true,
            document_id,
            ai_provider: "openrouter-async",
            status: "processing_async",
            message: "Document submitted for async processing. Results will be delivered via webhook.",
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } else {
          console.log(`OpenRouter async failed (${asyncResult.status}), falling back to sync`);
        }
      }

      // Sync mode with OpenRouter
      console.log("Using OpenRouter (sync) for document analysis");
      aiResponse = await analyzeWithOpenRouter(OPENROUTER_API_KEY, systemPrompt, file_url, file_name);
      aiProvider = "openrouter";

      if (!aiResponse.ok) {
        console.log(`OpenRouter returned ${aiResponse.status}, falling back`);
        // Fall through to other providers
        if (OPENAI_API_KEY) {
          const openaiResult = await analyzeWithOpenAI(OPENAI_API_KEY, systemPrompt, file_url, file_name);
          if (openaiResult && openaiResult.ok) {
            aiResponse = openaiResult;
            aiProvider = "openai";
          } else if (LOVABLE_API_KEY) {
            aiResponse = await analyzeWithLovableAI(LOVABLE_API_KEY, systemPrompt, file_url, file_name);
            aiProvider = "lovable";
          }
        } else if (LOVABLE_API_KEY) {
          aiResponse = await analyzeWithLovableAI(LOVABLE_API_KEY, systemPrompt, file_url, file_name);
          aiProvider = "lovable";
        }
      }
    } else if (OPENAI_API_KEY) {
      const openaiResult = await analyzeWithOpenAI(OPENAI_API_KEY, systemPrompt, file_url, file_name);
      if (openaiResult && openaiResult.ok) {
        console.log("Using OpenAI GPT-4o Vision for document analysis");
        aiProvider = "openai";
        aiResponse = openaiResult;
      } else {
        aiProvider = "lovable";
        aiResponse = await analyzeWithLovableAI(LOVABLE_API_KEY!, systemPrompt, file_url, file_name);
      }
    } else {
      console.log("Using Lovable AI for document analysis");
      aiResponse = await analyzeWithLovableAI(LOVABLE_API_KEY!, systemPrompt, file_url, file_name);
    }

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const errText = await aiResponse.text();
      console.error(`${aiProvider} AI error:`, status, errText);
      throw new Error(`${aiProvider} AI error: ${status}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    let extracted = {
      document_type: "Other",
      candidate_name: "Unknown",
      confidence: 50,
      validation_status: "warning",
      checks: [] as { name: string; status: string; detail: string }[],
      issues: [] as string[],
      summary: "Could not fully analyze document",
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
      validation_details: {
        summary: extracted.summary,
        checks: extracted.checks || [],
        extracted_id_number: extracted.extracted_id_number || null,
        stamp_date: extracted.stamp_date || null,
        stamp_date_valid: extracted.stamp_date_valid ?? null,
        police_station: extracted.police_station || null,
        certification_authority: extracted.certification_authority || null,
        extracted_info: extracted.extracted_info || null,
        ai_provider: aiProvider,
      },
      processed_at: new Date().toISOString(),
    }).eq("id", document_id);

    return new Response(JSON.stringify({
      success: true,
      document_id,
      ai_provider: aiProvider,
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
