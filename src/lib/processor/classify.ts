// Phase 3 — pattern matching and classification against the app's document vocabulary.
import { validateSAId } from "@/lib/saIdValidation";
import type { ExtractedMetadata } from "./types";

/**
 * Keyword groups mapped to the existing Capaciti document type vocabulary.
 * Ordered by priority — the first group with a keyword hit wins.
 */
const KEYWORD_GROUPS: { type: string; keywords: string[] }[] = [
  { type: "EEA1 Form", keywords: ["eea1", "eea 1", "employment equity"] },
  { type: "Beneficiary Agreement", keywords: ["beneficiary agreement", "b-bbee", "bbbee", "bee beneficiary"] },
  { type: "MIE Verification", keywords: ["mie", "background screening", "background check"] },
  { type: "Unemployment Affidavit", keywords: ["criminal record", "police clearance", "saps", "unemployment affidavit"] },
  { type: "TCX Unemployment Affidavit", keywords: ["tcx"] },
  { type: "Cellphone Affidavit", keywords: ["cellphone affidavit", "cellphone", "affidavit"] },
  { type: "Capaciti Declaration", keywords: ["declaration"] },
  { type: "Certified ID", keywords: ["identity document", "id card", "passport", "identiteitsdokument", "certified copy of id"] },
  { type: "Social Media Consent", keywords: ["social media"] },
  { type: "Certificate of Completion", keywords: ["completion certificate", "certificate of completion"] },
  { type: "Attendance Register", keywords: ["attendance register", "sign-in sheet", "sign in sheet"] },
  { type: "Qualification Matric", keywords: ["qualification", "degree", "diploma", "matric", "senior certificate", "national senior certificate"] },
  { type: "Bank Letter", keywords: ["proof of address", "proof of residence", "bank letter", "bank confirmation", "bank statement"] },
  { type: "Tax Certificate", keywords: ["tax number", "income tax", "sars", "irp5"] },
  { type: "Offer Letter", keywords: ["offer of employment", "offer letter"] },
  { type: "Employment Contract FTC", keywords: ["fixed term contract", "employment contract"] },
  { type: "PWDS Confirmation of Disability", keywords: ["confirmation of disability", "disability"] },
  { type: "CV", keywords: ["curriculum vitae", "resume"] },
];

export const FALLBACK_DOCUMENT_TYPE = "Document";

const NAME_LABEL_PATTERNS = [
  /full\s*name\s*[:\-]\s*([A-Za-z][A-Za-z'\-.\s]{2,60})/i,
  /candidate(?:\s*name)?\s*[:\-]\s*([A-Za-z][A-Za-z'\-.\s]{2,60})/i,
  /(?:surname\s*and\s*)?name\s*(?:of\s*(?:learner|employee|applicant))?\s*[:\-]\s*([A-Za-z][A-Za-z'\-.\s]{2,60})/i,
  /\bI,\s+([A-Z][A-Za-z'\-.]+(?:\s+[A-Z][A-Za-z'\-.]+){1,3})/,
];

const ID_LABEL_PATTERN = /(?:id\s*(?:number|no\.?|nr)|identity\s*(?:number|no\.?))\s*[:\-]?\s*([0-9][0-9\s\-]{10,20})/i;

function cleanName(raw: string): string | null {
  const cleaned = raw
    .replace(/[\r\n].*$/s, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[^A-Za-z'\-.\s]/g, "")
    .trim();
  const words = cleaned.split(/\s+/).filter((word) => word.length > 1);
  if (words.length < 1 || words.length > 5) return null;
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function extractCandidateNameFromText(text: string): string | null {
  for (const pattern of NAME_LABEL_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const name = cleanName(match[1]);
      if (name) return name;
    }
  }
  // Heuristic: capitalised word sequences near the top of the document.
  const head = text.split(/\r?\n/).slice(0, 15);
  for (const line of head) {
    const match = line.match(/\b([A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20}){1,3})\b/);
    if (match?.[1]) {
      const name = cleanName(match[1]);
      if (name && !/^(South Africa|Republic Of|Department Of|Identity Document)$/i.test(name)) return name;
    }
  }
  return null;
}

export function extractIdNumberFromText(text: string): string | null {
  const labelled = text.match(ID_LABEL_PATTERN);
  if (labelled?.[1]) {
    const digits = labelled[1].replace(/\D/g, "");
    if (digits.length === 13) return digits;
  }
  const candidates = text.match(/\b\d[\d\s]{11,19}\d\b/g) || [];
  for (const candidate of candidates) {
    const digits = candidate.replace(/\D/g, "");
    if (digits.length === 13 && validateSAId(digits).valid) return digits;
  }
  for (const candidate of candidates) {
    const digits = candidate.replace(/\D/g, "");
    if (digits.length === 13) return digits;
  }
  return null;
}

export function classifyDocumentType(text: string): { type: string; keyword: string } | null {
  const haystack = text.toLowerCase();
  for (const group of KEYWORD_GROUPS) {
    for (const keyword of group.keywords) {
      if (haystack.includes(keyword)) return { type: group.type, keyword };
    }
  }
  return null;
}

export interface FilenameHints {
  candidateName: string | null;
  idNumber: string | null;
  documentType: string | null;
}

/**
 * Builds the final metadata. Filename hints win on conflict, matching the
 * rule already used by the validation pipeline.
 */
export function buildMetadata(text: string, hints: FilenameHints): ExtractedMetadata {
  const matchBasis: string[] = [];

  const contentName = text ? extractCandidateNameFromText(text) : null;
  const contentId = text ? extractIdNumberFromText(text) : null;
  const contentType = text ? classifyDocumentType(text) : null;

  const candidateName = hints.candidateName || contentName;
  const candidateNameSource = hints.candidateName ? "filename" : contentName ? "content" : null;

  const idNumber = hints.idNumber || contentId;
  const idNumberSource = hints.idNumber ? "filename" : contentId ? "content" : null;

  let documentType = FALLBACK_DOCUMENT_TYPE;
  let documentTypeSource: ExtractedMetadata["documentTypeSource"] = "fallback";
  if (hints.documentType) {
    documentType = hints.documentType;
    documentTypeSource = "filename";
  } else if (contentType) {
    documentType = contentType.type;
    documentTypeSource = "content";
    matchBasis.push(`type keyword "${contentType.keyword}"`);
  }

  if (candidateNameSource) matchBasis.push(`name from ${candidateNameSource}`);
  if (idNumberSource) matchBasis.push(`ID from ${idNumberSource}`);
  if (documentTypeSource === "filename") matchBasis.push("type from filename");

  return {
    candidateName,
    candidateNameSource,
    idNumber,
    idNumberSource,
    documentType,
    documentTypeSource,
    matchBasis,
  };
}
