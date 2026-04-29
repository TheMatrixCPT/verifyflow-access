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
            "MIE Verification",
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

═══ SHARED FILE NAMING CONVENTION (applies to every document) ═══
Every Capaciti document filename should follow:
  CandidateNameSurname_IDNo_<DocSuffix>
Examples: "JohnDoe_9001015009087_BA.pdf", "JaneSmith_8505126789012_Bank Letter.pdf".
For every document, add ONE check named "File naming convention" with status:
- "pass" if the filename appears to match the convention (candidate name/surname segment + a 13-digit ID segment + a recognisable doc suffix for the matched document type),
- "warning" otherwise (NEVER fail). Detail must explain what is missing or wrong (e.g. "Missing 13-digit ID number in filename" or "Suffix should be _BA").
Recognised suffixes per type:
  Certified ID → _IDNo_FileName (any trailing label)
  Unemployment Affidavit → _Unemployment Affidavit (or similar)
  EEA1 Form → _EEA1 Form
  PWDS Confirmation of Disability → _PWD
  Social Media Consent → _Social Media Consent
  Beneficiary Agreement → _BA
  Offer Letter → _Offerletter
  Employment Contract FTC → _FTC
  Certificate of Completion → _Completionoftraining
  Bank Letter → _Bank Letter
  TCX Unemployment Affidavit → _TCX (or _Unemployment Affidavit)
  CV → _CV
  Capaciti Declaration → _Declaration
  Qualification Matric → _Matric or _Qualification
  Tax Certificate → _Tax number

═══ 1. CERTIFIED ID ═══
Required checks:
- Image clarity: Is the image clear and not blurry?
- ID number readable: 13-digit SA ID number visible and legible
- All ID details legible: name, surname, date of birth, photo
- Certification stamp present (Commissioner of Oaths or Police)
- Stamp authority: identify Police Station name OR Commissioner of Oaths
- Stamp signed: signature next to the certification stamp
- Stamp dated: a date is written/printed on the stamp
- Stamp date within the PROGRAMME YEAR: the certification date must fall within the current calendar year (year of the programme = year of TODAY's date ${today.substring(0, 4)}). If the date is from a previous year → fail. Use this rule INSTEAD of the generic "${stampValidityMonths} month" rule for Certified ID.
- Barcode visible (if it is a card-type ID — barcode should be visible on the back). For book IDs this is N/A — emit as "Optional - Barcode visibility" warning.
- Extract: stamp_date, police_station, certification_authority.

═══ 2. UNEMPLOYMENT AFFIDAVIT ═══
Required checks:
- Candidate full name and surname filled in
- Candidate 13-digit ID number filled in
- Date filled in (sworn/signed date)
- All other required fields completed (no blanks)
- Candidate signature present
- Certification stamp present, signed and dated by Commissioner of Oaths / Police
- Stamp date within the last ${stampValidityMonths} months
- Sworn/signed date corresponds to the certification stamp date (same day or within a few days). Mismatch → fail.
- Follows the standard Capaciti Unemployment Skills Training Affidavit template (V100595).

═══ 3. EEA1 FORM (Department of Labour) ═══
Required checks:
- Race marked properly (single clear selection) — extract into extracted_info.race
- Gender marked properly
- Full name AND surname displayed
- Signed by candidate
- Dated by candidate
- "Person with disability" question answered Yes or No (must be answered)
- Foreign National field: must state "No" (South African) OR "N/A" OR "Yes" with supporting acquired/residence/permit date
  → Normalize into extracted_info.foreign_national (true/false)
  → If Yes and no acquired/residence/permit date → fail
- Employment number: NOT required — emit "Optional - Employment number" pass/info regardless of whether it is filled.

═══ 4. PWDS CONFIRMATION OF DISABILITY ═══
Required checks:
- Type of disability is stated
- Disability confirmed by a relevant SPECIALIST medical doctor (not a generic GP note)
- Specialist signed AND dated the document
- Doctor's official stamp present
- Doctor's contact information completed (practice address / phone)
- HPCSA registration: 
    • If PRIVATE practice doctor → BOTH HPCSA practice number AND HPCSA personal registration number must be present
    • If PUBLIC clinic / hospital doctor → HPCSA personal registration number must be present (practice number not required)
- All required fields on the form completed by the doctor
- Follows Capaciti Doctors Disability Certificate template (V100591) where applicable, but do NOT fail purely on layout if all clinical info is present.

═══ 5. SOCIAL MEDIA CONSENT (Naspers Labs Letterhead template) ═══
Required checks:
- Page 1 completed by candidate (personal details filled)
- Page 2: Graduate / Beneficiary signature AND date present
- Page 2: Graduate / Beneficiary printed name present
- Host partner / Delivery partner signature section: blank is ACCEPTABLE → emit "Optional - Host partner signature" warning if blank, pass if filled
- Page 4: blank is ACCEPTABLE → emit "Optional - Page 4" pass/info
- Inspect ALL pages before deciding a signature is missing.

═══ 6. BENEFICIARY AGREEMENT (BA) ═══
Required checks:
- Front page: candidate name, surname, AND 13-digit ID number filled in
- ID number matches the candidate's ID document (only if cross-reference context above is available)
- Initialled on EVERY page (aggregate into a single check "Initials on every page" — fail if any page is missing initials)
- Page 12: beneficiary signature AND printed name filled in
- Page 13: beneficiary section completed (all fields filled)
- Page 17: signed AND printed name by beneficiary
- Electronic signatures must be an actual signature image / mark — typed names alone → fail
- All annexures present (the BA should be complete, not partial)
- Inspect ALL pages of this multi-page document before reporting anything as missing.

═══ 7. OFFER / EMPLOYMENT LETTER ═══
Required checks:
- Company letterhead OR clear company contact details present
- Candidate full name and surname present
- Role / job title clearly stated
- Salary amount stated
- Signed by HR representative or Company Executive
- Dated by signatory.

═══ 8. EMPLOYMENT CONTRACT / FTC ═══
Required checks:
- Front cover: candidate name, surname, AND 13-digit ID number
- All annexures present (complete contract)
- Initialled on EVERY page (aggregate into one check "Initials on every page")
- Page 10: candidate signature AND employer signature present
- Page 11 (Schedule 1): all fields filled / completed
- Page 12: signed AND dated
- Signed and dated by BOTH employer and employee on the relevant signature pages
- ID number matches the candidate's ID document (only if cross-reference context above is available)
- Inspect ALL pages before deciding anything is missing.

═══ 9. CERTIFICATE OF COMPLETION ═══
Required checks:
- Certificate or letter confirms a course, training programme, learnership, or the expected programme outcomes were achieved
- Candidate full name and surname present
- Signed by the Programme Manager OR Executive of the Implementing Partner (IP)
- Dated by the signatory.

═══ 10. BANK LETTER (no Naspers QA — informational only) ═══
ALL checks for this type must be prefixed "Optional - " and use status pass/warning only — NEVER fail.
Required checks:
- Optional - Valid South African bank: bank name should be one of ABSA, Standard Bank, FNB / First National Bank, Nedbank, Capitec, Investec, African Bank, TymeBank, Discovery Bank, Bidvest, Sasfin, Bank Zero, Access Bank. Warning if unrecognised.
- Optional - Account number present and looks valid (numeric, 9–11 digits typical)
- Optional - Account holder identifier matches candidate (name/surname/ID where present).

═══ 11. TCX UNEMPLOYMENT AFFIDAVIT (undergoes QA) ═══
Required checks:
- Candidate full name as per ID — first name, second name (if any), AND surname all present and matching the ID document where cross-reference is available
- 13-digit ID number filled in
- All form fields completed (no blanks)
- Question 1 circled / marked "NO"
- Question 2 circled / marked "NO"
- Candidate signature present
- Date filled in by candidate
- Certification stamp present, signed AND dated by Commissioner of Oaths / Police
- Sworn/signed date corresponds to the certification stamp date
- Stamp date within the last ${stampValidityMonths} months.

═══ 12. CV (informational only — no QA) ═══
ALL checks prefixed "Optional - " — never fail.
- Optional - Document is readable
- Optional - Candidate name/surname present
- Optional - Contact details present (phone or email).

═══ 13. CAPACITI DECLARATION (internal use only) ═══
Required checks:
- Signed by candidate
- Dated by candidate.

═══ 14. QUALIFICATION / MATRIC (informational — actual MIE check is external) ═══
ALL checks prefixed "Optional - " — never fail.
- Optional - Document is readable
- Optional - Institution name visible
- Optional - Qualification / Matric title visible
- Optional - Candidate name present.

═══ 15. TAX CERTIFICATE (payroll use only — no Naspers QA) ═══
ALL checks prefixed "Optional - " — never fail.
- Optional - Document is readable
- Optional - Tax / IRP5 reference number present
- Optional - Candidate name and ID present where shown.

═══ OTHER ═══
For any document that does not match the above types:
- Check image clarity
- Extract all readable information
- Verify candidate name, surname, ID number where present
- Check for signatures, dates, stamps where contextually expected
- Mark non-required missing stamps/certifications as "Optional - ..." warnings
- Do NOT fail solely because of unfamiliar layout or branding.
- If the filename or readable contents clearly indicate a known supporting document such as MIE verification, course or training completion, qualification evidence, CV, bank letter, or tax certificate, choose that specific document_type instead of "Other".

INFORMATION EXTRACTION RULES:
- You MUST extract ALL readable information into extracted_info
- Extract names, ID numbers, dates, addresses, phone numbers, emails, reference numbers
- HANDWRITTEN CONTENT: Many Capaciti documents are filled in by hand using a pen. Treat handwritten text, signatures, dates, ticks, crosses, circles, initials, and check boxes with the SAME rigor as printed text. Do your best to transcribe handwritten names, ID numbers, dates and answers — never skip a field just because it is handwritten. If handwriting is genuinely illegible after careful inspection, say so explicitly in the relevant check detail rather than marking the field as missing.
- Read handwritten answers on TCX Q1/Q2, EEA1 race/disability/foreign-national, affidavits, declarations, disability forms, and any signature/date blocks
- Read ALL pages of multi-page documents before deciding required information is missing
- Stamps may overlap printed text — still extract stamp details where visible
- Leave fields as empty string if not found — never invent information.

STAMP DATE VALIDITY:
- For Certified ID: the stamp date must be within the current programme YEAR (${today.substring(0, 4)}).
- For all other documents that require a stamp: the stamp date must be within ${stampValidityMonths} months from today (${today}).
- Set stamp_date_valid accordingly. If expired, add a FAIL check and include in issues.

VALIDATION OUTPUT RULES:
- For each check performed, include it in the "checks" array with name, status (pass/warning/fail), and detail
- Prefix warning-only / no-QA / non-scoring checks with "Optional - "
- Overall status: "fail" if ANY required check fails, "warning" if only non-critical issues exist, "pass" if all required checks pass
- Provide a plain-English summary
- Be specific about what failed and why
- ALWAYS extract and report: stamp_date, police_station, certification_authority when visible
- ALWAYS include the "File naming convention" check for every document.`;
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

async function buildUserContent(fileUrl: string, fileName: string, crossReferenceContext: CrossReferenceContext, filenameHints: FilenameHints): Promise<any[]> {
  const crossReferencePrompt = crossReferenceContext.available
    ? `Cross-reference context is available. Candidate name: "${crossReferenceContext.candidateName || "Unknown"}". Candidate ID number from uploaded ID document: "${crossReferenceContext.idNumber || "Unknown"}". Use that uploaded ID information only for document types that require ID matching.`
    : `Cross-reference context is not available. Do not perform candidate ID cross-reference checks, and do not raise a fail or warning just because no ID document was uploaded with this candidate's documents.`;

  const filenameHintParts: string[] = [];
  if (filenameHints.candidateName) filenameHintParts.push(`candidate name "${filenameHints.candidateName}"`);
  if (filenameHints.idNumber) filenameHintParts.push(`ID number "${filenameHints.idNumber}"`);
  if (filenameHints.docTypeHint) filenameHintParts.push(`document type "${filenameHints.docTypeHint}"`);
  const filenamePrompt = filenameHintParts.length > 0
    ? `FILENAME HINTS (authoritative for identification — admin-named): The filename suggests ${filenameHintParts.join(", ")}. Use these as your primary signal for candidate_name, extracted_id_number, and document_type. Confirm them against the actual document content; if the document content clearly contradicts the filename, still extract what the document says but flag the mismatch in your summary. Filename wins on conflict for candidate identification.`
    : `FILENAME HINTS: Could not parse a recognised pattern from "${fileName}". Identify the candidate and document type from content alone.`;

  const textPrompt = `Analyze this document and validate it thoroughly. Filename: "${fileName}". ${filenamePrompt} ${crossReferencePrompt} Check all pages before deciding anything is missing. Do not stop at the first pages of a multi-page document. Read pen marks, ticks, handwritten selections, and check boxes carefully because they contain important answers. Many forms are filled in by hand — transcribe handwritten names, IDs, dates and signatures with the same care as printed text. Handwriting will appear in many styles (block print, lowercase print, cursive, joined or stylized, slanted, neat or messy, in pen/pencil/marker of any colour) — interpret the intended characters regardless of style. Treat signatures and initials as PRESENT whenever any deliberate handwritten ink mark sits in the signature/initials area, even if the mark is a stylized scribble, monogram, single stroke, or otherwise unreadable; only mark them missing when the area is clearly empty. Remember to extract stamp dates, police station names, and certification authority details even when stamps overlap words. For employment equity forms, treat the nationality answer as Yes or No: No means South African, Yes means foreign national. If foreign national is marked yes, extract the acquired date of nationality, residence date, or permit-related date into extracted_info.foreign_national_support_date. For contracts, page 10 employee details is an information page and does not require employee or employer signatures. Some contracts require only the employee signature while others require both employee and employer signatures, so decide from the actual signature blocks and wording on the relevant signature page. For disability and proof-of-address documents, do not require Capaciti formatting if the core identifying information and stamps/signatures are present. If the filename or readable contents clearly indicate MIE verification, a course or training completion certificate, or another listed supporting document type, classify it using that specific document_type instead of "Other". CHOOSE "Other" ONLY AS A LAST RESORT. Before picking "Other", scan the document for: (a) form codes such as EEA1, TCX, IRP5, BA; (b) letterheads (SARS, SAPS, banks, municipalities, training providers); (c) titles like "Affidavit", "Bank Letter", "Proof of Address", "Proof of Residence", "Curriculum Vitae", "Certificate of Completion", "Matric Certificate", "Senior Certificate"; (d) signatory blocks ("Commissioner of Oaths"). A "Proof of Address" or "Proof of Residence" letter (bank, municipality, traffic department, SAPS) MUST be classified as "Bank Letter" — never "Other". If any of these point to one of the 16 Capaciti types, pick that type even when the filename gives no hint. For unfamiliar documents, still extract all readable information and verify candidate name, surname, and ID number where present. Mark non-required missing stamp or certification findings as warning checks prefixed with "Optional -". Respond using the extract_document_info function. Be thorough in your validation checks.`;
  
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

async function analyzeWithOpenRouter(apiKey: string, model: string, systemPrompt: string, fileUrl: string, fileName: string, crossReferenceContext: CrossReferenceContext, filenameHints: FilenameHints, asyncMode: boolean = false, documentId?: string) {
  const userContent = await buildUserContent(fileUrl, fileName, crossReferenceContext, filenameHints);

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

    const systemPrompt = buildSystemPrompt(confidenceThreshold, stampValidityMonths, strictMode, crossReferenceContext);

    let aiResponse: Response;
    let aiProvider = "openrouter";

    // All AI processing goes through OpenRouter
    if (async_mode) {
      console.log(`Using OpenRouter ASYNC mode (model: ${aiModel}) for document:`, document_id);
      const asyncResult = await analyzeWithOpenRouter(OPENROUTER_API_KEY, aiModel, systemPrompt, file_url, file_name, crossReferenceContext, filenameHints, true, document_id);
      
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

    // Sync mode with OpenRouter — run Stage A (validation) and Stage B (handwriting) in parallel
    console.log(`Using OpenRouter (sync, model: ${aiModel}) for document analysis + handwriting pass`);
    const [aiResponseRes, handwritingRes] = await Promise.all([
      analyzeWithOpenRouter(OPENROUTER_API_KEY, aiModel, systemPrompt, file_url, file_name, crossReferenceContext, filenameHints),
      analyzeHandwriting(OPENROUTER_API_KEY, file_url, file_name),
    ]);
    aiResponse = aiResponseRes;
    const handwriting = handwritingRes;

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
      if (status === 400) {
        return new Response(JSON.stringify({
          error: "ai_bad_request",
          message: "The AI service could not process this file. It may be an unsupported format, too large, or corrupted. Please re-upload a clear PDF or image.",
          details: errText.slice(0, 500),
        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
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

    // ── Filename-wins override for candidate identification ──
    // The admin named the file, so trust filename for candidate_name, ID, and doc type.
    // Surface mismatches as warnings instead of silently overriding.
    const filenameOverrideChecks: { name: string; status: string; detail: string }[] = [];
    const aiCandidateName = (extracted.candidate_name || "").trim();
    const aiIdNumber = (extracted.extracted_id_number || extracted.extracted_info?.id_number || "").toString().replace(/\s/g, "");

    if (filenameHints.candidateName) {
      const filenameNameNorm = filenameHints.candidateName.toLowerCase().replace(/\s+/g, "");
      const aiNameNorm = aiCandidateName.toLowerCase().replace(/\s+/g, "");
      const namesAgree = aiNameNorm && (filenameNameNorm.includes(aiNameNorm) || aiNameNorm.includes(filenameNameNorm));

      if (!aiCandidateName || aiCandidateName.toLowerCase() === "unknown") {
        extracted.candidate_name = filenameHints.candidateName;
      } else if (!namesAgree) {
        // Conflict — filename wins, raise a warning
        filenameOverrideChecks.push({
          name: "Filename vs document name match",
          status: "warning",
          detail: `Filename indicates "${filenameHints.candidateName}" but document content reads "${aiCandidateName}". Using filename for grouping; please verify.`,
        });
        extracted.candidate_name = filenameHints.candidateName;
      }
    }

    if (filenameHints.idNumber) {
      if (!aiIdNumber || aiIdNumber.length !== 13) {
        extracted.extracted_id_number = filenameHints.idNumber;
        extracted.extracted_info = { ...(extracted.extracted_info || {}), id_number: filenameHints.idNumber };
      } else if (aiIdNumber !== filenameHints.idNumber) {
        filenameOverrideChecks.push({
          name: "Filename vs document ID number match",
          status: "warning",
          detail: `Filename ID "${filenameHints.idNumber}" does not match document ID "${aiIdNumber}". Using filename ID; please verify.`,
        });
        extracted.extracted_id_number = filenameHints.idNumber;
        extracted.extracted_info = { ...(extracted.extracted_info || {}), id_number: filenameHints.idNumber };
      }
    }

    // If AI returned "Other" but filename has a recognised doc type suffix, prefer the filename type
    if (filenameHints.docTypeHint && (extracted.document_type === "Other" || !extracted.document_type)) {
      filenameOverrideChecks.push({
        name: "Document type from filename",
        status: "pass",
        detail: `Document type inferred from filename suffix as "${filenameHints.docTypeHint}".`,
      });
      extracted.document_type = filenameHints.docTypeHint;
    }

    // ── Stage A2: content-based reclassification when AI said "Other" and filename gave no hint ──
    if (
      (extracted.document_type === "Other" || !extracted.document_type) &&
      !filenameHints.docTypeHint
    ) {
      console.log(`Stage A2: running content-based reclassification for "${file_name}"`);
      const reclassified = await reclassifyDocument(OPENROUTER_API_KEY, file_url, file_name);
      if (reclassified) {
        const conf = typeof reclassified.confidence === "number" ? reclassified.confidence : 0;
        const newType = (reclassified.document_type || "").trim();
        const evidence = (reclassified.classification_evidence || "").trim();
        if (newType && newType !== "Other" && conf >= 70) {
          extracted.document_type = newType;
          filenameOverrideChecks.push({
            name: "Document type from content",
            status: "pass",
            detail: `Re-classified as "${newType}" (confidence ${conf}%) based on document content${evidence ? `: "${evidence.slice(0, 200)}"` : ""}.`,
          });
        } else {
          filenameOverrideChecks.push({
            name: "Document type unrecognised",
            status: "warning",
            detail: evidence
              ? `No recognised Capaciti document headings or form codes found. Re-classification evidence: "${evidence.slice(0, 200)}".`
              : `No recognised Capaciti document headings or form codes found. Document remains "Other".`,
          });
        }
      }
    }

    if (filenameOverrideChecks.length > 0) {
      extracted.checks = [...(extracted.checks || []), ...filenameOverrideChecks];
    }

    // ── Stage B reconciliation: handwriting recognition pass ──
    const handwritingChecks = reconcileHandwriting(extracted, handwriting);
    if (handwritingChecks.length > 0) {
      extracted.checks = [...(extracted.checks || []), ...handwritingChecks];
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
        handwriting: handwriting || null,
        handwriting_model: handwriting ? "google/gemini-2.5-pro" : null,
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
