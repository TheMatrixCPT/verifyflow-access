import { supabase } from "@/integrations/supabase/client";

export interface AnswerKeyEntry {
  options: string[];
  correctOption: string;
  correctIndex: number;
}

/** Keyed by the Forms question text (verbatim). */
export type AnswerKey = Record<string, AnswerKeyEntry>;

export interface ExtractResult {
  answerKey: AnswerKey;
  matched: number;
  unmatched: number;
  total: number;
  /** Raw extracted questions for debugging / unmatched display. */
  extracted: Array<{ question: string; options: string[]; correctOption: string; correctIndex: number }>;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Normalise text for matching: lowercase, strip punctuation, collapse whitespace. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Jaccard similarity over word tokens. */
function similarity(a: string, b: string): number {
  const aw = new Set(normalize(a).split(" ").filter(Boolean));
  const bw = new Set(normalize(b).split(" ").filter(Boolean));
  if (aw.size === 0 || bw.size === 0) return 0;
  let inter = 0;
  for (const w of aw) if (bw.has(w)) inter++;
  const union = aw.size + bw.size - inter;
  return inter / union;
}

const MATCH_THRESHOLD = 0.55;

export async function extractAnswerKey(file: File, questions: string[]): Promise<ExtractResult> {
  const fileBase64 = await fileToBase64(file);
  const mimeType = file.type || guessMime(file.name);

  const { data, error } = await supabase.functions.invoke("extract-answer-key", {
    body: { fileBase64, mimeType, fileName: file.name, questions },
  });

  if (error) throw new Error(error.message || "Edge function failed");
  if ((data as any)?.error) throw new Error((data as any).error);

  const extracted: ExtractResult["extracted"] = ((data as any)?.questions ?? []).map((q: any) => ({
    question: String(q.question ?? "").trim(),
    options: Array.isArray(q.options) ? q.options.map((o: any) => String(o).trim()) : [],
    correctOption: String(q.correct_option ?? "").trim(),
    correctIndex: Number.isFinite(q.correct_index) ? q.correct_index : 0,
  }));

  // Fuzzy-match extracted questions to Forms question texts
  const answerKey: AnswerKey = {};
  let matched = 0;
  const usedExtractedIdx = new Set<number>();

  for (const formsQ of questions) {
    let bestIdx = -1;
    let bestScore = 0;
    extracted.forEach((eq, idx) => {
      if (usedExtractedIdx.has(idx)) return;
      const score = similarity(formsQ, eq.question);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    });
    if (bestIdx >= 0 && bestScore >= MATCH_THRESHOLD) {
      const eq = extracted[bestIdx];
      let correctIndex = eq.correctIndex;
      if (correctIndex < 0 || correctIndex >= eq.options.length) {
        const ci = eq.options.findIndex(
          (o) => normalize(o) === normalize(eq.correctOption),
        );
        correctIndex = ci >= 0 ? ci : 0;
      }
      answerKey[formsQ] = {
        options: eq.options,
        correctOption: eq.options[correctIndex] ?? eq.correctOption,
        correctIndex,
      };
      usedExtractedIdx.add(bestIdx);
      matched++;
    }
  }

  return {
    answerKey,
    matched,
    unmatched: questions.length - matched,
    total: questions.length,
    extracted,
  };
}

function guessMime(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "txt") return "text/plain";
  return "application/octet-stream";
}

/** Find the index of a candidate's selected text within the answer-key options (fuzzy). */
export function findSelectedIndex(selected: string, options: string[]): number {
  if (!selected || options.length === 0) return -1;
  const ns = normalize(selected);
  // exact normalized match first
  for (let i = 0; i < options.length; i++) {
    if (normalize(options[i]) === ns) return i;
  }
  // fuzzy
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < options.length; i++) {
    const s = similarity(selected, options[i]);
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  return bestScore >= 0.6 ? best : -1;
}
