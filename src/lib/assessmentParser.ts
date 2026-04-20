import * as XLSX from "xlsx";

export interface QuestionAnswer {
  question: string;
  selected: string;
}

export interface Respondent {
  id: string;
  name: string;
  email: string;
  rawScore: number | null;
  totalPossible: number | null;
  percent: number | null;
  startTime: string | null;
  completionTime: string | null;
  answers: QuestionAnswer[];
}

export interface ParsedWorkbook {
  formTitle: string;
  questions: string[];
  /** For each question, the unique set of selected values across all respondents (sorted). */
  questionOptions: Record<string, string[]>;
  respondents: Respondent[];
}

/** Strip @capaciti.org.za (or any email domain) and Title-Case the resulting name. */
export function normalizeName(input: string | undefined | null): string {
  if (!input) return "Unknown Respondent";
  let raw = String(input).trim();
  if (!raw) return "Unknown Respondent";

  // If it's an email, take the local part
  if (raw.includes("@")) {
    raw = raw.split("@")[0];
  }

  // Replace separators with spaces
  raw = raw.replace(/[._\-+]+/g, " ").replace(/\s+/g, " ").trim();

  if (!raw) return "Unknown Respondent";

  // Title-case while preserving hyphens AND apostrophes (o'brien → O'Brien, mary-jane → Mary-Jane)
  const titleCaseToken = (token: string): string =>
    token
      .split("-")
      .map((seg) =>
        seg
          .split("'")
          .map((sub) => (sub ? sub[0].toUpperCase() + sub.slice(1).toLowerCase() : sub))
          .join("'"),
      )
      .join("-");

  return raw.split(" ").filter(Boolean).map(titleCaseToken).join(" ");
}

/** Identify whether a header is a metadata column rather than a question. */
const META_HEADERS = new Set(
  [
    "id",
    "start time",
    "completion time",
    "email",
    "name",
    "last modified time",
    "total points",
    "quiz feedback",
    "points",
    "feedback",
    "grade",
    "grade posted time",
    "grade/posted time",
    "graded",
    "graded time",
    "submission time",
    "submitted",
  ].map((s) => s.toLowerCase()),
);

function isMetaHeader(h: string): boolean {
  const key = h.trim().toLowerCase();
  if (META_HEADERS.has(key)) return true;
  // Catch any "*feedback*", "*grade*", "*posted time*" variants Forms might emit
  if (/feedback/i.test(key)) return true;
  if (/\bgrade\b/i.test(key)) return true;
  if (/posted\s*time/i.test(key)) return true;
  return false;
}

function isPointsColumn(h: string): boolean {
  return /^points\b/i.test(h.trim()) || /^score\b/i.test(h.trim());
}

/** Parse a Microsoft Forms .xlsx export. */
export function parseFormsWorkbook(file: ArrayBuffer, formTitleFallback = "Assessment"): ParsedWorkbook {
  const wb = XLSX.read(file, { type: "array" });
  const firstSheet = wb.SheetNames[0];
  const sheet = wb.Sheets[firstSheet];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });

  if (rows.length === 0) {
    return { formTitle: firstSheet || formTitleFallback, questions: [], questionOptions: {}, respondents: [] };
  }

  const allHeaders = Object.keys(rows[0]);
  // Build per-question pairings: question column + optional matching "Points - <question>" column.
  const questionHeaders: string[] = [];
  const pointsHeaders: Record<string, string> = {}; // question header -> points header

  for (const h of allHeaders) {
    if (isMetaHeader(h)) continue;
    if (isPointsColumn(h)) continue;
    questionHeaders.push(h);
  }

  for (const h of allHeaders) {
    if (!isPointsColumn(h)) continue;
    // Try to match "Points - Question text" → strip the prefix
    const stripped = h.replace(/^points\s*[-–:]\s*/i, "").trim();
    const match = questionHeaders.find((q) => q.trim().toLowerCase() === stripped.toLowerCase());
    if (match) pointsHeaders[match] = h;
  }

  const respondents: Respondent[] = rows.map((row, idx) => {
    const emailRaw = String(row["Email"] ?? row["email"] ?? "").trim();
    const nameRaw = String(row["Name"] ?? row["name"] ?? "").trim();
    const displayName = normalizeName(nameRaw || emailRaw);

    let rawScore: number | null = null;
    let totalPossible: number | null = null;

    const totalPointsCell = row["Total points"] ?? row["Total Points"] ?? row["Score"] ?? row["score"];
    if (totalPointsCell !== undefined && totalPointsCell !== "") {
      const str = String(totalPointsCell);
      const slash = str.match(/([\d.]+)\s*\/\s*([\d.]+)/);
      if (slash) {
        rawScore = parseFloat(slash[1]);
        totalPossible = parseFloat(slash[2]);
      } else {
        const num = parseFloat(str);
        if (!Number.isNaN(num)) rawScore = num;
      }
    }

    // If no total provided, sum per-question Points columns
    if (totalPossible === null && Object.keys(pointsHeaders).length > 0) {
      let sum = 0;
      let possible = 0;
      let hasAny = false;
      for (const q of questionHeaders) {
        const pHeader = pointsHeaders[q];
        if (!pHeader) continue;
        const cell = String(row[pHeader] ?? "").trim();
        if (cell === "") continue;
        hasAny = true;
        const slash = cell.match(/([\d.]+)\s*\/\s*([\d.]+)/);
        if (slash) {
          sum += parseFloat(slash[1]);
          possible += parseFloat(slash[2]);
        } else {
          const num = parseFloat(cell);
          if (!Number.isNaN(num)) sum += num;
          possible += 1;
        }
      }
      if (hasAny) {
        rawScore = rawScore ?? sum;
        totalPossible = possible;
      }
    }

    const percent =
      rawScore !== null && totalPossible !== null && totalPossible > 0
        ? (rawScore / totalPossible) * 100
        : rawScore !== null && totalPossible === null
          ? null
          : null;

    const answers: QuestionAnswer[] = questionHeaders.map((q) => ({
      question: q,
      selected: String(row[q] ?? "").trim(),
    }));

    return {
      id: String(row["ID"] ?? row["Id"] ?? row["id"] ?? `row-${idx + 1}`),
      name: displayName,
      email: emailRaw,
      rawScore,
      totalPossible,
      percent,
      startTime: (row["Start time"] as string) ?? null,
      completionTime: (row["Completion time"] as string) ?? null,
      answers,
    };
  });

  // Collect set of all selected values per question
  const questionOptions: Record<string, string[]> = {};
  for (const q of questionHeaders) {
    const set = new Set<string>();
    for (const r of respondents) {
      const a = r.answers.find((x) => x.question === q);
      if (a && a.selected) set.add(a.selected);
    }
    questionOptions[q] = Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  return {
    formTitle: firstSheet || formTitleFallback,
    questions: questionHeaders,
    questionOptions,
    respondents,
  };
}
