import { supabase } from "@/integrations/supabase/client";

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

export async function uploadAndProcessFiles(
  sessionId: string,
  files: File[],
  onProgress: (processed: number, total: number) => void,
  replaceExisting: boolean = false
) {
  const total = files.length;
  await supabase.from("sessions").update({ total_documents: total, status: "processing" }).eq("id", sessionId);

  // If replacing, delete existing documents with same names
  if (replaceExisting) {
    const fileNames = files.map(f => f.name);
    const { data: existingDocs } = await supabase
      .from("documents")
      .select("id, file_path, file_name")
      .eq("session_id", sessionId)
      .in("file_name", fileNames);

    if (existingDocs && existingDocs.length > 0) {
      // Delete storage files
      await supabase.storage.from("documents").remove(existingDocs.map(d => d.file_path));
      // Delete document records
      for (const doc of existingDocs) {
        await supabase.from("documents").delete().eq("id", doc.id);
      }
    }
  }

  const BATCH_SIZE = 5;
  const documentRecords: { id: string; fileName: string; filePath: string; fileSize: number }[] = [];

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const uploads = batch.map(async (file) => {
      const filePath = `${sessionId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("documents").upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: doc, error: docError } = await supabase
        .from("documents")
        .insert({
          session_id: sessionId,
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
        if (error) console.error("Processing error for", doc.fileName, error);
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

  const { data: docs } = await supabase
    .from("documents")
    .select("*")
    .eq("session_id", sessionId);

  if (docs) {
    // Delete existing candidates for this session if replacing
    if (replaceExisting) {
      await supabase.from("candidates").delete().eq("session_id", sessionId);
    }

    // Normalize candidate names for grouping: case-insensitive, order-insensitive, handle middle names
    function normalizeName(name: string): string {
      return name
        .toLowerCase()
        .replace(/[^a-z\s]/g, '') // remove non-alpha except spaces
        .split(/\s+/)
        .filter(Boolean)
        .sort()
        .join(' ');
    }

    const candidateMap = new Map<string, typeof docs>();
    const normalizedToOriginal = new Map<string, string>();
    
    for (const doc of docs) {
      const rawName = doc.candidate_name_extracted || "Unknown";
      const normalized = normalizeName(rawName);
      
      // Use the first encountered original name as the display name
      if (!normalizedToOriginal.has(normalized)) {
        // Use the version with proper casing (title case the raw name)
        normalizedToOriginal.set(normalized, rawName.replace(/\b\w/g, c => c.toUpperCase()).replace(/\s+/g, ' ').trim());
      }
      
      const displayName = normalizedToOriginal.get(normalized)!;
      if (!candidateMap.has(displayName)) candidateMap.set(displayName, []);
      candidateMap.get(displayName)!.push(doc);
    }

    for (const [name, candidateDocs] of candidateMap) {
      // Calculate score from checks: passed checks / total checks * 100
      const allChecks = candidateDocs.flatMap((d) => {
        const details = d.validation_details as any;
        return details?.checks || [];
      });
      const totalChecks = allChecks.length;
      const passedChecks = allChecks.filter((c: any) => c.status === "pass").length;
      const avgScore = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;
      const hasFailure = candidateDocs.some((d) => d.validation_status === "fail");
      const hasWarning = candidateDocs.some((d) => d.validation_status === "warning");
      const status = hasFailure ? "fail" : hasWarning ? "warning" : "pass";

      const allIssues = candidateDocs.flatMap((d) => d.issues || []);

      // Check if candidate already exists (for keep-both scenario)
      const { data: existingCandidate } = await supabase
        .from("candidates")
        .select("id")
        .eq("session_id", sessionId)
        .eq("name", name)
        .maybeSingle();

      if (existingCandidate) {
        // Update existing candidate
        await supabase.from("candidates").update({
          score: avgScore,
          status,
          summary: `${candidateDocs.length} document(s) processed. ${hasFailure ? "Some documents failed validation." : hasWarning ? "Some documents have warnings." : "All documents passed."}${allIssues.length > 0 ? " Issues: " + allIssues.join("; ") : ""}`,
        }).eq("id", existingCandidate.id);

        for (const doc of candidateDocs) {
          await supabase.from("documents").update({ candidate_id: existingCandidate.id }).eq("id", doc.id);
        }
      } else {
        const { data: candidate } = await supabase
          .from("candidates")
          .insert({
            session_id: sessionId,
            name,
            score: avgScore,
            status,
            summary: `${candidateDocs.length} document(s) processed. ${hasFailure ? "Some documents failed validation." : hasWarning ? "Some documents have warnings." : "All documents passed."}${allIssues.length > 0 ? " Issues: " + allIssues.join("; ") : ""}`,
          })
          .select("id")
          .single();

        if (candidate) {
          for (const doc of candidateDocs) {
            await supabase.from("documents").update({ candidate_id: candidate.id }).eq("id", doc.id);
          }
        }
      }
    }
  }

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
