// Phase 4 — filename generation and sanitisation.
import type { ExtractedMetadata, ProcessorStatus } from "./types";
import { getExtension } from "./types";

export const UNKNOWN_NAME = "Unknown_Name";
export const UNKNOWN_ID = "Unknown_ID";

export function sanitiseSegment(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_|_$/g, "");
}

export function buildNewFileName(
  originalName: string,
  metadata: ExtractedMetadata,
  usedNames: Set<string>,
): string {
  const extension = getExtension(originalName);
  const namePart = metadata.candidateName ? sanitiseSegment(metadata.candidateName) : UNKNOWN_NAME;
  const idPart = metadata.idNumber ? sanitiseSegment(metadata.idNumber) : UNKNOWN_ID;
  const typePart = sanitiseSegment(metadata.documentType);

  const base = `${namePart}_${idPart}_${typePart}`;
  let candidate = extension ? `${base}.${extension}` : base;
  let counter = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = extension ? `${base}_${counter}.${extension}` : `${base}_${counter}`;
    counter++;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

export function statusForMetadata(metadata: ExtractedMetadata): ProcessorStatus {
  if (!metadata.candidateName) return "partial-missing-name";
  if (!metadata.idNumber) return "partial-missing-id";
  return "renamed";
}
