// Shared engine used by BOTH Individual Files mode and Folder (ZIP) mode.
import JSZip from "jszip";
import { extractText } from "./extract";
import { buildMetadata } from "./classify";
import { parseFilenameHints } from "./filenameHints";
import { buildNewFileName, statusForMetadata } from "./naming";
import type { ProcessedFileRecord, StagedFile } from "./types";
import { getExtension, isSupportedFile } from "./types";

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `pf-${Date.now()}-${idCounter}`;
}

export function stageFiles(files: File[]): { staged: StagedFile[]; rejected: { name: string; reason: string }[] } {
  const staged: StagedFile[] = [];
  const rejected: { name: string; reason: string }[] = [];
  for (const file of files) {
    if (!isSupportedFile(file.name)) {
      rejected.push({ name: file.name, reason: `Unsupported file type ".${getExtension(file.name) || "unknown"}"` });
      continue;
    }
    if (file.size === 0) {
      rejected.push({ name: file.name, reason: "File is empty (0 bytes)" });
      continue;
    }
    staged.push({ id: nextId(), file, relativePath: file.name, extension: getExtension(file.name) });
  }
  return { staged, rejected };
}

export async function stageZip(
  archive: File,
): Promise<{ staged: StagedFile[]; skipped: { name: string; reason: string }[] }> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(archive);
  } catch {
    throw new Error("This ZIP archive could not be opened — it may be corrupted or password protected.");
  }

  const staged: StagedFile[] = [];
  const skipped: { name: string; reason: string }[] = [];
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);

  if (entries.length === 0) throw new Error("The ZIP archive is empty — it contains no files.");

  for (const entry of entries) {
    const baseName = entry.name.split("/").pop() || entry.name;
    if (baseName.startsWith(".") || baseName.startsWith("__MACOSX")) continue;
    if (entry.name.includes("__MACOSX/")) continue;
    if (!isSupportedFile(baseName)) {
      skipped.push({ name: entry.name, reason: `Unsupported file type ".${getExtension(baseName) || "unknown"}"` });
      continue;
    }
    const blob = await entry.async("blob");
    if (blob.size === 0) {
      skipped.push({ name: entry.name, reason: "File is empty (0 bytes)" });
      continue;
    }
    const file = new File([blob], baseName, { type: blob.type });
    staged.push({ id: nextId(), file, relativePath: entry.name, extension: getExtension(baseName) });
  }

  if (staged.length === 0 && skipped.length > 0) {
    throw new Error("The ZIP archive contains no supported documents (PDF, DOCX, JPG, PNG or TIF).");
  }
  return { staged, skipped };
}

export async function processStagedFiles(
  staged: StagedFile[],
  onRecord: (record: ProcessedFileRecord, completed: number, total: number) => void,
): Promise<ProcessedFileRecord[]> {
  const usedNames = new Set<string>();
  const records: ProcessedFileRecord[] = [];
  let completed = 0;

  for (const item of staged) {
    const extraction = await extractText(item);
    let record: ProcessedFileRecord;

    if (!extraction.text) {
      // Filename hints alone can still yield a usable rename.
      const hints = parseFilenameHints(item.file.name);
      if (hints.candidateName || hints.idNumber || hints.documentType) {
        const metadata = buildMetadata("", hints);
        record = {
          id: item.id,
          originalName: item.file.name,
          relativePath: item.relativePath,
          newName: buildNewFileName(item.file.name, metadata, usedNames),
          status: statusForMetadata(metadata),
          extraction,
          metadata,
          errorMessage: extraction.error,
          file: item.file,
        };
      } else {
        record = {
          id: item.id,
          originalName: item.file.name,
          relativePath: item.relativePath,
          newName: null,
          status: "extraction-failed",
          extraction,
          metadata: null,
          errorMessage: extraction.error || "No readable text could be extracted from this file.",
          file: item.file,
        };
      }
    } else {
      const hints = parseFilenameHints(item.file.name);
      const metadata = buildMetadata(extraction.text, hints);
      record = {
        id: item.id,
        originalName: item.file.name,
        relativePath: item.relativePath,
        newName: buildNewFileName(item.file.name, metadata, usedNames),
        status: statusForMetadata(metadata),
        extraction,
        metadata,
        file: item.file,
      };
    }

    records.push(record);
    completed += 1;
    onRecord(record, completed, staged.length);
  }

  return records;
}

export async function buildOutputZip(records: ProcessedFileRecord[], archiveName: string): Promise<void> {
  const zip = new JSZip();
  const included = records.filter((record) => record.newName && record.status !== "extraction-failed");
  for (const record of included) {
    zip.file(record.newName as string, record.file);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  triggerDownload(blob, archiveName);
}

export function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Files renamed and ready to be pushed into a validation session. */
export function renamedFiles(records: ProcessedFileRecord[]): File[] {
  return records
    .filter((record) => record.newName && record.status !== "extraction-failed")
    .map((record) => new File([record.file], record.newName as string, { type: record.file.type }));
}
