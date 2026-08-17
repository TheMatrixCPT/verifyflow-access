// Phase 7 — candidate grouping and session-organised ZIP export.
import JSZip from "jszip";
import { sanitiseSegment } from "./naming";
import type { ProcessedFileRecord } from "./types";
import { triggerDownload } from "./pipeline";

export interface CandidateGroup {
  key: string;
  folderName: string;
  candidateName: string | null;
  idNumber: string | null;
  records: ProcessedFileRecord[];
}

/**
 * Groups processed records by candidate. Files only join the same group when
 * the extracted candidate name matches; the ID number is used as a tie-breaker
 * so two people with the same name are never merged.
 */
export function groupRecordsByCandidate(records: ProcessedFileRecord[]): CandidateGroup[] {
  const groups = new Map<string, CandidateGroup>();
  let unknownCounter = 0;

  for (const record of records) {
    const name = record.metadata?.candidateName?.trim() || null;
    const id = record.metadata?.idNumber?.trim() || null;

    if (!name) {
      unknownCounter += 1;
      const key = `unknown-${record.id}`;
      groups.set(key, {
        key,
        folderName: `Unknown_Candidate_${unknownCounter}`,
        candidateName: null,
        idNumber: id,
        records: [record],
      });
      continue;
    }

    const key = `${name.toLowerCase()}|${id || ""}`;
    const existing = groups.get(key);
    if (existing) {
      existing.records.push(record);
    } else {
      groups.set(key, {
        key,
        folderName: sanitiseSegment(name) || "Unknown_Candidate",
        candidateName: name,
        idNumber: id,
        records: [record],
      });
    }
  }

  // Guarantee unique folder names inside the archive.
  const used = new Set<string>();
  return Array.from(groups.values()).map((group) => {
    let folderName = group.folderName;
    let counter = 2;
    while (used.has(folderName.toLowerCase())) {
      folderName = `${group.folderName}_${counter}`;
      counter += 1;
    }
    used.add(folderName.toLowerCase());
    return { ...group, folderName };
  });
}

/** Builds and downloads: <Session>/<Candidate>/<new filename> */
export async function downloadCandidateGroupedZip(
  records: ProcessedFileRecord[],
  sessionLabel: string,
): Promise<{ candidates: number; files: number; sessionFolder: string }> {
  const exportable = records.filter((record) => record.newName && record.status !== "extraction-failed");
  if (exportable.length === 0) {
    throw new Error("There are no processed documents to export yet. Process files first, then try again.");
  }

  const sessionFolder = sanitiseSegment(sessionLabel) || "Processing_Session";
  const zip = new JSZip();
  const groups = groupRecordsByCandidate(exportable);

  for (const group of groups) {
    for (const record of group.records) {
      zip.file(`${sessionFolder}/${group.folderName}/${record.newName}`, record.file);
    }
  }

  const blob = await zip.generateAsync({ type: "blob" });
  triggerDownload(blob, `${sessionFolder}_candidate_documents.zip`);
  return { candidates: groups.length, files: exportable.length, sessionFolder };
}

export interface SessionExportCandidate {
  name: string | null;
  idNumber: string | null;
  documents: { fileName: string; filePath: string }[];
}

/** Session-page export: downloads stored documents grouped per candidate. */
export async function downloadSessionCandidateZip(
  sessionName: string,
  candidates: SessionExportCandidate[],
  downloadFile: (filePath: string) => Promise<Blob>,
): Promise<{ candidates: number; files: number; failed: string[]; sessionFolder: string }> {
  const withDocs = candidates.filter((candidate) => candidate.documents.length > 0);
  if (withDocs.length === 0) {
    throw new Error("This session has no processed documents to export yet.");
  }

  const sessionFolder = sanitiseSegment(sessionName) || "Session";
  const zip = new JSZip();
  const used = new Set<string>();
  const failed: string[] = [];
  let unknownCounter = 0;
  let fileCount = 0;

  for (const candidate of withDocs) {
    let base: string;
    if (candidate.name && candidate.name.trim()) {
      base = sanitiseSegment(candidate.name) || "Unknown_Candidate";
    } else {
      unknownCounter += 1;
      base = `Unknown_Candidate_${unknownCounter}`;
    }
    let folderName = base;
    let counter = 2;
    while (used.has(folderName.toLowerCase())) {
      folderName = `${base}_${counter}`;
      counter += 1;
    }
    used.add(folderName.toLowerCase());

    for (const document of candidate.documents) {
      try {
        const blob = await downloadFile(document.filePath);
        zip.file(`${sessionFolder}/${folderName}/${document.fileName}`, blob);
        fileCount += 1;
      } catch {
        failed.push(document.fileName);
      }
    }
  }

  if (fileCount === 0) {
    throw new Error("None of the session documents could be downloaded from storage.");
  }

  const blob = await zip.generateAsync({ type: "blob" });
  triggerDownload(blob, `${sessionFolder}_candidate_documents.zip`);
  return { candidates: withDocs.length, files: fileCount, failed, sessionFolder };
}
