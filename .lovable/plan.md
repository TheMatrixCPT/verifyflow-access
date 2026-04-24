## Add Neural-Network Handwriting Recognition to Document Validation

Strengthen the existing document validation pipeline with a dedicated handwriting recognition step powered by a vision neural network model. This complements (does not replace) the current Gemini-based extraction and the filename-wins identification logic. The Assessment Tools system is not touched.

### Why This Is Needed

Today the AI prompt asks Gemini to "treat handwritten text with the same rigor as printed text", but for many Capaciti documents (Affidavits, EEA1, TCX, PWDS, Declarations, BA initials, signature/date blocks) the model still misses or misreads pen-filled fields. We need a more deterministic neural-network pass focused specifically on handwriting + checkbox/tick/circle marks, then feed those results back into validation.

### What Changes for the User

In the **Document Validation flow only**:
- Each handwriting-heavy document now gets a small new section in the candidate modal: *"Handwriting recognition"* — shows the transcribed handwritten fields (name, ID, dates, ticks, signatures present/absent) the neural network read, with a confidence score per field.
- When the neural-network reading conflicts with the filename or with Gemini's extraction, the document gets a `warning` check named `"Handwriting vs printed/filename mismatch"` with both readings shown — the admin decides.
- "Unknown candidate" rate drops further because handwritten names on affidavits/EEA1 forms are now read by a model trained for handwriting, not just generic OCR.
- TCX Question 1 / Question 2 NO-circle detection, EEA1 race/disability ticks, and signature-present detection become much more reliable.

### Technical Plan

**1. Two-stage pipeline inside `process-document` edge function**

```text
Stage A (existing): Gemini 2.5 Flash via OpenRouter
  → document_type, candidate_name, structured extracted_info, all checks

Stage B (new): Handwriting neural network pass (parallel, same base64 image)
  → handwritten_fields: { name, surname, id_number, date, ticks[], signature_present }
  → per-field confidence

Stage C (new): Reconciliation
  → Filename wins on candidate identity (already implemented)
  → Handwriting wins on hand-filled form fields when Gemini left them blank
  → Disagreements surfaced as "warning" checks, never silent overwrites
```

**2. Model choice — use OpenRouter (keeps existing stack)**

Per `mem://tech/ai-stack`, the project is "Exclusively OpenRouter". Add a second OpenRouter call to a vision model specifically prompted as a handwriting-recognition neural network:
- Primary: `google/gemini-2.5-pro` with a tightly-scoped handwriting-only prompt + tool schema (it's the strongest multimodal reasoner available via OpenRouter and handles handwriting + checkbox marks well).
- The prompt restricts the model to a single job: transcribe handwritten text and detect marks. No validation logic, no document classification — that stays in Stage A. This narrow scope is what makes it behave like a dedicated HTR (handwritten text recognition) network instead of a general extractor.
- Falls back to Stage A's result if Stage B fails or times out — never blocks validation.

(If later the user wants a true dedicated HTR neural net like TrOCR or Google Document AI, it slots into Stage B without changing the rest of the pipeline. We'd add an API key via the secrets flow and swap the call site.)

**3. New tool schema for Stage B (`extract_handwriting`)**

```text
{
  handwritten_name: string,
  handwritten_surname: string,
  handwritten_id_number: string,        // 13 digits if found
  handwritten_dates: [{ label, value_iso }],
  marks: [{ label, kind: "tick"|"cross"|"circle"|"none", confidence }],
  signature_blocks: [{ label, present: bool, confidence }],
  initials_per_page: [{ page, present: bool }],   // for BA / FTC
  field_confidences: { name, surname, id_number, dates },
  illegible_fields: [string]
}
```

**4. Reconciliation rules (added after Stage A + B complete)**

- **Identity**: filename → handwriting → printed text → Gemini-extracted, in that priority. Existing `filenameHints` logic stays; handwriting becomes the second-priority source instead of falling straight to Gemini's free-form extraction.
- **Form fields**: if Gemini's `extracted_info.X` is empty/Unknown but handwriting has it with confidence ≥ 70, use handwriting and add a `pass` check `"Field read from handwriting"`.
- **Conflicts**: if both have a value and they differ on name / ID / date, add a `warning` check `"Handwriting vs printed/filename mismatch"` with both values in the detail. Never auto-fail.
- **TCX Q1/Q2**: if `marks` for Q1/Q2 say `circle` around NO with confidence ≥ 70, mark those checks `pass` even if Gemini was uncertain.
- **Signatures / initials**: handwriting's `signature_blocks` and `initials_per_page` override Gemini when confidence ≥ 70.
- All low-confidence (< 70) handwriting reads are surfaced as warnings, never used to overwrite.

**5. Storage**

- Stage B output stored alongside Stage A in the existing `documents.validation_details` JSON column, under a new `handwriting` key. No DB migration required.
- The reconciled `extracted_info` and `checks` arrays remain the source of truth for the rest of the app (CandidateModal, report PDF, scoring, grouping).

**6. UI changes (Document Validation only)**

- `src/components/CandidateModal.tsx`: add a collapsible "Handwriting recognition" panel under each document's checks list, rendered only when `validation_details.handwriting` exists. Shows transcribed fields + confidence chips. Reuses existing card / badge / collapsible primitives — no new design tokens.
- No changes to upload flow, session list, report PDF, or settings UI.

**7. Cost & latency**

- Stage B adds one additional OpenRouter call per document. Runs in parallel with Stage A using `Promise.all` so end-to-end latency only grows by the difference between the two calls (≈ +0–3 s typical).
- Async-mode path already exists; Stage B uses sync only — async webhook flow stays untouched for now.
- Errors / 402 / 429 from Stage B are caught and logged; document still succeeds with Stage A results.

### Out of Scope

- Assessment Tools system — completely untouched.
- Report PDF layout — unchanged (handwriting data flows through the existing `extracted_info`).
- Bulk upload / folder upload — unchanged.
- Database schema — no migration.
- Adding a non-OpenRouter HTR provider (TrOCR, Google Document AI, AWS Textract) — can be a follow-up if Gemini-as-HTR proves insufficient in practice.

### Files Touched

- `supabase/functions/process-document/index.ts` — add Stage B call, handwriting tool schema, reconciliation logic, store under `validation_details.handwriting`.
- `src/components/CandidateModal.tsx` — add "Handwriting recognition" panel.
- `mem://features/validation-rules` — append a short note about the two-stage pipeline.
- `mem://tech/ai-stack` — add a line about the handwriting pass.

No changes to: assessment tools, upload modal, session detail mapping, report generators, settings, auth, DB schema.
