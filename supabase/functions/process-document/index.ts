import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type CrossReferenceContext = {
  available: boolean;
  candidateName: string | null;
  idNumber: string | null;
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
            "Certified ID",
            "Unemployment Affidavit",
            "EEA1 Form",
            "PWDS Confirmation of Disability",
            "Social Media Consent",
            "Beneficiary Agreement",
            "Offer Letter",
            "Employment Contract FTC",
            "Certificate of Completion",
            "Bank Letter",
            "TCX Unemployment Affidavit",
            "CV",
            "Capaciti Declaration",
            "Qualification Matric",
            "Tax Certificate",
            "Other"
          ],
          description: "The type of Capaciti HR document. Pick the single best match."
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
            race: { type: "string", description: "Race selected on the employment equity form if present" },
            nationality: { type: "string", description: "Nationality or citizenship status" },
            foreign_national: { type: "boolean", description: "Whether the form indicates the person is a foreign national" },
            foreign_national_support_date: { type: "string", description: "Acquired date, residence date, or permit-related date required when foreign national is marked yes" },
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

function buildSystemPrompt(
  confidenceThreshold: number,
  stampValidityMonths: number,
  strictMode: boolean,
  crossReferenceContext: CrossReferenceContext,
): string {
  const today = new Date().toISOString().split("T")[0];
  return `You are a South African HR document validation AI for CapaCiTi / Capaciti training programme compliance.
Your job is to validate uploaded candidate documents against strict rules. You do NOT approve candidates — you flag issues clearly so a human admin can make the final decision.

TODAY'S DATE: ${today}

GLOBAL SETTINGS:
- Minimum confidence to pass: ${confidenceThreshold}%
- ID certification stamp must be within ${stampValidityMonths} months
- Strict mode: ${strictMode ? "ENABLED — flag any ambiguity, apply strictest interpretation" : "DISABLED — standard validation"}

CANDIDATE ID CROSS-REFERENCE CONTEXT:
${crossReferenceContext.available
  ? `- Cross-reference is AVAILABLE for this document
- Candidate name from uploaded ID context: ${crossReferenceContext.candidateName || "Unknown"}
- Candidate ID number from uploaded ID context: ${crossReferenceContext.idNumber || "Unknown"}
- Use this uploaded ID context only when a document type requires matching the candidate's ID number`
  : `- Cross-reference is NOT available for this document
- Do NOT perform any "matches candidate's ID document" validation
- Do NOT add a fail, warning, or issue just because no candidate ID document is available
- Validate the current document on its own contents only`}

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
- Review ALL pages before deciding whether a signature or date is missing
- Multi-page contracts are common: inspect every page from first to last before deciding a signature or date is missing
- Signature pages may appear near the end, on a dedicated acceptance page, or on separate employer/employee signature pages
- Signature present on the relevant signature page
- Date present at the end of the document or on the relevant signature page
- ID number present in the contract
- ID number matches the candidate's ID document only when uploaded ID context is explicitly available above
- Do NOT fail a contract because a personal-details page or non-signature page does not contain a signature
- If the contract has dedicated signature pages later in the document, use those pages for the signature check
- Page 10 employee details is an information page and does NOT require the employee's or employer's signature
- Some contracts require only the employee signature, while others require both employee and employer signatures
- Determine from the contract wording and signature blocks whether employee only or both parties are required
- Do NOT fail the contract for a missing employer signature if the contract only requires the employee
- Extract the actual signature/date findings from the correct signature page instead of earlier information pages

═══ 3. EEA1 FORM (Employment Equity Act) ═══
Required checks:
- All required fields completed (not blank)
- Text is legible
- Signature present
- Date present
- Extract the selected race category when present and store it in extracted_info.race
- CRITICAL: Check the foreign-national answer, even if the form uses different wording
  → For nationality on this form, the answer is captured as "Yes" or "No"
  → "No" means the person is South African
  → "Yes" means the person is a foreign national and must provide the acquired date of nationality / residence
  → Some forms may also use "South African" vs "Foreigner", but prefer the explicit Yes / No answer when present
  → Normalize the result into extracted_info.foreign_national as true or false
  → If the answer is "Yes" → mark extracted_info.foreign_national as true
  → If the answer is "No" → mark extracted_info.foreign_national as false
  → If foreign national is true, look for the acquired date of nationality, residence date, or permit-related date and store it in extracted_info.foreign_national_support_date
  → If foreign national is true and the required acquired / residence / permit date is missing → REJECT (status: fail)
  → If the field is contradictory or unreadable → REJECT (status: fail)

═══ 4. AFFIDAVIT ═══
Required checks:
- Document is signed
- Document is dated
- ID number is present
- ID number matches the candidate's ID document only when uploaded ID context is explicitly available above
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

═══ 8. DISABILITY DOCUMENT / LETTER ═══
Required checks:
- This document does NOT need to follow Capaciti structure or wording
- It may come from YES or any other legitimate organization
- Candidate full name and surname visible
- Gender visible where the document provides it
- Signature present
- Official stamp or police / certification stamp present
- If a police station or certifying authority is visible, extract and report it
- Do NOT fail the document only because the format, branding, or template differs from Capaciti

═══ OTHER DOCUMENTS ═══
For any document that doesn't match the above types:
- Check image clarity
- Extract all readable information even if the document type is unfamiliar
- Verify whether the candidate's full name and surname are present
- Verify whether the candidate's ID number is present when the document contains one
- Check for signatures where expected
- Check for dates where expected
- Check for stamps and certification marks only when relevant to that kind of document
- If stamped: identify police station or commissioner
- Extract any ID numbers present
- If a stamp or certification would normally help but is not required for that document, raise it as a warning instead of a fail
- Optional warning-only checks such as missing stamp or missing certification on non-required documents should be clearly labeled as optional in the check name
- Do NOT fail a document only because it comes from a different organization or uses a different layout

INFORMATION EXTRACTION RULES:
- You MUST extract ALL readable information from the document into the extracted_info object
- Extract names, ID numbers, dates, addresses, phone numbers, emails, reference numbers — everything visible
- Check handwritten pen marks, ticks, crosses, and filled check boxes carefully because they carry important meaning
- Read all pages of multi-page documents before deciding whether required information is missing
- A stamp may overlap printed words or signatures; still identify the stamp details where visible instead of treating the overlap as an automatic failure
- For ID documents: extract full name, ID number, date of birth, gender, nationality
- For EEA1 / employment equity forms: extract the selected race and whether the person is marked as a foreign national
- For contracts: extract employer name, job title, signature status, dates
- For qualifications: extract institution name, qualification title, date of issue
- For police clearance: extract SAPS reference number, station name, issue date
- For proof of address: extract full address, account holder name, date, and accept non-Capaciti layouts from utilities, landlords, banks, or other organizations
- For disability documents: extract the organization name, candidate full name, gender if shown, stamp details, and signature status
- Leave fields empty string if not found — do not make up information

PROOF OF ADDRESS RULES:
- A proof of address document does NOT need to follow Capaciti structure or wording
- Accept common proofs of address from different organizations as long as the address is readable
- Prefer candidate name, account holder name, surname, issuer, reference number, and date when available
- Do NOT fail a proof of address only because the template or layout differs from Capaciti

STAMP DATE VALIDITY:
- When a stamp date is found, calculate whether it is within ${stampValidityMonths} months from today (${today})
- Set stamp_date_valid to true if within period, false if expired
- If stamp is expired, add this as a FAIL check and include in issues

VALIDATION OUTPUT RULES:
- For each check performed, include it in the "checks" array with name, status (pass/warning/fail), and detail
- Prefix warning-only non-scoring checks with "Optional -", especially for missing stamp/certification findings on documents where those are not mandatory
- Overall status: "fail" if ANY critical check fails, "warning" if non-critical issues exist, "pass" if all checks pass
- Provide a plain-English explanation of findings
- Be specific about what failed and why
- ALWAYS extract and report: stamp_date, police_station, certification_authority when visible
- If analysing from filename only (no image content), note that visual checks are pending and set appropriate confidence`;
}

function isPdfFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.pdf');
}

function getMimeType(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop();
  const mimeMap: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  };
  return mimeMap[ext || ''] || 'application/octet-stream';
}

function formatDateToDayMonthYear(value: string): string {
  const trimmedValue = value.trim();
  const match = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return trimmedValue;

  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

function normalizeExtractedBirthDate(extractedInfo: Record<string, any> | null | undefined) {
  if (!extractedInfo || typeof extractedInfo.date_of_birth !== "string") return extractedInfo;

  return {
    ...extractedInfo,
    date_of_birth: formatDateToDayMonthYear(extractedInfo.date_of_birth),
  };
}

function normalizeExtractedInfo(extractedInfo: Record<string, any> | null | undefined) {
  if (!extractedInfo) return extractedInfo;

  const normalized = normalizeExtractedBirthDate(extractedInfo) || extractedInfo;
  const foreignNational = normalized.foreign_national;

  if (typeof foreignNational === "string") {
    const cleaned = foreignNational.trim().toLowerCase();

    if (["yes", "y", "true", "foreigner", "foreign national"].includes(cleaned)) {
      return { ...normalized, foreign_national: true };
    }

    if (["no", "n", "false", "south african", "sa citizen", "citizen"].includes(cleaned)) {
      return { ...normalized, foreign_national: false };
    }
  }

  return normalized;
}

async function fetchFileAsBase64(fileUrl: string): Promise<string> {
  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`Failed to fetch file: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function buildUserContent(fileUrl: string, fileName: string, crossReferenceContext: CrossReferenceContext): Promise<any[]> {
  const crossReferencePrompt = crossReferenceContext.available
    ? `Cross-reference context is available. Candidate name: "${crossReferenceContext.candidateName || "Unknown"}". Candidate ID number from uploaded ID document: "${crossReferenceContext.idNumber || "Unknown"}". Use that uploaded ID information only for document types that require ID matching.`
    : `Cross-reference context is not available. Do not perform candidate ID cross-reference checks, and do not raise a fail or warning just because no ID document was uploaded with this candidate's documents.`;
  const textPrompt = `Analyze this document and validate it thoroughly. Filename: "${fileName}". ${crossReferencePrompt} Check all pages before deciding anything is missing. Do not stop at the first pages of a multi-page document. Read pen marks, ticks, handwritten selections, and check boxes carefully because they contain important answers. Remember to extract stamp dates, police station names, and certification authority details even when stamps overlap words. For employment equity forms, treat the nationality answer as Yes or No: No means South African, Yes means foreign national. If foreign national is marked yes, extract the acquired date of nationality, residence date, or permit-related date into extracted_info.foreign_national_support_date. For contracts, page 10 employee details is an information page and does not require employee or employer signatures. Some contracts require only the employee signature while others require both employee and employer signatures, so decide from the actual signature blocks and wording on the relevant signature page. For disability and proof-of-address documents, do not require Capaciti formatting if the core identifying information and stamps/signatures are present. For unfamiliar documents, still extract all readable information and verify candidate name, surname, and ID number where present. Mark non-required missing stamp or certification findings as warning checks prefixed with "Optional -". Respond using the extract_document_info function. Be thorough in your validation checks.`;
  
  try {
    const base64 = await fetchFileAsBase64(fileUrl);
    const mimeType = getMimeType(fileName);
    
    if (isPdfFile(fileName)) {
      // For Gemini-compatible APIs, use inline_data for PDFs
      return [
        { type: "text", text: textPrompt },
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } }
      ];
    } else {
      return [
        { type: "text", text: textPrompt },
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } }
      ];
    }
  } catch (e) {
    console.error("Failed to fetch file for base64 encoding:", e);
    // Fallback to URL-based approach for images
    if (!isPdfFile(fileName)) {
      return [
        { type: "text", text: textPrompt },
        { type: "image_url", image_url: { url: fileUrl, detail: "high" } }
      ];
    }
    // For PDFs that can't be fetched, text-only fallback
    return [
      { type: "text", text: `${textPrompt}\n\nFile URL (could not download): ${fileUrl}` },
    ];
  }
}

async function analyzeWithOpenRouter(apiKey: string, model: string, systemPrompt: string, fileUrl: string, fileName: string, crossReferenceContext: CrossReferenceContext, asyncMode: boolean = false, documentId?: string) {
  const userContent = await buildUserContent(fileUrl, fileName, crossReferenceContext);

  const body: Record<string, any> = {
    model,
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

function extractToolCall(aiData: Record<string, any>) {
  const chatCompletionsToolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
  if (chatCompletionsToolCall) return chatCompletionsToolCall;
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { document_id, file_url, file_name, async_mode, model } = await req.json();

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");

    if (!OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({
        error: "api_key_missing",
        message: "OpenRouter API key is not configured. Please add your OPENROUTER_API_KEY to continue processing documents.",
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default model is Gemini 2.5 Flash, can be overridden to e.g. "openai/gpt-5.4"
    const aiModel = model || "google/gemini-2.5-flash";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    await supabase.from("documents").update({ validation_status: "processing" }).eq("id", document_id);

    const { data: settings } = await supabase.from("settings").select("*").limit(1).single();
    const confidenceThreshold = settings?.confidence_threshold || 80;
    const stampValidityMonths = settings?.stamp_validity_months || 3;
    const strictMode = settings?.strict_mode || false;

    const { data: currentDocument } = await supabase
      .from("documents")
      .select("id, candidate_id")
      .eq("id", document_id)
      .maybeSingle();

    let crossReferenceContext: CrossReferenceContext = {
      available: false,
      candidateName: null,
      idNumber: null,
    };

    if (currentDocument?.candidate_id) {
      const { data: candidateDocuments } = await supabase
        .from("documents")
        .select("id, file_name, document_type, candidate_name_extracted, validation_details")
        .eq("candidate_id", currentDocument.candidate_id);

      const idDocument = candidateDocuments?.find((candidateDocument) => {
        if (candidateDocument.id === document_id) return false;

        const fileNameLower = candidateDocument.file_name.toLowerCase();
        return candidateDocument.document_type === "ID Document"
          || /\bid\b/.test(fileNameLower)
          || fileNameLower.includes("identity");
      });

      const idDocumentDetails = idDocument?.validation_details as Record<string, any> | null | undefined;
      const idNumber = idDocumentDetails?.extracted_id_number || idDocumentDetails?.extracted_info?.id_number || null;

      if (idDocument && typeof idNumber === "string" && /^\d{13}$/.test(idNumber.replace(/\s/g, ""))) {
        crossReferenceContext = {
          available: true,
          candidateName: idDocument.candidate_name_extracted || null,
          idNumber: idNumber.replace(/\s/g, ""),
        };
      }
    }

    const systemPrompt = buildSystemPrompt(confidenceThreshold, stampValidityMonths, strictMode, crossReferenceContext);

    let aiResponse: Response;
    let aiProvider = "openrouter";

    // All AI processing goes through OpenRouter
    if (async_mode) {
      console.log(`Using OpenRouter ASYNC mode (model: ${aiModel}) for document:`, document_id);
      const asyncResult = await analyzeWithOpenRouter(OPENROUTER_API_KEY, aiModel, systemPrompt, file_url, file_name, crossReferenceContext, true, document_id);
      
      if (asyncResult.ok) {
        return new Response(JSON.stringify({
          success: true,
          document_id,
          ai_provider: "openrouter-async",
          ai_model: aiModel,
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
    console.log(`Using OpenRouter (sync, model: ${aiModel}) for document analysis`);
    aiResponse = await analyzeWithOpenRouter(OPENROUTER_API_KEY, aiModel, systemPrompt, file_url, file_name, crossReferenceContext);

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 402) {
        return new Response(JSON.stringify({
          error: "credits_exhausted",
          message: "Your OpenRouter credits have been exhausted. Please top up your credits at openrouter.ai to continue processing documents.",
        }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (status === 429) {
        return new Response(JSON.stringify({
          error: "rate_limited",
          message: "Rate limit reached. Please wait a moment and try again.",
        }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const errText = await aiResponse.text();
      console.error(`OpenRouter AI error (model: ${aiModel}):`, status, errText);
      throw new Error(`OpenRouter AI error: ${status}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = extractToolCall(aiData);

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

    const toolArguments = toolCall?.function?.arguments || toolCall?.arguments;
    if (toolArguments) {
      try {
        extracted = JSON.parse(toolArguments);
      } catch (e) {
        console.error("Failed to parse AI response:", e);
      }
    }

    // ── SA ID Structural Validation (Luhn checksum) ──
    extracted.extracted_info = normalizeExtractedInfo(extracted.extracted_info) ?? null;
    const idToValidate = extracted.extracted_id_number || extracted.extracted_info?.id_number;
    let saIdValidation: Record<string, any> | null = null;

    if (idToValidate && /^\d{13}$/.test(idToValidate.replace(/\s/g, ""))) {
      const cleaned = idToValidate.replace(/\s/g, "");
      const idChecks: { name: string; status: string; detail: string }[] = [];
      let idValid = true;

      // 1. Length
      idChecks.push({ name: "ID Length (13 digits)", status: "pass", detail: "ID number contains exactly 13 digits" });

      // 2. Date of birth
      const yy = cleaned.substring(0, 2);
      const mm = cleaned.substring(2, 4);
      const dd = cleaned.substring(4, 6);
      const month = parseInt(mm, 10);
      const day = parseInt(dd, 10);
      const yearNum = parseInt(yy, 10);
      const currentYearSuffix = new Date().getFullYear() % 100;
      const century = yearNum <= currentYearSuffix ? 2000 : 1900;
      const fullYear = century + yearNum;
      const testDate = new Date(fullYear, month - 1, day);
      const dobValid = testDate.getFullYear() === fullYear && testDate.getMonth() === month - 1 && testDate.getDate() === day && testDate <= new Date();
      idChecks.push({
        name: "Date of Birth (YYMMDD)",
        status: dobValid ? "pass" : "fail",
        detail: dobValid ? `Valid date of birth: ${dd}/${mm}/${fullYear}` : `Invalid date segment: ${yy}-${mm}-${dd}`,
      });
      if (!dobValid) idValid = false;

      // 3. Gender
      const genderSeq = parseInt(cleaned.substring(6, 10), 10);
      const derivedGender = genderSeq >= 5000 ? "Male" : "Female";
      idChecks.push({ name: "Gender Sequence (SSSS)", status: "pass", detail: `Sequence ${cleaned.substring(6, 10)} → ${derivedGender}` });

      // 4. Gender cross-check
      const extractedGender = extracted.extracted_info?.gender;
      if (extractedGender) {
        const ng = extractedGender.toLowerCase().trim();
        const genderMatch = (ng === "male" && derivedGender === "Male") || (ng === "female" && derivedGender === "Female") || (ng === "m" && derivedGender === "Male") || (ng === "f" && derivedGender === "Female");
        idChecks.push({
          name: "Gender Cross-Check",
          status: genderMatch ? "pass" : "fail",
          detail: genderMatch ? `Extracted gender matches ID-derived gender (${derivedGender})` : `Mismatch: extracted "${extractedGender}" but ID indicates ${derivedGender}`,
        });
        if (!genderMatch) idValid = false;
      }

      // 5. Citizenship
      const citizenDigit = cleaned[10];
      const validCitizen = citizenDigit === "0" || citizenDigit === "1";
      idChecks.push({
        name: "Citizenship Indicator",
        status: validCitizen ? "pass" : "fail",
        detail: validCitizen ? `Digit ${citizenDigit} → ${citizenDigit === "0" ? "SA Citizen" : "Permanent Resident"}` : `Invalid citizenship digit: ${citizenDigit}`,
      });
      if (!validCitizen) idValid = false;

      // 6. Luhn checksum
      let luhnSum = 0;
      for (let i = 0; i < 13; i++) {
        let d = parseInt(cleaned[i], 10);
        if ((13 - i) % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
        luhnSum += d;
      }
      const luhnValid = luhnSum % 10 === 0;
      idChecks.push({
        name: "Luhn Checksum",
        status: luhnValid ? "pass" : "fail",
        detail: luhnValid ? "Checksum digit verified successfully" : "Checksum digit is incorrect — ID number may be invalid or misread",
      });
      if (!luhnValid) idValid = false;

      saIdValidation = {
        valid: idValid,
        checks: idChecks,
        dateOfBirth: dobValid ? `${dd}/${mm}/${fullYear}` : null,
        gender: derivedGender,
        citizenship: validCitizen ? (citizenDigit === "0" ? "SA Citizen" : "Permanent Resident") : null,
      };

      // Append SA ID checks to the main checks array
      extracted.checks = [...(extracted.checks || []), ...idChecks];

      if (!idValid) {
        extracted.issues = [...(extracted.issues || []), "SA ID number failed structural validation"];
        if (extracted.validation_status === "pass") {
          extracted.validation_status = "warning";
        }
      }

      console.log(`SA ID validation for ${cleaned}: ${idValid ? "PASS" : "FAIL"}`);
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
        extracted_info: normalizeExtractedInfo(extracted.extracted_info) || null,
        ai_provider: aiProvider,
        ai_model: aiModel,
        sa_id_validation: saIdValidation,
      },
      processed_at: new Date().toISOString(),
    }).eq("id", document_id);

    return new Response(JSON.stringify({
      success: true,
      document_id,
      ai_provider: aiProvider,
      ai_model: aiModel,
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
