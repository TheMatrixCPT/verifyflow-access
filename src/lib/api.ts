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

export async function uploadAndProcessFiles(sessionId: string, files: File[], onProgress: (processed: number, total: number) => void) {
  const total = files.length;
  await supabase.from("sessions").update({ total_documents: total, status: "processing" }).eq("id", sessionId);

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
        const { data: urlData } = supabase.storage.from("documents").getPublicUrl(doc.filePath);
        const { data, error } = await supabase.functions.invoke("process-document", {
          body: {
            document_id: doc.id,
            file_url: urlData.publicUrl,
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
    const candidateMap = new Map<string, typeof docs>();
    for (const doc of docs) {
      const name = doc.candidate_name_extracted || "Unknown";
      if (!candidateMap.has(name)) candidateMap.set(name, []);
      candidateMap.get(name)!.push(doc);
    }

    for (const [name, candidateDocs] of candidateMap) {
      const avgScore = Math.round(
        candidateDocs.reduce((sum, d) => sum + (Number(d.confidence_score) || 0), 0) / candidateDocs.length
      );
      const hasFailure = candidateDocs.some((d) => d.validation_status === "fail");
      const hasWarning = candidateDocs.some((d) => d.validation_status === "warning");
      const status = hasFailure ? "fail" : hasWarning ? "warning" : "pass";

      const allIssues = candidateDocs.flatMap((d) => d.issues || []);

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

  const { data: finalDocs } = await supabase
    .from("documents")
    .select("validation_status")
    .eq("session_id", sessionId);

  const hasIssues = finalDocs?.some((d) => d.validation_status === "fail" || d.validation_status === "warning");
  await supabase.from("sessions").update({
    status: hasIssues ? "has-issues" : "complete",
    processed_documents: total,
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
  // Get the single settings row
  const { data: existing } = await supabase.from("settings").select("id").limit(1).single();
  if (!existing) throw new Error("No settings found");

  const { error } = await supabase
    .from("settings")
    .update(settings)
    .eq("id", existing.id);
  if (error) throw error;
}
