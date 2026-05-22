
## Goal

Let the admin upload a source document containing the assessment questions, options, and correct answers. The Result PDF for each candidate then shows every question with all of its answer options — the candidate's selection highlighted, the correct answer marked with a tick, and a clear red state when the candidate picked the wrong option.

## User flow

1. On the Assessment page, after the Microsoft Forms .xlsx is parsed, the Assessment Details card gains a new "Answer Key Document" upload field.
2. Admin uploads a PDF, DOCX, or image (PNG/JPG) containing the questions + options + correct answers.
3. The browser sends the file (base64) to a new edge function which uses Lovable AI (Gemini multimodal) to extract a structured list of `{ question, options[], correctOption }`.
4. The result is fuzzy-matched against questions parsed from the Forms export, then merged into `ParsedWorkbook` as an `answerKey` map keyed by question text.
5. A small status panel shows: matched / unmatched questions, with a way to re-upload or clear.
6. Generating a Report (single or bulk ZIP) now uses the merged answer key.

## Report PDF changes (per question)

For each question, render every option as its own row, in order:

- Neutral option: outlined pill, gray bullet, dark text.
- Candidate selected + correct: green-filled pill, white check icon on the right, label "Your answer · Correct".
- Candidate selected + wrong: red/coral-filled pill, white X icon, label "Your answer".
- Not selected but correct: green-outlined pill, green tick on the right, label "Correct answer".
- If the answer key has no entry for that question: fall back to current behaviour (only show the selected answer pill).
- If the candidate gave no answer: show all options neutral, plus a small "No answer provided" notice.

A short legend appears once under the "Your Answers" heading explaining the three states.

## Technical details

### New edge function: `supabase/functions/extract-answer-key/index.ts`
- POST `{ fileBase64, mimeType, fileName, questions[] }` (questions array is optional — used to bias extraction).
- Calls Lovable AI Gateway (`google/gemini-2.5-pro` for accuracy, fall back to `google/gemini-2.5-flash` for text PDFs).
- Uses tool-calling with this schema:
  ```
  { questions: [{ question: string, options: string[], correct_option: string, correct_index: number }] }
  ```
- System prompt: "You are extracting an assessment answer key. For each question return its full text, the complete list of choices in order, and the correct option (both the text and zero-based index). Normalize whitespace; preserve original casing."
- Handles 429/402 from the gateway and returns clear error JSON. Uses standard `corsHeaders` import from `npm:@supabase/supabase-js@2/cors`. `verify_jwt = false` (no auth in this app).

### Client lib: `src/lib/answerKeyExtractor.ts`
- `extractAnswerKey(file, questions): Promise<AnswerKey>` — converts file to base64, invokes the edge function, returns a normalized map.
- Fuzzy matcher (`matchAnswerKey`) using lowercased + punctuation-stripped Levenshtein/Jaccard to align extracted questions to the Forms question list. Threshold ~0.7 similarity; below that → "unmatched".

### Types update: `src/lib/assessmentParser.ts`
- Extend `ParsedWorkbook` with `answerKey?: Record<string, { options: string[]; correctOption: string; correctIndex: number }>` keyed by the Forms question text.

### Assessment page (`src/pages/Assessment.tsx`)
- New `answerKey` state, plus `keyFileName`, `keyExtracting`, `keyStats {matched, unmatched, total}`.
- Inside the Assessment Details card, add an "Answer Key Document (optional)" dropzone (accept `.pdf,.docx,.png,.jpg,.jpeg`). Shows progress, file name, "Matched X of Y questions" badge, and a Clear button.
- Pass `answerKey` into `generateReport` and the ZIP loop.

### PDF generator: `src/lib/generateAssessmentPdfs.ts`
- `generateReport` accepts a new optional `answerKey` argument.
- Replace the current "selected-only" rendering with the all-options renderer described above. Reuse existing palette tokens (`PURPLE`, `SUCCESS`, `CORAL`, `LIGHT_PURPLE_BG`, `SUCCESS_BG`, `FAIL_BG`).
- Add small legend block under "Your Answers".
- Keep the current behaviour intact when `answerKey` is missing for a given question.

### Memory
- Update `mem://features/reporting` to record: assessment reports show all options with selected highlight + correct tick when an answer key is supplied.

## Out of scope

- No database persistence of answer keys (session-only, in-memory, matching the existing browser-only Assessment flow).
- Certificate PDF unchanged.
- No multi-select / multi-correct questions in v1 (single-correct only).
