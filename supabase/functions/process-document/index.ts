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

type FilenameHints = {
  rawBase: string;
  candidateName: string | null;
  idNumber: string | null;
  docTypeHint: string | null;
  matchedConvention: boolean;
};

// Map known filename suffix tokens to canonical document_type enum values.
// Keys are lowercase, alphanumeric only (no spaces/punctuation). Order does not
// matter — matchPartialSuffix uses longest-key-wins to resolve ambiguity.
const SUFFIX_TO_DOCTYPE: Record<string, string> = {
  // Beneficiary Agreement
  "ba": "Beneficiary Agreement",
  "beneficiaryagreement": "Beneficiary Agreement",
  // Employment Contract FTC
  "ftc": "Employment Contract FTC",
  "employmentcontract": "Employment Contract FTC",
  "fixedtermcontract": "Employment Contract FTC",
  "employmentftc": "Employment Contract FTC",
  // Offer Letter
  "offerletter": "Offer Letter",
  "signedofferletter": "Offer Letter",
  "offerofemployment": "Offer Letter",
  "employmentoffer": "Offer Letter",
  "offer": "Offer Letter",
  // Certificate of Completion
  "completionoftraining": "Certificate of Completion",
  "completioncertificate": "Certificate of Completion",
  "trainingcompletion": "Certificate of Completion",
  "completion": "Certificate of Completion",
  "certificate": "Certificate of Completion",
  // Bank Letter (also used for proof-of-address / proof-of-residence)
  "bankletter": "Bank Letter",
  "bankconfirmation": "Bank Letter",
  "bankaccountconfirmation": "Bank Letter",
  "bankstatement": "Bank Letter",
  "bank": "Bank Letter",
  "proofofaddress": "Bank Letter",
  "proofofresidence": "Bank Letter",
  "addressproof": "Bank Letter",
  "residenceproof": "Bank Letter",
  "utilitybill": "Bank Letter",
  "municipalbill": "Bank Letter",
  // TCX
  "tcx": "TCX Unemployment Affidavit",
  // Unemployment Affidavit
  "unemploymentaffidavit": "Unemployment Affidavit",
  "affidavitofunemployment": "Unemployment Affidavit",
  "policeclearance": "Unemployment Affidavit",
  "saps": "Unemployment Affidavit",
  "affidavit": "Unemployment Affidavit",
  // EEA1 Form
  "eea1": "EEA1 Form",
  "eea1form": "EEA1 Form",
  "eea1employmentequity": "EEA1 Form",
  "employmentequityform": "EEA1 Form",
  // PWDS Confirmation of Disability
  "pwd": "PWDS Confirmation of Disability",
  "pwds": "PWDS Confirmation of Disability",
  "disability": "PWDS Confirmation of Disability",
  "disabilitycertificate": "PWDS Confirmation of Disability",
  "disabilityconfirmation": "PWDS Confirmation of Disability",
  // Social Media Consent
  "socialmediaconsent": "Social Media Consent",
  "socialmediaconsentform": "Social Media Consent",
  "mediaconsent": "Social Media Consent",
  "photographyconsent": "Social Media Consent",
  "socialmedia": "Social Media Consent",
  "consent": "Social Media Consent",
  // CV
  "cv": "CV",
  "cvresume": "CV",
  "curriculumvitae": "CV",
  "resume": "CV",
  // Capaciti Declaration
  "declaration": "Capaciti Declaration",
  "capacitideclaration": "Capaciti Declaration",
  "capaciticonsent": "Capaciti Declaration",
  "capacitiagreement": "Capaciti Declaration",
  // Qualification / Matric
  "matric": "Qualification Matric",
  "matriccertificate": "Qualification Matric",
  "seniorcertificate": "Qualification Matric",
  "nsc": "Qualification Matric",
  "ieb": "Qualification Matric",
  "qualification": "Qualification Matric",
  // Tax Certificate
  "tax": "Tax Certificate",
  "taxnumber": "Tax Certificate",
  "taxcertificate": "Tax Certificate",
  "incometax": "Tax Certificate",
  "incometaxcertificate": "Tax Certificate",
  "sarsletter": "Tax Certificate",
  "taxnumberletter": "Tax Certificate",
  "irp5": "Tax Certificate",
  "irp5certificate": "Tax Certificate",
  // MIE Verification
  "mie": "MIE Verification",
  "mieconsent": "MIE Verification",
  "mieverification": "MIE Verification",
  "mieclearance": "MIE Verification",
  "backgroundcheck": "MIE Verification",
  // Certified ID
  "id": "Certified ID",
  "certifiedid": "Certified ID",
  "idcopy": "Certified ID",
  "iddocument": "Certified ID",
  "idphoto": "Certified ID",
  "saidcopy": "Certified ID",
  "greenid": "Certified ID",
  "smartid": "Certified ID",
};

// Split CamelCase/PascalCase into spaced words: "JohnDoe" -> "John Doe"
function splitCamelCase(input: string): string {
  return input
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/\s+/g, " ");
}

function matchPartialSuffix(suffix: string): string | null {
  // Longest-key-wins: prevents short keys (e.g. "tax") from short-circuiting
  // longer, more specific keys (e.g. "taxcertificate", "incometaxcertificate").
  let bestKey = "";
  let bestVal: string | null = null;
  for (const [key, val] of Object.entries(SUFFIX_TO_DOCTYPE)) {
    if (suffix.includes(key) && key.length > bestKey.length) {
      bestKey = key;
      bestVal = val;
    }
  }
  return bestVal;
}

// Parse filename of the form name_surname_IDno_doctype, namesurname_IDno_doctype,
// or variations using -, space, or . separators. Filename info wins on conflict.
function parseFilename(fileName: string): FilenameHints {
  const base = fileName.replace(/\.[^.]+$/, ""); // strip extension
  const result: FilenameHints = {
    rawBase: base,
    candidateName: null,
    idNumber: null,
    docTypeHint: null,
    matchedConvention: false,
  };

  // Find a 13-digit SA ID number anywhere in the filename
  const idMatch = base.match(/(?<!\d)(\d{13})(?!\d)/);
  if (idMatch) result.idNumber = idMatch[1];

  // Split on common separators
  const tokens = base.split(/[_\-\s.]+/).filter(Boolean);
  if (tokens.length === 0) return result;

  // Identify ID token index (if any)
  const idTokenIndex = tokens.findIndex((t) => /^\d{13}$/.test(t));

  // Tokens BEFORE the ID number are candidate name parts
  // Tokens AFTER the ID number are doc type hint
  if (idTokenIndex > 0) {
    const nameTokens = tokens.slice(0, idTokenIndex);
    result.candidateName = splitCamelCase(nameTokens.join(" ")).trim() || null;
    if (idTokenIndex + 1 < tokens.length) {
      const suffixRaw = tokens.slice(idTokenIndex + 1).join("").toLowerCase().replace(/[^a-z0-9]/g, "");
      result.docTypeHint = SUFFIX_TO_DOCTYPE[suffixRaw] || matchPartialSuffix(suffixRaw);
    }
    result.matchedConvention = !!(result.candidateName && result.idNumber);
  } else if (idTokenIndex === -1) {
    // No ID in filename — weak name guess only
    const guess = splitCamelCase(tokens.join(" ")).trim();
    if (guess && /[a-z]/i.test(guess) && guess.length >= 3) {
      result.candidateName = guess;
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared helpers used by Stage 2 (classify) and Stage 4 (extract)
// ═══════════════════════════════════════════════════════════════════════════

async function buildVisualUserContent(
  fileUrl: string,
  fileName: string,
  textPrompt: string,
): Promise<any[]> {
  try {
    const base64 = await fetchFileAsBase64(fileUrl);
    const mimeType = getMimeType(fileName);
    if (isPdfFile(fileName)) {
      return [
        { type: "text", text: textPrompt },
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
      ];
    }
    return [
      { type: "text", text: textPrompt },
      { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } },
    ];
  } catch (e) {
    console.error("Failed to fetch file for base64 encoding:", e);
    if (!isPdfFile(fileName)) {
      return [
        { type: "text", text: textPrompt },
        { type: "image_url", image_url: { url: fileUrl, detail: "high" } },
      ];
    }
    return [{ type: "text", text: `${textPrompt}\n\nFile URL (could not download): ${fileUrl}` }];
  }
}

async function callOpenRouterWithTool(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userContent: any[],
  toolSchema: any,
  toolName: string,
  title: string,
): Promise<{ ok: true; args: any } | { ok: false; status: number; text: string }> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": Deno.env.get("SUPABASE_URL") || "https://lovable.dev",
      "X-Title": title,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      tools: [toolSchema],
      tool_choice: { type: "function", function: { name: toolName } },
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return { ok: false, status: response.status, text };
  }
  const data = await response.json();
  const tc = data.choices?.[0]?.message?.tool_calls?.[0];
  const argsRaw = tc?.function?.arguments || tc?.arguments;
  if (!argsRaw) return { ok: false, status: 200, text: "no tool call returned" };
  try {
    return { ok: true, args: JSON.parse(argsRaw) };
  } catch (e) {
    return { ok: false, status: 200, text: `JSON parse failed: ${e}` };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Stage 2 — Classification only (no extraction, no validation)
// ═══════════════════════════════════════════════════════════════════════════

const CAPACITI_DOC_TYPES_FULL = [
  "Certified ID",
  "Unemployment Affidavit",
  "EEA1 Form",
  "PWDS Confirmation of Disability",
  "Social Media Consent",
  "Beneficiary Agreement",
  "Offer Letter",
  "Employment Contract FTC",
  "Certificate of Completion",
  "MIE Verification",
  "Bank Letter",
  "TCX Unemployment Affidavit",
  "CV",
  "Capaciti Declaration",
  "Qualification Matric",
  "Tax Certificate",
  "Other",
] as const;

const classifyToolSchema = {
  type: "function",
  function: {
    name: "classify_document",
    description: "Classify a Capaciti HR document by its headings, form codes, letterheads, and titles only. Do NOT extract personal information.",
    parameters: {
      type: "object",
      properties: {
        document_type: { type: "string", enum: [...CAPACITI_DOC_TYPES_FULL] },
        confidence: { type: "number", description: "Confidence 0-100 in the chosen type." },
        classification_evidence: { type: "string", description: "Exact text (heading, form code, letterhead, title) used to make the decision." },
      },
      required: ["document_type", "confidence", "classification_evidence"],
      additionalProperties: false,
    },
  },
};

const CLASSIFY_SYSTEM_PROMPT = `You are a Capaciti HR document classifier. Your ONLY job is to identify the document type. You MUST NOT extract names, ID numbers, dates, or any other personal information.

Look ONLY at strong identifying signals:
- Headings and document titles ("Affidavit", "Bank Letter", "Proof of Address", "Proof of Residence", "Curriculum Vitae", "Certificate of Completion", "Matric Certificate", "Senior Certificate", "Beneficiary Agreement", "Employment Contract", "Offer Letter", "Confirmation of Disability", "Social Media Consent", "Capaciti Declaration")
- Form codes / IDs printed on the page (EEA1, TCX, IRP5, BA, FTC)
- Letterheads (SARS, SAPS, banks, municipalities, traffic department, training providers, Capaciti, Naspers Labs)
- Signatory blocks ("Commissioner of Oaths", "SAPS")
- Page structure (multi-page contract vs single-page certificate)

Mapping rules:
- Proof of Address / Proof of Residence letters from a bank, municipality, traffic department, or SAPS → "Bank Letter".
- Police clearance / SAPS unemployment affidavit (not on the Capaciti template) → "Unemployment Affidavit".
- TCX Unemployment Affidavit (Capaciti TCX template) → "TCX Unemployment Affidavit".
- IRP5 / SARS tax number letter / income tax certificate → "Tax Certificate".
- MIE consent / background check → "MIE Verification".
- Matric / Senior Certificate / NSC / IEB → "Qualification Matric".
- Certified copy of an SA ID (book or card) with a Commissioner of Oaths / Police stamp → "Certified ID".

Return "Other" ONLY as a last resort, when no heading, form code, letterhead, or title points to any of the 16 types. Provide classification_evidence (the exact text relied on) and a confidence 0-100. Read every page.

Respond using the classify_document function.`;

async function classifyDocument(
  apiKey: string,
  model: string,
  fileUrl: string,
  fileName: string,
): Promise<{ document_type: string; confidence: number; classification_evidence: string } | null> {
  const userContent = await buildVisualUserContent(
    fileUrl,
    fileName,
    `Classify this document (filename: "${fileName}"). Read every page. Look only at headings, form codes, letterheads, titles, and signatory blocks.`,
  );
  const result = await callOpenRouterWithTool(
    apiKey,
    model,
    CLASSIFY_SYSTEM_PROMPT,
    userContent,
    classifyToolSchema,
    "classify_document",
    "CapaCiTi Document Classification",
  );
  if (!result.ok) {
    console.warn(`Classify pass failed (${result.status}): ${result.text.slice(0, 200)}`);
    return null;
  }
  return result.args;
}

// ═══════════════════════════════════════════════════════════════════════════
// Stage 3 — Checklist definitions (one per document type)
// ═══════════════════════════════════════════════════════════════════════════

type Check = { name: string; status: "pass" | "warning" | "fail"; detail: string };

type ValidationCtx = {
  doc_type: string;
  fileName: string;
  filenameHints: FilenameHints;
  critical: Record<string, { value: string | null; confidence: number; evidence_text: string; page_number?: number | null }>;
  extracted_info: Record<string, any>;
  handwriting: any | null;
  crossReferenceContext: CrossReferenceContext;
  stampValidityMonths: number;
  programmeYear: number;
  confidenceThreshold: number;
};

type RuleResult = { status: "pass" | "warning" | "fail"; detail: string } | null;

type ChecklistRule = {
  id: string;
  label: string;
  required: boolean; // false → emitted as "Optional - …", can never fail
  validator: (ctx: ValidationCtx) => RuleResult;
};

type Checklist = {
  doc_type: string;
  // List of fields the AI must extract for this checklist (drives Stage 4 prompt)
  fields: string[];
  rules: ChecklistRule[];
};

// ── deterministic helpers ─────────────────────────────────────────────────
function isThirteenDigits(s: string | null | undefined): boolean {
  return !!s && /^\d{13}$/.test(s.replace(/\s/g, ""));
}

function parseFlexibleDate(s: string | null | undefined): Date | null {
  if (!s || typeof s !== "string") return null;
  const trimmed = s.trim();
  // ISO YYYY-MM-DD
  let m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3])) return d;
  }
  // DD/MM/YYYY or DD-MM-YYYY
  m = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    if (d.getFullYear() === Number(m[3]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[1])) return d;
  }
  return null;
}

function isWithinMonths(date: Date, months: number, today = new Date()): boolean {
  const cutoff = new Date(today);
  cutoff.setMonth(cutoff.getMonth() - months);
  return date >= cutoff && date <= today;
}

function isWithinYear(date: Date, year: number): boolean {
  return date.getFullYear() === year;
}

function signaturePresent(handwriting: any | null, labelMatcher: (l: string) => boolean): boolean | null {
  if (!handwriting?.signature_blocks) return null;
  for (const sb of handwriting.signature_blocks) {
    if (typeof sb?.label === "string" && labelMatcher(sb.label.toLowerCase()) && sb.present === true) return true;
  }
  // If we have signature blocks but none match, return false; otherwise null (no info)
  const anyMatched = handwriting.signature_blocks.some((sb: any) => typeof sb?.label === "string" && labelMatcher(sb.label.toLowerCase()));
  return anyMatched ? false : null;
}

function initialsOnEveryPage(handwriting: any | null): { every: boolean; missing: number[]; total: number } | null {
  const arr = handwriting?.initials_per_page;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const missing = arr.filter((p: any) => !p?.present).map((p: any) => p.page);
  return { every: missing.length === 0, missing, total: arr.length };
}

function markedNo(handwriting: any | null, qLabel: string): boolean | null {
  if (!handwriting?.marks) return null;
  const lc = qLabel.toLowerCase();
  for (const m of handwriting.marks) {
    const lbl = (m?.label || "").toLowerCase();
    if (lbl.includes(lc) && lbl.includes("no") && (m.kind === "tick" || m.kind === "circle" || m.kind === "cross") && (m.confidence || 0) >= 60) {
      return true;
    }
  }
  return false;
}

// ── reusable rule factories ───────────────────────────────────────────────
function ruleHasValue(fieldKey: string, label: string, required = true): ChecklistRule {
  return {
    id: `has_${fieldKey}`,
    label,
    required,
    validator: (ctx) => {
      const f = ctx.critical[fieldKey];
      const val = (f?.value || "").toString().trim();
      if (!val) return { status: required ? "fail" : "warning", detail: `${label}: not found in document.` };
      return { status: "pass", detail: `${label}: "${val}"${f.evidence_text ? ` (evidence: "${f.evidence_text.slice(0, 120)}")` : ""}.` };
    },
  };
}

function ruleStampWithinMonths(months: number, required = true): ChecklistRule {
  return {
    id: "stamp_within_months",
    label: `Stamp date within last ${months} months`,
    required,
    validator: (ctx) => {
      const f = ctx.critical.stamp_date;
      const val = (f?.value || "").toString().trim();
      if (!val) return { status: required ? "fail" : "warning", detail: "No certification stamp date found." };
      const d = parseFlexibleDate(val);
      if (!d) return { status: required ? "fail" : "warning", detail: `Stamp date "${val}" could not be parsed.` };
      if (isWithinMonths(d, months)) return { status: "pass", detail: `Stamp dated ${val} is within the last ${months} months.` };
      return { status: required ? "fail" : "warning", detail: `Stamp dated ${val} is outside the ${months}-month validity window.` };
    },
  };
}

function ruleStampWithinProgrammeYear(): ChecklistRule {
  return {
    id: "stamp_within_year",
    label: "Stamp date within current programme year",
    required: true,
    validator: (ctx) => {
      const f = ctx.critical.stamp_date;
      const val = (f?.value || "").toString().trim();
      if (!val) return { status: "fail", detail: "No certification stamp date found." };
      const d = parseFlexibleDate(val);
      if (!d) return { status: "fail", detail: `Stamp date "${val}" could not be parsed.` };
      if (isWithinYear(d, ctx.programmeYear)) return { status: "pass", detail: `Stamp dated ${val} is within programme year ${ctx.programmeYear}.` };
      return { status: "fail", detail: `Stamp dated ${val} is outside programme year ${ctx.programmeYear}.` };
    },
  };
}

function ruleSignaturePresent(matcher: (l: string) => boolean, label: string, required = true): ChecklistRule {
  return {
    id: `signature_${label.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    label,
    required,
    validator: (ctx) => {
      const present = signaturePresent(ctx.handwriting, matcher);
      if (present === true) return { status: "pass", detail: `${label}: handwriting pass detected a signature.` };
      if (present === false) return { status: required ? "fail" : "warning", detail: `${label}: signature block found but no signature detected.` };
      return { status: "warning", detail: `${label}: could not confirm a signature from the handwriting pass — please verify visually.` };
    },
  };
}

function ruleInitialsEveryPage(required = true): ChecklistRule {
  return {
    id: "initials_every_page",
    label: "Initials on every page",
    required,
    validator: (ctx) => {
      const r = initialsOnEveryPage(ctx.handwriting);
      if (!r) return { status: "warning", detail: "Initials per page could not be confirmed from the handwriting pass — please verify visually." };
      if (r.every) return { status: "pass", detail: `Initials present on all ${r.total} page(s).` };
      return { status: required ? "fail" : "warning", detail: `Initials missing on page(s) ${r.missing.join(", ")} of ${r.total}.` };
    },
  };
}

function ruleMarkedNo(qLabel: string, required = true): ChecklistRule {
  return {
    id: `marked_no_${qLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    label: `${qLabel} marked NO`,
    required,
    validator: (ctx) => {
      const r = markedNo(ctx.handwriting, qLabel);
      if (r === true) return { status: "pass", detail: `Pen mark on NO detected for ${qLabel}.` };
      if (r === false) return { status: required ? "fail" : "warning", detail: `${qLabel}: NO answer not detected by handwriting pass.` };
      return { status: "warning", detail: `${qLabel}: handwriting pass did not return marks — please verify visually.` };
    },
  };
}

function ruleFilenameConvention(): ChecklistRule {
  return {
    id: "filename_convention",
    label: "File naming convention",
    required: false,
    validator: (ctx) => {
      const fh = ctx.filenameHints;
      const issues: string[] = [];
      if (!fh.idNumber) issues.push("missing 13-digit ID number");
      if (!fh.candidateName) issues.push("missing candidate name segment");
      if (ctx.doc_type !== "Other" && !fh.docTypeHint) issues.push("missing recognisable doc-type suffix");
      if (issues.length === 0) {
        return { status: "pass", detail: `Filename "${ctx.fileName}" follows the convention.` };
      }
      return { status: "warning", detail: `Filename "${ctx.fileName}" — ${issues.join("; ")}.` };
    },
  };
}

// Common identification fields used by most checklists
const COMMON_FIELDS = ["candidate_name", "full_name", "id_number"];

// ── per-doc-type checklists ───────────────────────────────────────────────
const CHECKLISTS: Record<string, Checklist> = {
  "Certified ID": {
    doc_type: "Certified ID",
    fields: [...COMMON_FIELDS, "date_of_birth", "stamp_date", "certification_authority", "police_station", "gender"],
    rules: [
      ruleFilenameConvention(),
      ruleHasValue("full_name", "Full name on ID"),
      ruleHasValue("id_number", "13-digit SA ID number"),
      ruleHasValue("date_of_birth", "Date of birth on ID"),
      ruleHasValue("certification_authority", "Certification authority (Commissioner of Oaths or Police)"),
      ruleHasValue("stamp_date", "Stamp dated", true),
      ruleStampWithinProgrammeYear(),
    ],
  },
  "Unemployment Affidavit": {
    doc_type: "Unemployment Affidavit",
    fields: [...COMMON_FIELDS, "stamp_date", "certification_authority"],
    rules: [
      ruleFilenameConvention(),
      ruleHasValue("full_name", "Candidate full name"),
      ruleHasValue("id_number", "13-digit SA ID number"),
      ruleHasValue("certification_authority", "Commissioner of Oaths / Police"),
      ruleStampWithinMonths(3, true),
      ruleSignaturePresent((l) => l.includes("candidate") || l.includes("deponent") || l.includes("beneficiary"), "Candidate signature", true),
    ],
  },
  "EEA1 Form": {
    doc_type: "EEA1 Form",
    fields: [...COMMON_FIELDS, "race", "gender", "foreign_national", "foreign_national_support_date"],
    rules: [
      ruleFilenameConvention(),
      ruleHasValue("full_name", "Full name and surname"),
      ruleSignaturePresent((l) => l.includes("candidate") || l.includes("employee") || l.includes("signed by"), "Candidate signature", true),
      {
        id: "race_marked",
        label: "Race marked",
        required: true,
        validator: (ctx) => {
          const v = (ctx.extracted_info?.race || "").toString().trim();
          return v
            ? { status: "pass", detail: `Race marked as "${v}".` }
            : { status: "fail", detail: "Race not marked / not detected." };
        },
      },
      {
        id: "gender_marked",
        label: "Gender marked",
        required: true,
        validator: (ctx) => {
          const v = (ctx.extracted_info?.gender || "").toString().trim();
          return v
            ? { status: "pass", detail: `Gender marked as "${v}".` }
            : { status: "fail", detail: "Gender not marked / not detected." };
        },
      },
      {
        id: "foreign_national",
        label: "Foreign national field answered",
        required: true,
        validator: (ctx) => {
          const fn = ctx.extracted_info?.foreign_national;
          if (fn === true) {
            const supp = (ctx.extracted_info?.foreign_national_support_date || "").toString().trim();
            return supp
              ? { status: "pass", detail: `Foreign national: Yes, supporting date "${supp}".` }
              : { status: "fail", detail: "Foreign national marked Yes but no acquired/residence/permit date provided." };
          }
          if (fn === false) return { status: "pass", detail: "Foreign national: No (South African)." };
          return { status: "fail", detail: "Foreign national field not answered." };
        },
      },
    ],
  },
  "PWDS Confirmation of Disability": {
    doc_type: "PWDS Confirmation of Disability",
    fields: [...COMMON_FIELDS, "stamp_date", "certification_authority"],
    rules: [
      ruleFilenameConvention(),
      ruleHasValue("full_name", "Candidate full name"),
      ruleHasValue("certification_authority", "Specialist medical doctor", true),
      ruleSignaturePresent((l) => l.includes("doctor") || l.includes("specialist") || l.includes("hpcsa"), "Doctor signature", true),
    ],
  },
  "Social Media Consent": {
    doc_type: "Social Media Consent",
    fields: [...COMMON_FIELDS],
    rules: [
      ruleFilenameConvention(),
      ruleHasValue("full_name", "Candidate / beneficiary name"),
      ruleSignaturePresent((l) => l.includes("graduate") || l.includes("beneficiary") || l.includes("candidate"), "Beneficiary signature", true),
      ruleSignaturePresent((l) => l.includes("host") || l.includes("delivery"), "Optional - Host partner signature", false),
    ],
  },
  "Beneficiary Agreement": {
    doc_type: "Beneficiary Agreement",
    fields: [...COMMON_FIELDS],
    rules: [
      ruleFilenameConvention(),
      ruleHasValue("full_name", "Candidate full name"),
      ruleHasValue("id_number", "13-digit SA ID number"),
      ruleInitialsEveryPage(true),
      ruleSignaturePresent((l) => l.includes("beneficiary") || l.includes("page 12") || l.includes("page 17"), "Beneficiary signature", true),
    ],
  },
  "Offer Letter": {
    doc_type: "Offer Letter",
    fields: [...COMMON_FIELDS, "employer", "job_title", "issue_date"],
    rules: [
      ruleFilenameConvention(),
      ruleHasValue("full_name", "Candidate full name"),
      ruleHasValue("employer", "Employer / company name"),
      ruleHasValue("job_title", "Role / job title"),
      ruleSignaturePresent((l) => l.includes("hr") || l.includes("executive") || l.includes("employer") || l.includes("company"), "Signed by HR / Executive", true),
    ],
  },
  "Employment Contract FTC": {
    doc_type: "Employment Contract FTC",
    fields: [...COMMON_FIELDS, "employer", "job_title"],
    rules: [
      ruleFilenameConvention(),
      ruleHasValue("full_name", "Candidate full name"),
      ruleHasValue("id_number", "13-digit SA ID number"),
      ruleInitialsEveryPage(true),
      ruleSignaturePresent((l) => l.includes("employee") || l.includes("candidate"), "Employee signature", true),
      ruleSignaturePresent((l) => l.includes("employer") || l.includes("company"), "Employer signature", true),
    ],
  },
  "Certificate of Completion": {
    doc_type: "Certificate of Completion",
    fields: [...COMMON_FIELDS, "qualification_name", "institution", "issue_date"],
    rules: [
      ruleFilenameConvention(),
      ruleHasValue("full_name", "Candidate full name"),
      ruleHasValue("qualification_name", "Course / programme name"),
      ruleSignaturePresent((l) => l.includes("manager") || l.includes("executive") || l.includes("partner"), "Signed by Programme Manager / Executive", true),
    ],
  },
  "Bank Letter": {
    doc_type: "Bank Letter",
    fields: [...COMMON_FIELDS, "employer", "reference_number"],
    rules: [
      ruleFilenameConvention(),
      ruleHasValue("full_name", "Optional - Account holder name", false),
      ruleHasValue("reference_number", "Optional - Account / reference number", false),
    ],
  },
  "TCX Unemployment Affidavit": {
    doc_type: "TCX Unemployment Affidavit",
    fields: [...COMMON_FIELDS, "stamp_date", "certification_authority"],
    rules: [
      ruleFilenameConvention(),
      ruleHasValue("full_name", "Candidate full name"),
      ruleHasValue("id_number", "13-digit SA ID number"),
      ruleMarkedNo("Q1", true),
      ruleMarkedNo("Q2", true),
      ruleSignaturePresent((l) => l.includes("candidate") || l.includes("deponent"), "Candidate signature", true),
      ruleHasValue("certification_authority", "Commissioner of Oaths / Police"),
      ruleStampWithinMonths(3, true),
    ],
  },
  "CV": {
    doc_type: "CV",
    fields: [...COMMON_FIELDS, "phone_number", "email"],
    rules: [
      ruleFilenameConvention(),
      ruleHasValue("full_name", "Optional - Candidate name", false),
      {
        id: "contact_present",
        label: "Optional - Contact details present",
        required: false,
        validator: (ctx) => {
          const phone = (ctx.extracted_info?.phone_number || "").toString().trim();
          const email = (ctx.extracted_info?.email || "").toString().trim();
          return phone || email
            ? { status: "pass", detail: `Contact: ${[phone, email].filter(Boolean).join(" / ")}.` }
            : { status: "warning", detail: "No phone or email detected." };
        },
      },
    ],
  },
  "Capaciti Declaration": {
    doc_type: "Capaciti Declaration",
    fields: [...COMMON_FIELDS, "issue_date"],
    rules: [
      ruleFilenameConvention(),
      ruleHasValue("full_name", "Candidate name"),
      ruleSignaturePresent((l) => l.includes("candidate") || l.includes("declarant"), "Candidate signature", true),
      ruleHasValue("issue_date", "Dated by candidate", true),
    ],
  },
  "Qualification Matric": {
    doc_type: "Qualification Matric",
    fields: [...COMMON_FIELDS, "qualification_name", "institution"],
    rules: [
      ruleFilenameConvention(),
      ruleHasValue("full_name", "Optional - Candidate name", false),
      ruleHasValue("institution", "Optional - Institution name", false),
      ruleHasValue("qualification_name", "Optional - Qualification / Matric title", false),
    ],
  },
  "Tax Certificate": {
    doc_type: "Tax Certificate",
    fields: [...COMMON_FIELDS, "reference_number"],
    rules: [
      ruleFilenameConvention(),
      ruleHasValue("reference_number", "Optional - Tax / IRP5 reference number", false),
      ruleHasValue("full_name", "Optional - Candidate name", false),
    ],
  },
  "MIE Verification": {
    doc_type: "MIE Verification",
    fields: [...COMMON_FIELDS],
    rules: [
      ruleFilenameConvention(),
      ruleHasValue("full_name", "Optional - Candidate name", false),
    ],
  },
  "Other": {
    doc_type: "Other",
    fields: [...COMMON_FIELDS],
    rules: [
      ruleFilenameConvention(),
      ruleHasValue("full_name", "Optional - Candidate name", false),
      ruleHasValue("id_number", "Optional - 13-digit SA ID number", false),
    ],
  },
};

function getChecklist(doc_type: string): Checklist {
  return CHECKLISTS[doc_type] || CHECKLISTS["Other"];
}

// ═══════════════════════════════════════════════════════════════════════════
// Stage 4 — Strict, checklist-scoped extraction
// ═══════════════════════════════════════════════════════════════════════════

const CRITICAL_FIELD_KEYS = [
  "candidate_name",
  "full_name",
  "id_number",
  "date_of_birth",
  "stamp_date",
  "certification_authority",
] as const;

const criticalFieldSchema = {
  type: "object",
  properties: {
    value: { type: "string", description: "Exact visible text. Empty string if not found." },
    confidence: { type: "number", description: "0-100 confidence in this field." },
    evidence_text: { type: "string", description: "The exact surrounding text, label, or stamp wording that supports this value." },
    page_number: { type: "number", description: "1-indexed page number where the field was found, or 0 if unknown." },
  },
  required: ["value", "confidence", "evidence_text"],
  additionalProperties: false,
};

function buildExtractToolSchema(): any {
  const criticalProps: Record<string, any> = {};
  for (const k of CRITICAL_FIELD_KEYS) criticalProps[k] = criticalFieldSchema;
  return {
    type: "function",
    function: {
      name: "extract_document_fields",
      description: "Extract only the fields requested for this checklist. Use exact visible text only. Do not infer values.",
      parameters: {
        type: "object",
        properties: {
          critical_fields: {
            type: "object",
            description: "Structured extraction of critical fields with evidence and confidence.",
            properties: criticalProps,
            required: [...CRITICAL_FIELD_KEYS],
            additionalProperties: false,
          },
          extracted_info: {
            type: "object",
            description: "Flat extraction of supporting fields. Leave empty/null if not visible.",
            properties: {
              full_name: { type: "string" },
              id_number: { type: "string" },
              date_of_birth: { type: "string" },
              gender: { type: "string" },
              race: { type: "string" },
              nationality: { type: "string" },
              foreign_national: { type: "boolean" },
              foreign_national_support_date: { type: "string" },
              address: { type: "string" },
              phone_number: { type: "string" },
              email: { type: "string" },
              employer: { type: "string" },
              job_title: { type: "string" },
              qualification_name: { type: "string" },
              institution: { type: "string" },
              issue_date: { type: "string" },
              expiry_date: { type: "string" },
              reference_number: { type: "string" },
              signature_present: { type: "boolean" },
              additional_notes: { type: "string" },
            },
          },
          stamp_date: { type: "string", description: "Date on certification stamp (YYYY-MM-DD if possible). Empty if none." },
          police_station: { type: "string", description: "Police station name if visible. Empty if none." },
          summary: { type: "string", description: "Plain-English description of what is on the document. No pass/fail judgement." },
        },
        required: ["critical_fields", "extracted_info", "summary"],
        additionalProperties: false,
      },
    },
  };
}

function buildExtractSystemPrompt(checklist: Checklist, today: string): string {
  return `You are a strict, evidence-based extractor for South African HR documents.

The document type has ALREADY been classified as "${checklist.doc_type}". Do NOT re-classify. Do NOT decide pass/fail. Validation is performed deterministically AFTER your extraction by a separate rule engine.

TODAY'S DATE: ${today}

YOUR JOB: extract only the fields listed below from the document.

REQUESTED FIELDS FOR THIS CHECKLIST:
- ${checklist.fields.join("\n- ")}

STRICT EXTRACTION RULES:
1. Use only EXACT visible text. Do NOT infer, guess, complete, or normalise.
2. Do NOT combine fragments unless they are clearly part of the same labeled field on the page.
3. If a field is ambiguous, multiply-labeled, or unclear, return an empty value with low confidence.
4. Prefer the closest labeled field. If a value appears in two places, use the one with the clearest label.
5. NAMES: copy the printed/handwritten name verbatim. Do NOT add, expand, or invent middle names. Only include a middle name if it is printed inside the SAME labeled full-name field. If only a first name and surname are visible in the labeled name field, return ONLY that.
6. ID NUMBERS: must be exactly 13 digits, copied verbatim. Do not pad, truncate, or "fix" digits.
7. DATES: prefer ISO YYYY-MM-DD; otherwise return DD/MM/YYYY exactly as written.
8. STAMP DATE: only the date physically printed on or written into the certification stamp. Not other dates on the page.
9. CERTIFICATION AUTHORITY: copy the exact wording on the stamp (e.g. "Commissioner of Oaths", police station name).
10. EVIDENCE: for every critical field, return evidence_text that contains the exact surrounding label / stamp wording. If you cannot show evidence, set value to empty and confidence to a low number.
11. HANDWRITTEN CONTENT: read pen marks and handwriting as carefully as printed text, but still copy verbatim.
12. NEVER invent values to satisfy a field. Empty + low confidence is the correct answer when uncertain.

OUTPUT:
- Fill critical_fields for ALL of: ${CRITICAL_FIELD_KEYS.join(", ")}. Use empty value + low confidence if absent.
- Fill extracted_info with the supporting fields above when visible. Leave others blank.
- Fill stamp_date and police_station at the top level when applicable.
- summary is a short plain-English description of what the document is and what fields you could read. NO pass/fail language.

Respond using the extract_document_fields function.`;
}

async function extractFields(
  apiKey: string,
  model: string,
  fileUrl: string,
  fileName: string,
  checklist: Checklist,
  filenameHints: FilenameHints,
  crossReferenceContext: CrossReferenceContext,
): Promise<{ critical_fields: any; extracted_info: any; stamp_date?: string; police_station?: string; summary?: string } | null> {
  const today = new Date().toISOString().split("T")[0];
  const systemPrompt = buildExtractSystemPrompt(checklist, today);

  const filenameHintParts: string[] = [];
  if (filenameHints.candidateName) filenameHintParts.push(`candidate name "${filenameHints.candidateName}"`);
  if (filenameHints.idNumber) filenameHintParts.push(`ID number "${filenameHints.idNumber}"`);
  const filenameNote = filenameHintParts.length > 0
    ? `Filename hints (supporting context only — do NOT let these override what the document actually says): ${filenameHintParts.join(", ")}.`
    : `Filename hints: none parseable from "${fileName}".`;

  const crossNote = crossReferenceContext.available
    ? `Cross-reference candidate ID document: name "${crossReferenceContext.candidateName || "Unknown"}", ID "${crossReferenceContext.idNumber || "Unknown"}". Use only as supporting context; extract what the document actually shows.`
    : `No cross-reference ID document is available. Extract only what this document shows.`;

  const textPrompt = `Document type (already classified): "${checklist.doc_type}". Filename: "${fileName}". ${filenameNote} ${crossNote}\n\nExtract ONLY the requested fields from the actual document content. Read every page. Use exact visible text and provide evidence_text for every critical field. Respond using the extract_document_fields function.`;

  const userContent = await buildVisualUserContent(fileUrl, fileName, textPrompt);
  const result = await callOpenRouterWithTool(
    apiKey,
    model,
    systemPrompt,
    userContent,
    buildExtractToolSchema(),
    "extract_document_fields",
    "CapaCiTi Document Extraction",
  );
  if (!result.ok) {
    console.warn(`Extract pass failed (${result.status}): ${result.text.slice(0, 200)}`);
    return null;
  }
  return result.args;
}

// ═══════════════════════════════════════════════════════════════════════════
// Stage 5 — Deterministic validation
// ═══════════════════════════════════════════════════════════════════════════
function runValidation(checklist: Checklist, ctx: ValidationCtx): Check[] {
  const out: Check[] = [];
  for (const rule of checklist.rules) {
    const r = rule.validator(ctx);
    if (!r) continue;
    let name = rule.label;
    // Optional rules can never fail — coerce to warning
    let status = r.status;
    if (!rule.required && status === "fail") status = "warning";
    if (!rule.required && !name.toLowerCase().startsWith("optional")) name = `Optional - ${name}`;
    out.push({ name, status, detail: r.detail });
  }
  return out;
}

function aggregateStatus(checks: Check[]): "pass" | "warning" | "fail" {
  if (checks.some((c) => c.status === "fail")) return "fail";
  if (checks.some((c) => c.status === "warning")) return "warning";
  return "pass";
}

// ═══════════════════════════════════════════════════════════════════════════
// Stage 6 — Cross-check critical values
// ═══════════════════════════════════════════════════════════════════════════
function normalizeName(s: string | null | undefined): string {
  return (s || "").toLowerCase().replace(/[^a-z]/g, "");
}

function crossCheckCriticalFields(ctx: ValidationCtx): Check[] {
  const out: Check[] = [];
  const cn = ctx.critical.candidate_name?.value || ctx.critical.full_name?.value || "";
  const fnHint = ctx.filenameHints.candidateName;
  if (fnHint && cn) {
    const a = normalizeName(cn);
    const b = normalizeName(fnHint);
    if (a && b && !(a.includes(b) || b.includes(a))) {
      out.push({
        name: "Filename vs document name match",
        status: "warning",
        detail: `Filename suggests "${fnHint}" but document content reads "${cn}". Verify visually.`,
      });
    }
  }

  const docId = (ctx.critical.id_number?.value || "").toString().replace(/\s/g, "");
  const fnId = ctx.filenameHints.idNumber;
  const xrefId = ctx.crossReferenceContext.idNumber;
  if (fnId && docId && docId !== fnId) {
    out.push({
      name: "Filename vs document ID match",
      status: "warning",
      detail: `Filename ID "${fnId}" differs from document-extracted ID "${docId}".`,
    });
  }
  if (xrefId && docId && docId !== xrefId) {
    out.push({
      name: "Candidate ID cross-reference",
      status: "fail",
      detail: `This document's ID "${docId}" does not match the candidate's ID document "${xrefId}".`,
    });
  }

  // DOB ⇄ ID
  if (isThirteenDigits(docId)) {
    const dob = (ctx.critical.date_of_birth?.value || ctx.extracted_info?.date_of_birth || "").toString().trim();
    if (dob) {
      const d = parseFlexibleDate(dob);
      if (d) {
        const yy = docId.substring(0, 2);
        const mm = docId.substring(2, 4);
        const dd = docId.substring(4, 6);
        const yearNum = parseInt(yy, 10);
        const currentYearSuffix = new Date().getFullYear() % 100;
        const fullYear = (yearNum <= currentYearSuffix ? 2000 : 1900) + yearNum;
        const idDob = new Date(fullYear, parseInt(mm, 10) - 1, parseInt(dd, 10));
        const same = idDob.getFullYear() === d.getFullYear() && idDob.getMonth() === d.getMonth() && idDob.getDate() === d.getDate();
        if (!same) {
          out.push({
            name: "Date of birth vs ID number",
            status: "fail",
            detail: `Extracted DOB "${dob}" does not match the date-of-birth segment of ID number "${docId}".`,
          });
        }
      }
    }
  }

  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// Stage 7 — Confidence gating
// ═══════════════════════════════════════════════════════════════════════════
function gateConfidence(ctx: ValidationCtx, checks: Check[]): Check[] {
  const out: Check[] = [];
  const threshold = ctx.confidenceThreshold;
  for (const key of CRITICAL_FIELD_KEYS) {
    const f = ctx.critical[key];
    if (!f) continue;
    const val = (f.value || "").toString().trim();
    if (!val) continue; // empty handled by checklist rules
    if (typeof f.confidence === "number" && f.confidence < threshold) {
      out.push({
        name: `Needs human review: ${key.replace(/_/g, " ")}`,
        status: "warning",
        detail: `Extracted "${val}" with low confidence (${f.confidence}%). Evidence: "${(f.evidence_text || "").slice(0, 160)}". Please verify visually.`,
      });
    }
  }
  return out;
}

function extractToolCall(aiData: Record<string, any>) {
  const chatCompletionsToolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
  if (chatCompletionsToolCall) return chatCompletionsToolCall;
  return null;
}

// ───────────────────────────────────────────────────────────────────────────
// Stage B: Handwriting Recognition (neural network pass)
// ───────────────────────────────────────────────────────────────────────────
const handwritingToolSchema = {
  type: "function",
  function: {
    name: "extract_handwriting",
    description: "Transcribe handwritten text and detect pen marks (ticks, crosses, circles, signatures, initials) on the document. Do NOT classify the document or do validation — only transcribe what is written/marked by hand.",
    parameters: {
      type: "object",
      properties: {
        handwritten_name: { type: "string", description: "Person's first/given name as written by hand. Empty string if not handwritten or illegible." },
        handwritten_surname: { type: "string", description: "Person's surname as written by hand. Empty string if not handwritten or illegible." },
        handwritten_id_number: { type: "string", description: "13-digit SA ID number as written by hand. Empty string if not handwritten or illegible." },
        handwritten_dates: {
          type: "array",
          description: "Each handwritten date found on the document with its label",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Field label near the date (e.g. 'Sworn date', 'Signed on', 'Stamp date')" },
              value_iso: { type: "string", description: "Date in YYYY-MM-DD format" }
            },
            required: ["label", "value_iso"]
          }
        },
        marks: {
          type: "array",
          description: "Pen marks (ticks, crosses, circles) on checkboxes / multiple-choice fields",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Field label near the mark (e.g. 'TCX Q1 NO', 'EEA1 Race - African', 'Foreign National - No', 'Person with disability - Yes')" },
              kind: { type: "string", enum: ["tick", "cross", "circle", "none"] },
              confidence: { type: "number", description: "0-100" }
            },
            required: ["label", "kind", "confidence"]
          }
        },
        signature_blocks: {
          type: "array",
          description: "Each named signature block on the document and whether a handwritten signature is present",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Block label (e.g. 'Beneficiary signature page 12', 'Commissioner of Oaths', 'Employee', 'Employer')" },
              present: { type: "boolean" },
              confidence: { type: "number" }
            },
            required: ["label", "present", "confidence"]
          }
        },
        initials_per_page: {
          type: "array",
          description: "For multi-page documents requiring initials on every page (BA, FTC). One entry per page.",
          items: {
            type: "object",
            properties: {
              page: { type: "number" },
              present: { type: "boolean" }
            },
            required: ["page", "present"]
          }
        },
        field_confidences: {
          type: "object",
          properties: {
            name: { type: "number" },
            surname: { type: "number" },
            id_number: { type: "number" },
            dates: { type: "number" }
          }
        },
        illegible_fields: {
          type: "array",
          items: { type: "string" },
          description: "Labels of handwritten fields that were attempted but could not be read"
        }
      },
      required: ["handwritten_name", "handwritten_surname", "handwritten_id_number", "handwritten_dates", "marks", "signature_blocks", "initials_per_page", "field_confidences", "illegible_fields"],
      additionalProperties: false
    }
  }
};

const HANDWRITING_SYSTEM_PROMPT = `You are a dedicated Handwritten Text Recognition (HTR) neural network for South African HR documents.

Your ONLY job: transcribe handwritten content and detect pen marks. You do NOT classify documents, do NOT do compliance validation, do NOT comment on layout. Just read the pen.

Transcribe:
- Handwritten first/given names and surnames into handwritten_name / handwritten_surname.
- Handwritten 13-digit SA ID numbers into handwritten_id_number (digits only).
- Every handwritten date with its nearby label into handwritten_dates (ISO YYYY-MM-DD).
- Every checkbox / circle / tick / cross mark in the multiple-choice areas into marks. Use the field label printed next to the mark (e.g. "TCX Q1 NO", "EEA1 Race - African", "Foreign National - No", "Person with disability - Yes", "Gender - Male"). Set kind to whichever pen mark you actually see. confidence 0-100.
- Every signature block with its label and whether a handwritten signature is present.
- For multi-page Beneficiary Agreements and Employment Contracts, look at every page and report whether candidate initials are present on each page in initials_per_page.

Rules:
- Confidence must be honest: if the writing is messy, lower the confidence. Do NOT invent text.
- If a handwritten field is attempted but unreadable, leave its value empty and add the label to illegible_fields.
- Do not echo printed/typed text — only what is HANDWRITTEN or MARKED with a pen.
- Read every page before deciding a field is missing.

Respond using the extract_handwriting function. Be thorough.`;

async function analyzeHandwriting(apiKey: string, fileUrl: string, fileName: string): Promise<any | null> {
  try {
    const base64 = await fetchFileAsBase64(fileUrl);
    const mimeType = getMimeType(fileName);
    const userContent = isPdfFile(fileName)
      ? [
          { type: "text", text: `Transcribe handwritten content and pen marks on this document (filename: "${fileName}"). Read every page.` },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } }
        ]
      : [
          { type: "text", text: `Transcribe handwritten content and pen marks on this document (filename: "${fileName}").` },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } }
        ];

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": Deno.env.get("SUPABASE_URL") || "https://lovable.dev",
        "X-Title": "CapaCiTi Handwriting Recognition",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: HANDWRITING_SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        tools: [handwritingToolSchema],
        tool_choice: { type: "function", function: { name: "extract_handwriting" } },
      }),
    });

    if (!response.ok) {
      console.warn(`Handwriting pass failed (${response.status}); continuing without it.`);
      return null;
    }
    const data = await response.json();
    const tc = extractToolCall(data);
    const args = tc?.function?.arguments || tc?.arguments;
    if (!args) return null;
    return JSON.parse(args);
  } catch (e) {
    console.warn("Handwriting pass threw, continuing without it:", e);
    return null;
  }
}

// Reconcile Stage B handwriting output with Stage A extraction.
// Returns extra checks to append; mutates extracted in place for field promotions.
function reconcileHandwriting(
  extracted: any,
  handwriting: any | null,
): { name: string; status: string; detail: string }[] {
  if (!handwriting) return [];
  const extraChecks: { name: string; status: string; detail: string }[] = [];
  const conf = handwriting.field_confidences || {};
  const HIGH = 70;

  // Promote handwritten name into extracted_info if Gemini left it blank
  const hwFullName = [handwriting.handwritten_name, handwriting.handwritten_surname]
    .filter((v) => typeof v === "string" && v.trim())
    .join(" ")
    .trim();
  if (hwFullName) {
    const existingName = (extracted.extracted_info?.full_name || "").trim();
    if (!existingName) {
      extracted.extracted_info = { ...(extracted.extracted_info || {}), full_name: hwFullName };
      extraChecks.push({
        name: "Field read from handwriting",
        status: "pass",
        detail: `Full name "${hwFullName}" recovered from handwriting pass (confidence ${Math.max(conf.name || 0, conf.surname || 0)}%).`,
      });
    } else {
      const a = existingName.toLowerCase().replace(/\s+/g, "");
      const b = hwFullName.toLowerCase().replace(/\s+/g, "");
      if (a !== b && !a.includes(b) && !b.includes(a) && (conf.name || 0) >= HIGH) {
        extraChecks.push({
          name: "Handwriting vs printed/filename mismatch",
          status: "warning",
          detail: `Printed/extracted name "${existingName}" differs from handwritten "${hwFullName}". Please verify.`,
        });
      }
    }
  }

  // Handwritten ID number
  const hwId = (handwriting.handwritten_id_number || "").replace(/\D/g, "");
  if (/^\d{13}$/.test(hwId)) {
    const existingId = (extracted.extracted_id_number || extracted.extracted_info?.id_number || "").toString().replace(/\s/g, "");
    if (!existingId || existingId.length !== 13) {
      extracted.extracted_id_number = hwId;
      extracted.extracted_info = { ...(extracted.extracted_info || {}), id_number: hwId };
      extraChecks.push({
        name: "Field read from handwriting",
        status: "pass",
        detail: `ID number "${hwId}" recovered from handwriting pass (confidence ${conf.id_number || 0}%).`,
      });
    } else if (existingId !== hwId && (conf.id_number || 0) >= HIGH) {
      extraChecks.push({
        name: "Handwriting vs printed/filename mismatch",
        status: "warning",
        detail: `Existing ID "${existingId}" differs from handwritten "${hwId}". Please verify.`,
      });
    }
  }

  // TCX Q1 / Q2 NO-circle confirmation
  for (const m of handwriting.marks || []) {
    const lbl = (m.label || "").toLowerCase();
    if ((lbl.includes("q1") || lbl.includes("question 1")) && lbl.includes("no") && m.kind === "circle" && (m.confidence || 0) >= HIGH) {
      extraChecks.push({ name: "TCX Q1 marked NO (handwriting)", status: "pass", detail: `Pen circle around NO detected (confidence ${m.confidence}%).` });
    }
    if ((lbl.includes("q2") || lbl.includes("question 2")) && lbl.includes("no") && m.kind === "circle" && (m.confidence || 0) >= HIGH) {
      extraChecks.push({ name: "TCX Q2 marked NO (handwriting)", status: "pass", detail: `Pen circle around NO detected (confidence ${m.confidence}%).` });
    }
  }

  // Low-confidence reads → warnings (informational, never fail)
  const lowConf: string[] = [];
  if (handwriting.handwritten_name && (conf.name || 0) < HIGH) lowConf.push(`name (${conf.name || 0}%)`);
  if (handwriting.handwritten_surname && (conf.surname || 0) < HIGH) lowConf.push(`surname (${conf.surname || 0}%)`);
  if (hwId && (conf.id_number || 0) < HIGH) lowConf.push(`ID number (${conf.id_number || 0}%)`);
  if (lowConf.length > 0) {
    extraChecks.push({
      name: "Optional - Low-confidence handwriting read",
      status: "warning",
      detail: `Handwriting pass returned uncertain values for: ${lowConf.join(", ")}. Please verify visually.`,
    });
  }

  if (Array.isArray(handwriting.illegible_fields) && handwriting.illegible_fields.length > 0) {
    extraChecks.push({
      name: "Optional - Illegible handwritten fields",
      status: "warning",
      detail: `Could not read: ${handwriting.illegible_fields.join(", ")}.`,
    });
  }

  return extraChecks;
}

// Canonical doc-type list mirrored from extract_document_info schema.
const CAPACITI_DOC_TYPES = [
  "Certified ID",
  "Unemployment Affidavit",
  "EEA1 Form",
  "PWDS Confirmation of Disability",
  "Social Media Consent",
  "Beneficiary Agreement",
  "Offer Letter",
  "Employment Contract FTC",
  "Certificate of Completion",
  "MIE Verification",
  "Bank Letter",
  "TCX Unemployment Affidavit",
  "CV",
  "Capaciti Declaration",
  "Qualification Matric",
  "Tax Certificate",
  "Other",
] as const;

const reclassifyToolSchema = {
  type: "function",
  function: {
    name: "reclassify_document",
    description: "Re-examine a previously unclassified document and pick the best Capaciti document type from headings, footers, form codes, letterheads, and titles only.",
    parameters: {
      type: "object",
      properties: {
        document_type: { type: "string", enum: [...CAPACITI_DOC_TYPES] },
        confidence: { type: "number", description: "Confidence 0-100 in the chosen type." },
        classification_evidence: { type: "string", description: "Exact text (heading, form code, letterhead, title) used to make the decision. Empty if none found." },
      },
      required: ["document_type", "confidence", "classification_evidence"],
      additionalProperties: false,
    },
  },
};

const RECLASSIFY_SYSTEM_PROMPT = `You are a Capaciti HR document classifier. The previous pass returned "Other" for this document. Re-examine the document and pick the single best match from the 16 Capaciti document types.

Look ONLY at strong identifying signals:
- Form codes / IDs printed on the page (EEA1, TCX, IRP5, BA)
- Letterheads (SARS, SAPS, banks, municipalities, traffic department, training providers, Capaciti)
- Document titles and headings ("Affidavit", "Bank Letter", "Proof of Address", "Proof of Residence", "Curriculum Vitae", "Certificate of Completion", "Matric Certificate", "Senior Certificate", "Beneficiary Agreement", "Employment Contract", "Offer Letter", "Confirmation of Disability", "Social Media Consent")
- Signatory blocks ("Commissioner of Oaths", "SAPS")

Mapping rules:
- "Proof of Address" / "Proof of Residence" letters from a bank, municipality, traffic department, or SAPS → "Bank Letter".
- Police clearance / SAPS unemployment affidavit → "Unemployment Affidavit".
- IRP5 / SARS tax number letter / income tax certificate → "Tax Certificate".
- MIE consent / background check → "MIE Verification".
- Matric / Senior Certificate / NSC / IEB → "Qualification Matric".

Return "Other" ONLY if you genuinely cannot find any heading, form code, letterhead, or title that maps to one of the 16 types. Provide classification_evidence (the exact text relied on) and a confidence 0-100. Read every page.

Respond using the reclassify_document function.`;

async function reclassifyDocument(apiKey: string, fileUrl: string, fileName: string): Promise<{ document_type: string; confidence: number; classification_evidence: string } | null> {
  try {
    const base64 = await fetchFileAsBase64(fileUrl);
    const mimeType = getMimeType(fileName);
    const userContent = isPdfFile(fileName)
      ? [
          { type: "text", text: `Re-classify this document (filename: "${fileName}"). Read every page and inspect titles, form codes, letterheads, and signatory blocks.` },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
        ]
      : [
          { type: "text", text: `Re-classify this document (filename: "${fileName}"). Inspect titles, form codes, letterheads, and signatory blocks.` },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } },
        ];

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": Deno.env.get("SUPABASE_URL") || "https://lovable.dev",
        "X-Title": "CapaCiTi Document Re-Classification",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: RECLASSIFY_SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        tools: [reclassifyToolSchema],
        tool_choice: { type: "function", function: { name: "reclassify_document" } },
      }),
    });

    if (!response.ok) {
      console.warn(`Reclassify pass failed (${response.status}); leaving document_type as Other.`);
      return null;
    }
    const data = await response.json();
    const tc = extractToolCall(data);
    const args = tc?.function?.arguments || tc?.arguments;
    if (!args) return null;
    return JSON.parse(args);
  } catch (e) {
    console.warn("Reclassify pass threw, leaving document_type as Other:", e);
    return null;
  }
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

    // Parse filename for candidate name, ID, and document type hints
    const filenameHints = parseFilename(file_name);
    console.log(`Filename hints for "${file_name}":`, JSON.stringify(filenameHints));

    const aiProvider = "openrouter";

    // Async mode is no longer supported by the staged pipeline; fall through to sync.
    if (async_mode) {
      console.log("async_mode requested but staged pipeline is sync-only; running sync.");
    }

    const today = new Date().toISOString().split("T")[0];
    const programmeYear = new Date().getFullYear();

    // ── Stage 2 + Stage B run in parallel (classification + handwriting) ──
    console.log(`Stage 2: classifying with ${aiModel} for "${file_name}"`);
    const [classifyResult, handwriting] = await Promise.all([
      classifyDocument(OPENROUTER_API_KEY, aiModel, file_url, file_name),
      analyzeHandwriting(OPENROUTER_API_KEY, file_url, file_name),
    ]);

    // ── Decide doc_type from filename + classify + reclassify ──
    let doc_type = "Other";
    let classificationSource: "ai" | "filename" | "reclassify" | "unknown" = "unknown";
    let classificationConfidence = 0;
    let classificationEvidence = "";

    if (classifyResult && classifyResult.document_type && classifyResult.document_type !== "Other" && (classifyResult.confidence ?? 0) >= 70) {
      doc_type = classifyResult.document_type;
      classificationSource = "ai";
      classificationConfidence = classifyResult.confidence ?? 0;
      classificationEvidence = classifyResult.classification_evidence || "";
    } else if (filenameHints.docTypeHint) {
      doc_type = filenameHints.docTypeHint;
      classificationSource = "filename";
      classificationConfidence = 80;
      classificationEvidence = `Filename suffix indicates "${filenameHints.docTypeHint}".`;
    } else {
      // Stage 2b: content-based reclassification
      console.log(`Stage 2b: running reclassification for "${file_name}"`);
      const reclassified = await reclassifyDocument(OPENROUTER_API_KEY, file_url, file_name);
      if (reclassified && reclassified.document_type && reclassified.document_type !== "Other" && (reclassified.confidence ?? 0) >= 70) {
        doc_type = reclassified.document_type;
        classificationSource = "reclassify";
        classificationConfidence = reclassified.confidence ?? 0;
        classificationEvidence = reclassified.classification_evidence || "";
      } else if (classifyResult) {
        // Keep whatever Stage 2 returned (likely Other) with its evidence
        doc_type = classifyResult.document_type || "Other";
        classificationSource = "ai";
        classificationConfidence = classifyResult.confidence ?? 0;
        classificationEvidence = classifyResult.classification_evidence || (reclassified?.classification_evidence || "");
      }
    }

    console.log(`Classified "${file_name}" as "${doc_type}" via ${classificationSource} (${classificationConfidence}%)`);

    // ── Stage 3: pick the checklist ──
    const checklist = getChecklist(doc_type);

    // ── Stage 4: strict, checklist-scoped extraction ──
    const extractResult = await extractFields(
      OPENROUTER_API_KEY,
      aiModel,
      file_url,
      file_name,
      checklist,
      filenameHints,
      crossReferenceContext,
    );

    if (!extractResult) {
      // Extraction failed — record a graceful error result rather than throwing
      const errorChecks: Check[] = [
        { name: "Document extraction", status: "fail", detail: "AI extraction call failed. Please re-upload or retry." },
      ];
      await supabase.from("documents").update({
        document_type: doc_type,
        candidate_name_extracted: filenameHints.candidateName || "Unknown",
        confidence_score: 0,
        validation_status: "fail",
        issues: ["AI extraction failed"],
        validation_details: {
          summary: "AI extraction call failed.",
          checks: errorChecks,
          extracted_id_number: filenameHints.idNumber || null,
          stamp_date: null,
          stamp_date_valid: null,
          police_station: null,
          certification_authority: null,
          extracted_info: filenameHints.idNumber ? { id_number: filenameHints.idNumber } : null,
          ai_provider: aiProvider,
          ai_model: aiModel,
          sa_id_validation: null,
          handwriting: handwriting || null,
          handwriting_model: handwriting ? "google/gemini-2.5-pro" : null,
          classification: { document_type: doc_type, confidence: classificationConfidence, evidence: classificationEvidence, source: classificationSource },
          critical_fields: null,
        },
        processed_at: new Date().toISOString(),
      }).eq("id", document_id);

      return new Response(JSON.stringify({
        success: false,
        document_id,
        ai_provider: aiProvider,
        ai_model: aiModel,
        document_type: doc_type,
        validation_status: "fail",
        summary: "AI extraction call failed.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Normalise critical_fields (ensure all keys present with shape)
    const critical: Record<string, { value: string | null; confidence: number; evidence_text: string; page_number?: number | null }> = {};
    for (const k of CRITICAL_FIELD_KEYS) {
      const f = extractResult.critical_fields?.[k] || {};
      critical[k] = {
        value: typeof f.value === "string" ? f.value : null,
        confidence: typeof f.confidence === "number" ? f.confidence : 0,
        evidence_text: typeof f.evidence_text === "string" ? f.evidence_text : "",
        page_number: typeof f.page_number === "number" ? f.page_number : null,
      };
    }

    const extractedInfoRaw = extractResult.extracted_info || {};
    // Promote handwriting into critical fields when extractor left them blank
    if (handwriting) {
      const hwName = [handwriting.handwritten_name, handwriting.handwritten_surname]
        .filter((v: any) => typeof v === "string" && v.trim()).join(" ").trim();
      if (hwName && !(critical.full_name.value || "").trim()) {
        critical.full_name.value = hwName;
        critical.full_name.evidence_text = `Recovered from handwriting pass (confidence ${Math.max(handwriting.field_confidences?.name || 0, handwriting.field_confidences?.surname || 0)}%).`;
        critical.full_name.confidence = Math.max(handwriting.field_confidences?.name || 0, handwriting.field_confidences?.surname || 0);
      }
      const hwId = (handwriting.handwritten_id_number || "").replace(/\D/g, "");
      if (/^\d{13}$/.test(hwId) && !(critical.id_number.value || "").trim()) {
        critical.id_number.value = hwId;
        critical.id_number.evidence_text = `Recovered from handwriting pass (confidence ${handwriting.field_confidences?.id_number || 0}%).`;
        critical.id_number.confidence = handwriting.field_confidences?.id_number || 0;
      }
    }

    // Build the validation context
    const ctx: ValidationCtx = {
      doc_type,
      fileName: file_name,
      filenameHints,
      critical,
      extracted_info: normalizeExtractedInfo(extractedInfoRaw) || extractedInfoRaw,
      handwriting,
      crossReferenceContext,
      stampValidityMonths,
      programmeYear,
      confidenceThreshold,
    };

    // ── Stage 5: deterministic rule-based validation ──
    const ruleChecks = runValidation(checklist, ctx);

    // ── Stage 6: cross-check critical values ──
    const crossChecks = crossCheckCriticalFields(ctx);

    // ── Stage 7: confidence gating ──
    const confidenceChecks = gateConfidence(ctx, ruleChecks);

    // Classification provenance check (informational)
    const classificationCheck: Check = classificationSource === "ai" || classificationSource === "reclassify"
      ? { name: "Document type from content", status: "pass", detail: `Classified as "${doc_type}" via ${classificationSource} (${classificationConfidence}%)${classificationEvidence ? `: "${classificationEvidence.slice(0, 200)}"` : ""}.` }
      : classificationSource === "filename"
        ? { name: "Document type from filename", status: "pass", detail: `Inferred from filename suffix as "${doc_type}".` }
        : { name: "Document type unrecognised", status: "warning", detail: `Could not classify the document. Treating as "Other".` };

    const allChecks: Check[] = [classificationCheck, ...ruleChecks, ...crossChecks, ...confidenceChecks];

    // Build the legacy `extracted` object the rest of the function (and UI) expects
    const candidateNameOut = (critical.candidate_name.value || critical.full_name.value || ctx.extracted_info?.full_name || filenameHints.candidateName || "Unknown").toString().trim() || "Unknown";
    const idOut = (critical.id_number.value || ctx.extracted_info?.id_number || filenameHints.idNumber || "").toString().replace(/\s/g, "");

    const overallStatus = aggregateStatus(allChecks);
    const issues = allChecks.filter((c) => c.status === "fail").map((c) => `${c.name}: ${c.detail}`);

    // Average confidence across populated critical fields → confidence_score
    const populated = Object.values(critical).filter((f) => (f.value || "").toString().trim());
    const avgConfidence = populated.length > 0
      ? Math.round(populated.reduce((sum, f) => sum + (f.confidence || 0), 0) / populated.length)
      : 50;

    const extracted = {
      document_type: doc_type,
      candidate_name: candidateNameOut,
      confidence: avgConfidence,
      validation_status: overallStatus as "pass" | "warning" | "fail",
      checks: allChecks as { name: string; status: string; detail: string }[],
      issues,
      summary: extractResult.summary || `Document classified as ${doc_type}. ${allChecks.length} checks performed.`,
      extracted_id_number: idOut || null,
      stamp_date: critical.stamp_date.value || extractResult.stamp_date || null,
      stamp_date_valid: null as boolean | null,
      police_station: extractResult.police_station || null,
      certification_authority: critical.certification_authority.value || null,
      extracted_info: { ...(ctx.extracted_info || {}) } as Record<string, any>,
      // Additive — persisted in validation_details for future UI work
      __classification: { document_type: doc_type, confidence: classificationConfidence, evidence: classificationEvidence, source: classificationSource },
      __critical_fields: critical,
    };

    // Mirror critical fields back into legacy extracted_info shape for UI compatibility
    if (critical.full_name.value && !extracted.extracted_info.full_name) extracted.extracted_info.full_name = critical.full_name.value;
    if (idOut && !extracted.extracted_info.id_number) extracted.extracted_info.id_number = idOut;
    if (critical.date_of_birth.value && !extracted.extracted_info.date_of_birth) extracted.extracted_info.date_of_birth = critical.date_of_birth.value;

    // Compute stamp_date_valid based on the rule outcome (whichever applies)
    const stampCheck = allChecks.find((c) => c.name.toLowerCase().includes("stamp date"));
    if (stampCheck) extracted.stamp_date_valid = stampCheck.status === "pass";

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
        handwriting: handwriting || null,
        handwriting_model: handwriting ? "google/gemini-2.5-pro" : null,
        classification: extracted.__classification,
        critical_fields: extracted.__critical_fields,
      },
      processed_at: new Date().toISOString(),
    }).eq("id", document_id);

    const { __classification, __critical_fields, ...extractedPublic } = extracted;
    return new Response(JSON.stringify({
      success: true,
      document_id,
      ai_provider: aiProvider,
      ai_model: aiModel,
      ...extractedPublic,
      classification: __classification,
      critical_fields: __critical_fields,
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
