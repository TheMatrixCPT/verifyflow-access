// Certified ID validation surfaced in the Document Processor.
// The authoritative rules engine runs server-side in the process-document
// edge function (it can see the stamp, signature and barcodes). Here we only
// evaluate the rules that can be decided from the filename and extracted text,
// and clearly mark the visual rules as pending.

import type { ProcessedFileRecord } from "./types";
import { parseFilenameHints } from "./filenameHints";

export type CertifiedIdCheckStatus = "pass" | "warning" | "fail" | "pending";

export interface CertifiedIdCheck {
  name: string;
  status: CertifiedIdCheckStatus;
  detail: string;
}

export interface CertifiedIdEvaluation {
  applicable: boolean;
  status: CertifiedIdCheckStatus;
  checks: CertifiedIdCheck[];
}

const NOT_APPLICABLE: CertifiedIdEvaluation = { applicable: false, status: "pending", checks: [] };

function normaliseName(value: string | null | undefined): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z]/g, "");
}

export function programmeYear(): number {
  return new Date().getFullYear();
}

export function evaluateCertifiedId(record: ProcessedFileRecord): CertifiedIdEvaluation {
  if (record.metadata?.documentType !== "Certified ID") return NOT_APPLICABLE;

  const checks: CertifiedIdCheck[] = [];
  const hints = parseFilenameHints(record.originalName);
  const extractedId = (record.metadata?.idNumber || "").replace(/\D/g, "");
  const text = record.extraction?.text || "";

  // Rule 1 & 2 & 3 — need the actual stamp / barcode imagery.
  checks.push({
    name: "Certification stamp date within programme year",
    status: "pending",
    detail: `Checked during validation against the ${programmeYear()} programme year (the ID's own issue date is never used).`,
  });
  checks.push({
    name: "Certification stamp signed and dated",
    status: "pending",
    detail: "Checked during validation from the stamp image.",
  });
  checks.push({
    name: "Barcode visible on both sides",
    status: "pending",
    detail: "Card-type IDs only; checked during validation.",
  });

  // Rule 4 — legibility / 13-digit ID number.
  if (extractedId.length === 13) {
    checks.push({
      name: "ID legible with a 13-digit ID number",
      status: "pass",
      detail: `A 13-digit ID number (${extractedId}) was read from the document.`,
    });
  } else if (!text.trim()) {
    checks.push({
      name: "ID legible with a 13-digit ID number",
      status: "fail",
      detail: "No readable text could be extracted — the scan may be blurry, dark or cropped.",
    });
  } else {
    checks.push({
      name: "ID legible with a 13-digit ID number",
      status: "fail",
      detail: "13-digit ID number not found in the document content.",
    });
  }

  // Rule 5 — file naming consistency.
  const filenameId = (hints.idNumber || "").replace(/\D/g, "");
  const problems: string[] = [];
  if (!hints.candidateName || !filenameId) {
    problems.push(`Original filename does not follow CandidateNameSurname_IDNo_FileName ("${record.originalName}")`);
  } else {
    const filenameName = normaliseName(hints.candidateName);
    const contentName = normaliseName(record.metadata?.candidateNameSource === "content" ? record.metadata?.candidateName : null);
    if (contentName && !(filenameName.includes(contentName) || contentName.includes(filenameName))) {
      problems.push(`Filename name "${hints.candidateName}" does not match the name read from the document`);
    }
    if (extractedId.length === 13 && filenameId !== extractedId) {
      problems.push(`Filename ID ${filenameId} does not match the ID number on the document (${extractedId})`);
    }
  }

  checks.push(
    problems.length === 0
      ? {
          name: "File naming consistency",
          status: "pass",
          detail: `Renamed to "${record.newName ?? "—"}" and consistent with the extracted name and ID number.`,
        }
      : { name: "File naming consistency", status: "warning", detail: `${problems.join("; ")}.` },
  );

  const status: CertifiedIdCheckStatus = checks.some((check) => check.status === "fail")
    ? "fail"
    : checks.some((check) => check.status === "warning")
      ? "warning"
      : checks.some((check) => check.status === "pending")
        ? "pending"
        : "pass";

  return { applicable: true, status, checks };
}
