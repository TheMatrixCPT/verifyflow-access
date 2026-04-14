import { supabase } from "@/integrations/supabase/client";
import { calculateValidationScore } from "@/lib/validationScore";

export interface UploadFileInstruction {
  file: File;
  targetCandidateId?: string;
  replacementDocumentId?: string;
  inferredDocumentType?: string;
  matchedCandidateName?: string;
}

export interface UploadConflict {
  fileName: string;
  candidateId?: string;
  candidateName?: string;
  inferredDocumentType?: string;
  existingDocumentId?: string;
  existingFileName?: string;
  existingUploadedAt?: string;
}

const DOCUMENT_TYPE_PATTERNS: { type: string; patterns: RegExp[] }[] = [
  { type: "ID Document", patterns: [/\bid\b/i, /\bidentity\b/i] },
  { type: "Signed Contract", patterns: [/\bcontract\b/i, /\bagreement\b/i] },
  { type: "EEA1 Form", patterns: [/\beea1\b/i, /\bemployment[-_\s]?equity\b/i] },
  { type: "Affidavit", patterns: [/\baffidavit\b/i] },
  { type: "Attendance Register", patterns: [/\battendance\b/i, /\bregister\b/i, /\btraining[-_\s]?register\b/i] },
  { type: "Qualification", patterns: [/\bqualification\b/i, /\bcertificate\b/i, /\bdiploma\b/i] },
  { type: "Proof of Address", patterns: [/\bproof[-_\s]?of[-_\s]?address\b/i, /\baddress\b/i] },
  { type: "Tax Certificate", patterns: [/\btax\b/i] },
  { type: "Police Clearance", patterns: [/\bpolice\b/i, /\bclearance\b/i] },
  { type: "CV/Resume", patterns: [/\bcv\b/i, /\bresume\b/i] },
  { type: "Reference Letter", patterns: [/\breference\b/i, /\bletter\b/i] },
  { type: "Medical Certificate", patterns: [/\bmedical\b/i] },
  { type: "Disability Document", patterns: [/\bdisability\b/i] },
  { type: "Bank Statement", patterns: [/\bbank\b/i, /\bstatement\b/i] },
  { type: "Employment Contract", patterns: [/\bemployment[-_\s]?contract\b/i] },
];

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

function toDisplayName(rawName: string): string {
  return rawName.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\s+/g, " ").trim();
}

function inferDocumentTypeFromFileName(fileName: string): string | undefined {
  const withoutExt = fileName.replace(/\.[^.]+$/, "");
  for (const documentType of DOCUMENT_TYPE_PATTERNS) {
    if (documentType.patterns.some((pattern) => pattern.test(withoutExt))) {
      return documentType.type;
    }
  }

  return undefined;
}

function matchCandidateFromFileName(
  fileName: string,
  candidates: { id: string; name: string }[],
): { id: string; name: string } | undefined {
  const withoutExt = fileName.replace(/\.[^.]+$/, "").toLowerCase();
  const sanitized = withoutExt.replace(/[^a-z\s]/g, " ");
  const fileParts = sanitized.split(/\s+/).filter(Boolean);

  let bestMatch: { id: string; name: string; score: number } | undefined;

  for (const candidate of candidates) {
    const candidateParts = candidate.name.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(Boolean);
    if (candidateParts.length === 0) continue;

    const matchingParts = candidateParts.filter((part) => fileParts.includes(part));
    const score = matchingParts.length;

    if (score >= Math.min(2, candidateParts.length)) {
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { ...candidate, score };
      }
    }
  }

  return bestMatch ? { id: bestMatch.id, name: bestMatch.name } : undefined;
}

function getChecksForDocument(document: any) {
  const details = document.validation_details as any;
  return details?.checks || [];
}

function getExtractedIdNumber(document: any): string | null {
  const details = document.validation_details as any;
  return details?.extracted_id_number || details?.extracted_info?.id_number || null;
}

async function syncSessionCandidates(sessionId: string) {
  const { data: docs, error: docsError } = await supabase
    .from("documents")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (docsError) throw docsError;
  if (!docs) return;

  const { data: existingCandidates, error: candidatesError } = await supabase
    .from("candidates")
    .select("id, name")
    .eq("session_id", sessionId);

  if (candidatesError) throw candidatesError;

  const candidateMap = new Map<string, typeof docs>();
  const normalizedToOriginal = new Map<string, string>();

  for (const doc of docs) {
    const rawName = doc.candidate_name_extracted || "Unknown";
    const normalized = normalizeName(rawName);

    if (!normalizedToOriginal.has(normalized)) {
      normalizedToOriginal.set(normalized, toDisplayName(rawName));
    }

    const displayName = normalizedToOriginal.get(normalized)!;
    if (!candidateMap.has(displayName)) candidateMap.set(displayName, []);
    candidateMap.get(displayName)!.push(doc);
  }

  const existingCandidateMap = new Map(
    (existingCandidates || []).map((candidate) => [normalizeName(candidate.name), candidate]),
  );
  const syncedCandidateIds = new Set<string>();

  for (const [name, candidateDocs] of candidateMap) {
    const allChecks = candidateDocs.flatMap((document) => getChecksForDocument(document));
    const score = allChecks.length > 0 ? calculateValidationScore(allChecks) : 0;
    const hasFailure = candidateDocs.some((document) => document.validation_status === "fail");
    const hasWarning = candidateDocs.some((document) => document.validation_status === "warning");
    const status = hasFailure ? "fail" : hasWarning ? "warning" : "pass";
    const allIssues = candidateDocs.flatMap((document) => document.issues || []);
    const extractedIdNumber = candidateDocs.map((document) => getExtractedIdNumber(document)).find(Boolean) || null;
    const summary = `${candidateDocs.length} document(s) processed. ${hasFailure ? "Some documents failed validation." : hasWarning ? "Some documents have warnings." : "All documents passed."}${allIssues.length > 0 ? " Issues: " + allIssues.join("; ") : ""}`;

    const normalized = normalizeName(name);
    const existingCandidate = existingCandidateMap.get(normalized);

    let candidateId = existingCandidate?.id;

    if (existingCandidate) {
      const { error } = await supabase
        .from("candidates")
        .update({
          name,
          id_number: extractedIdNumber,
          score,
          status,
          summary,
        })
        .eq("id", existingCandidate.id);

      if (error) throw error;
    } else {
      const { data: insertedCandidate, error } = await supabase
        .from("candidates")
        .insert({
          session_id: sessionId,
          name,
          id_number: extractedIdNumber,
          score,
          status,
          summary,
        })
        .select("id")
        .single();

      if (error) throw error;
      candidateId = insertedCandidate.id;
    }

    if (!candidateId) continue;
    syncedCandidateIds.add(candidateId);

    for (const document of candidateDocs) {
      if (document.candidate_id !== candidateId) {
        const { error } = await supabase
          .from("documents")
          .update({ candidate_id: candidateId })
          .eq("id", document.id);

        if (error) throw error;
      }
    }
  }

  const staleCandidateIds = (existingCandidates || [])
    .map((candidate) => candidate.id)
    .filter((candidateId) => !syncedCandidateIds.has(candidateId));

  if (staleCandidateIds.length > 0) {
    const { error } = await supabase.from("candidates").delete().in("id", staleCandidateIds);
    if (error) throw error;
  }
}

export async function createSession(name: string): Promise<string> {
  const { data, error } = await supabase
    .from("sessions")
    .insert({ name, status: "pending" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function checkCrossCohortCandidates(
  currentSessionId: string | undefined,
  fileNames: string[]
): Promise<{ candidateName: string; existingSessionName: string; existingSessionId: string }[]> {
  // Extract candidate names from file names (remove extension, normalize)
  const extractedNames = fileNames.map(fn => {
    const withoutExt = fn.replace(/\.[^.]+$/, '');
    // Remove common document type suffixes
    const cleaned = withoutExt
      .replace(/[-_](id|contract|eea1|affidavit|attendance|cv|resume|certificate|clearance|qualification|proof|tax|bank|medical|reference|letter|statement)/gi, '')
      .replace(/[-_]\d+$/, '')
      .trim();
    return cleaned.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean).sort().join(' ');
  }).filter(n => n.length > 0);

  if (extractedNames.length === 0) return [];

  // Get all candidates from other sessions
  const { data: allCandidates } = await supabase
    .from("candidates")
    .select("name, session_id");

  if (!allCandidates) return [];

  // Get session names
  const sessionIds = [...new Set(allCandidates.filter(c => c.session_id !== currentSessionId).map(c => c.session_id))];
  if (sessionIds.length === 0) return [];

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, name")
    .in("id", sessionIds);

  const sessionMap = new Map(sessions?.map(s => [s.id, s.name]) || []);

  const matches: { candidateName: string; existingSessionName: string; existingSessionId: string }[] = [];
  const seen = new Set<string>();

  for (const candidate of allCandidates) {
    if (candidate.session_id === currentSessionId) continue;
    const normalizedCandidate = candidate.name.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean).sort().join(' ');
    
    for (const extractedName of extractedNames) {
      // Check if any parts match (at least first + last name)
      const extractedParts = extractedName.split(' ');
      const candidateParts = normalizedCandidate.split(' ');
      const matchingParts = extractedParts.filter(p => candidateParts.includes(p));
      
      if (matchingParts.length >= 2 || (matchingParts.length === 1 && extractedParts.length === 1 && candidateParts.length === 1)) {
        const key = `${normalizedCandidate}-${candidate.session_id}`;
        if (!seen.has(key)) {
          seen.add(key);
          matches.push({
            candidateName: candidate.name,
            existingSessionName: sessionMap.get(candidate.session_id) || "Unknown Session",
            existingSessionId: candidate.session_id,
          });
        }
      }
    }
  }

  return matches;
}

export async function checkDuplicateFiles(sessionId: string, fileNames: string[]): Promise<{ fileName: string; existingUploadedAt: string }[]> {
  const { data: existingDocs } = await supabase
    .from("documents")
    .select("file_name, created_at")
    .eq("session_id", sessionId);

  if (!existingDocs) return [];

  const duplicates: { fileName: string; existingUploadedAt: string }[] = [];
  for (const fileName of fileNames) {
    const existing = existingDocs.find(d => d.file_name === fileName);
    if (existing) {
      duplicates.push({ fileName, existingUploadedAt: existing.created_at });
    }
  }
  return duplicates;
}

export async function checkSessionUploadConflicts(
  sessionId: string,
  files: File[],
): Promise<UploadConflict[]> {
  const [{ data: candidates }, { data: documents }] = await Promise.all([
    supabase.from("candidates").select("id, name").eq("session_id", sessionId),
    supabase.from("documents").select("id, candidate_id, file_name, created_at, document_type").eq("session_id", sessionId),
  ]);

  const sessionCandidates = candidates || [];
  const sessionDocuments = documents || [];

  return files.map((file) => {
    const matchedCandidate = matchCandidateFromFileName(file.name, sessionCandidates);
    const inferredDocumentType = inferDocumentTypeFromFileName(file.name);

    let existingDocument:
      | { id: string; file_name: string; created_at: string; document_type: string | null }
      | undefined;

    if (matchedCandidate && inferredDocumentType) {
      existingDocument = sessionDocuments.find((document) =>
        document.candidate_id === matchedCandidate.id && document.document_type === inferredDocumentType,
      );
    }

    return {
      fileName: file.name,
      candidateId: matchedCandidate?.id,
      candidateName: matchedCandidate?.name,
      inferredDocumentType,
      existingDocumentId: existingDocument?.id,
      existingFileName: existingDocument?.file_name,
      existingUploadedAt: existingDocument?.created_at,
    };
  });
}

export async function uploadAndProcessFiles(
  sessionId: string,
  fileInstructions: UploadFileInstruction[],
  onProgress: (processed: number, total: number) => void,
  replaceExisting: boolean = false
) {
  const total = fileInstructions.length;
  await supabase.from("sessions").update({ status: "processing" }).eq("id", sessionId);

  const replacementDocumentIds = fileInstructions
    .map((instruction) => instruction.replacementDocumentId)
    .filter((value): value is string => Boolean(value));

  if (replacementDocumentIds.length > 0) {
    const { data: existingDocs } = await supabase
      .from("documents")
      .select("id, file_path")
      .in("id", replacementDocumentIds);

    if (existingDocs && existingDocs.length > 0) {
      await supabase.storage.from("documents").remove(existingDocs.map((document) => document.file_path));
      await supabase.from("documents").delete().in("id", existingDocs.map((document) => document.id));
    }
  } else if (replaceExisting) {
    const fileNames = fileInstructions.map((instruction) => instruction.file.name);
    const { data: existingDocs } = await supabase
      .from("documents")
      .select("id, file_path, file_name")
      .eq("session_id", sessionId)
      .in("file_name", fileNames);

    if (existingDocs && existingDocs.length > 0) {
      await supabase.storage.from("documents").remove(existingDocs.map((document) => document.file_path));
      await supabase.from("documents").delete().in("id", existingDocs.map((document) => document.id));
    }
  }

  const BATCH_SIZE = 5;
  const documentRecords: { id: string; fileName: string; filePath: string; fileSize: number }[] = [];

  for (let i = 0; i < fileInstructions.length; i += BATCH_SIZE) {
    const batch = fileInstructions.slice(i, i + BATCH_SIZE);
    const uploads = batch.map(async (instruction) => {
      const file = instruction.file;
      const filePath = `${sessionId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("documents").upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: doc, error: docError } = await supabase
        .from("documents")
        .insert({
          session_id: sessionId,
          candidate_id: instruction.targetCandidateId || null,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          validation_status: "pending",
        })
        .select("id")
        .single();
      if (docError) throw docError;
      return { id: doc.id, fileName: file.name, filePath, fileSize: file.size };
    });
    const results = await Promise.all(uploads);
    documentRecords.push(...results);
  }

  let processed = 0;
  for (let i = 0; i < documentRecords.length; i += BATCH_SIZE) {
    const batch = documentRecords.slice(i, i + BATCH_SIZE);
    const processing = batch.map(async (doc) => {
      try {
        // Generate a signed URL for the AI to access the private file
        const { data: signedData } = await supabase.storage.from("documents").createSignedUrl(doc.filePath, 600);
        const fileUrl = signedData?.signedUrl;

        if (!fileUrl) {
          console.error("Could not generate signed URL for", doc.fileName);
          return null;
        }

        const { data, error } = await supabase.functions.invoke("process-document", {
          body: {
            document_id: doc.id,
            file_url: fileUrl,
            file_name: doc.fileName,
          },
        });

        if (error) {
          // Check for credit/rate limit errors from the edge function
          const errorBody = typeof error === 'object' && error !== null ? (error as any) : {};
          const errorMessage = errorBody?.message || '';
          const context = (error as any)?.context;
          
          // supabase.functions.invoke wraps non-2xx responses - check context for status
          if (context?.status === 402 || errorMessage.includes('credits_exhausted')) {
            const { toast } = await import('sonner');
            toast.error("Credits Exhausted", {
              description: "Your OpenRouter credits have been exhausted. Please top up at openrouter.ai to continue processing documents.",
              duration: 10000,
            });
          } else if (context?.status === 429 || errorMessage.includes('rate_limited')) {
            const { toast } = await import('sonner');
            toast.error("Rate Limited", {
              description: "Rate limit reached. Please wait a moment and try again.",
              duration: 5000,
            });
          }
          console.error("Processing error for", doc.fileName, error);
        }
        return data;
      } catch (e) {
        console.error("Failed to process", doc.fileName, e);
        return null;
      }
    });

    const results = await Promise.all(processing);
    processed += results.length;
    onProgress(processed, total);
    await supabase.from("sessions").update({ processed_documents: processed }).eq("id", sessionId);
  }
  await syncSessionCandidates(sessionId);

  const { data: finalDocs } = await supabase
    .from("documents")
    .select("validation_status")
    .eq("session_id", sessionId);

  const totalDocs = finalDocs?.length || total;
  const hasIssues = finalDocs?.some((d) => d.validation_status === "fail" || d.validation_status === "warning");
  await supabase.from("sessions").update({
    status: hasIssues ? "has-issues" : "complete",
    processed_documents: totalDocs,
    total_documents: totalDocs,
  }).eq("id", sessionId);

  return sessionId;
}

export async function getSessions() {
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getSession(id: string) {
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function getCandidates(sessionId: string) {
  const { data, error } = await supabase
    .from("candidates")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function getDocuments(sessionId: string, candidateId?: string) {
  let query = supabase.from("documents").select("*").eq("session_id", sessionId);
  if (candidateId) query = query.eq("candidate_id", candidateId);
  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function getAllDocuments() {
  const { data, error } = await supabase
    .from("documents")
    .select("*");
  if (error) throw error;
  return data;
}

export async function deleteSession(id: string) {
  const { data: docs } = await supabase.from("documents").select("file_path").eq("session_id", id);
  if (docs && docs.length > 0) {
    await supabase.storage.from("documents").remove(docs.map((d) => d.file_path));
  }
  const { error } = await supabase.from("sessions").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteCandidate(candidateId: string) {
  // Delete associated documents from storage and DB
  const { data: docs } = await supabase.from("documents").select("file_path").eq("candidate_id", candidateId);
  if (docs && docs.length > 0) {
    await supabase.storage.from("documents").remove(docs.map((d) => d.file_path));
    await supabase.from("documents").delete().eq("candidate_id", candidateId);
  }
  const { error } = await supabase.from("candidates").delete().eq("id", candidateId);
  if (error) throw error;
}

// Settings
export async function getSettings() {
  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .limit(1)
    .single();
  if (error) throw error;
  return data;
}

export async function updateSettings(settings: {
  confidence_threshold: number;
  stamp_validity_months: number;
  strict_mode: boolean;
  from_email?: string;
}) {
  const { data: existing } = await supabase.from("settings").select("id").limit(1).single();
  if (!existing) throw new Error("No settings found");

  const { error } = await supabase
    .from("settings")
    .update(settings)
    .eq("id", existing.id);
  if (error) throw error;
}
