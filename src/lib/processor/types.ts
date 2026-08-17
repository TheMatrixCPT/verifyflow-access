// Shared types for the Document Processor feature.

export type ProcessorMode = "individual" | "zip";

export type ExtractionMethod = "pdf-native" | "pdf-ocr" | "docx" | "image-ocr" | "none";

export type ProcessorStatus =
  | "queued"
  | "processing"
  | "renamed"
  | "partial-missing-id"
  | "partial-missing-name"
  | "extraction-failed"
  | "skipped-unsupported";

export interface StagedFile {
  id: string;
  file: File;
  /** Path inside the ZIP (or plain filename for individual uploads). */
  relativePath: string;
  extension: string;
}

export interface ExtractionResult {
  text: string;
  method: ExtractionMethod;
  error?: string;
}

export interface ExtractedMetadata {
  candidateName: string | null;
  candidateNameSource: "filename" | "content" | "manual" | null;
  idNumber: string | null;
  idNumberSource: "filename" | "content" | "manual" | null;
  documentType: string;
  documentTypeSource: "filename" | "content" | "manual" | "fallback";

  matchBasis: string[];
}

export interface ProcessedFileRecord {
  id: string;
  originalName: string;
  relativePath: string;
  newName: string | null;
  status: ProcessorStatus;
  extraction: ExtractionResult | null;
  metadata: ExtractedMetadata | null;
  errorMessage?: string;
  file: File;
}

export const STATUS_LABELS: Record<ProcessorStatus, string> = {
  queued: "Queued",
  processing: "Processing…",
  renamed: "Renamed Successfully",
  "partial-missing-id": "Partial Match (Missing ID)",
  "partial-missing-name": "Partial Match (Missing Name)",
  "extraction-failed": "Extraction Failed",
  "skipped-unsupported": "Skipped (Unsupported Type)",
};

export const SUPPORTED_EXTENSIONS = ["pdf", "docx", "jpg", "jpeg", "png", "tif", "tiff"] as const;

export function getExtension(name: string): string {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
}

export function isSupportedFile(name: string): boolean {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(getExtension(name));
}
