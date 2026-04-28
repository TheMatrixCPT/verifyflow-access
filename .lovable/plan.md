
# Strict staged validation pipeline for `process-document`

Refactor `supabase/functions/process-document/index.ts` only. Keep the current `validation_details` shape so `CandidateModal`, `CandidateCard`, `SessionDetail`, and `generateReport.ts` keep working unchanged. No DB migration. No UI change.

## New pipeline

```text
Stage 1  Filename pre-check  ── parseFilename() (already exists, kept as supporting context)
Stage 2  Classification      ── classifyDocument()       NEW (no extraction, no validation)
Stage 2b Reclassify          ── reclassifyDocument()     EXISTING (only when Stage 2 = Other & no filename hint)
Stage 3  Checklist selection ── CHECKLISTS[doc_type]     NEW (deterministic table)
Stage 4  Strict extraction   ── extractFields()          NEW (per-checklist field list, evidence required)
Stage 5  Rule-based validation ── runValidation()        NEW (deterministic pass/warning/fail)
Stage 6  Cross-check         ── crossCheckCriticalFields() NEW (filename ⇄ extracted ⇄ ID context)
Stage 7  Confidence gating   ── gateConfidence()         NEW (downgrade pass→warning when conf < threshold)
Stage B  Handwriting (parallel with Stage 4) ── analyzeHandwriting() EXISTING, kept
```

Stages 2, 4, B run in parallel where possible. Final assembly produces the same `extracted` object the rest of the function already writes to `validation_details`.

## Stage-by-stage changes

### Stage 1 — Filename pre-check (no change)
`parseFilename()` and `SUFFIX_TO_DOCTYPE` already exist and work. Output remains supporting context only — never overrides document content for non-identification fields.

### Stage 2 — Classification only
Replace the current monolithic `extract_document_info` first call with a small **classify-only** OpenRouter call:

- New tool schema `classify_document` with three properties:
  - `document_type` (enum = the 16 Capaciti types + Other)
  - `confidence` (0–100)
  - `classification_evidence` (exact heading / form code / letterhead / title text)
- New system prompt scoped to: "look only at headings, form codes (EEA1, TCX, IRP5, BA), letterheads (SARS, SAPS, banks, training providers), document titles, signatory blocks. Do NOT extract names or fields. Return Other only as a last resort."
- Model: `google/gemini-2.5-flash` (cheap, fast — classification is a small task).
- If confidence ≥ 70 and not Other → use this type.
- If Other and filename has docTypeHint → use the filename type.
- If Other and no filename hint → run Stage 2b reclassify (existing `reclassifyDocument`, kept; it already targets `gemini-2.5-pro`).

### Stage 3 — Checklist selection
Add a typed `CHECKLISTS` constant with one entry per document type. Each entry declares:

```ts
type ChecklistRule = {
  id: string;                     // stable id used as check name
  label: string;                  // human-readable check name
  required: boolean;              // false → emitted as "Optional - …"
  fields: string[];               // fields the AI must extract for this rule
  validator: (ctx) => RuleResult; // deterministic check (Stage 5)
};
type Checklist = {
  doc_type: string;
  fields: string[];               // union of fields needed for extraction (Stage 4)
  rules: ChecklistRule[];
};
```

Initial checklist content is taken from the existing `buildSystemPrompt` per-type sections (Certified ID, Unemployment Affidavit, EEA1, PWDS, Social Media Consent, BA, Offer Letter, FTC, Certificate of Completion, Bank Letter, TCX, CV, Capaciti Declaration, Qualification/Matric, Tax Certificate, MIE Verification, Other) — same rules, now expressed in code rather than prose.

### Stage 4 — Strict, checklist-scoped extraction
New tool schema `extract_document_fields`:

- A `critical_fields` object whose properties are **structured**:
  ```ts
  {
    candidate_name: { value, confidence, evidence_text, page_number? },
    full_name:      { value, confidence, evidence_text, page_number? },
    id_number:      { value, confidence, evidence_text, page_number? },
    date_of_birth:  { value, confidence, evidence_text, page_number? },
    stamp_date:     { value, confidence, evidence_text, page_number? },
    certification_authority: { value, confidence, evidence_text, page_number? },
  }
  ```
- A flat `extracted_info` object covering the existing UI fields (`gender`, `race`, `nationality`, `foreign_national`, `foreign_national_support_date`, `address`, `phone_number`, `email`, `employer`, `job_title`, `qualification_name`, `institution`, `issue_date`, `expiry_date`, `reference_number`, `signature_present`, `additional_notes`) — **kept identical** so the UI continues to render.
- Per-doc-type extraction prompt is built dynamically from `CHECKLISTS[doc_type].fields`, so the AI only extracts what the checklist actually needs.
- Strict prompt rules added:
  - Use only exact visible text. Do not infer.
  - Do not combine fragments unless they are part of the same labeled field.
  - If ambiguous → return `null` / empty string. Never invent.
  - For `candidate_name` / `full_name`: copy the printed/handwritten name **verbatim**. Do not add or expand middle names unless they are printed in the same labeled field.
  - Use the closest labeled field; if a value appears in two places, prefer the one with a clear label.

After parsing, the structured `critical_fields` are flattened back into the existing legacy fields so `validation_details` stays backward compatible:
- `extracted.extracted_id_number` ← `critical_fields.id_number.value`
- `extracted.extracted_info.full_name` ← `critical_fields.full_name.value`
- `extracted.extracted_info.id_number` ← `critical_fields.id_number.value`
- `extracted.extracted_info.date_of_birth` ← `critical_fields.date_of_birth.value`
- `extracted.stamp_date` ← `critical_fields.stamp_date.value`
- `extracted.certification_authority` ← `critical_fields.certification_authority.value`
- `extracted.candidate_name` ← `critical_fields.candidate_name.value`

The full `critical_fields` object is also persisted under `validation_details.critical_fields` so future UI work can use the evidence/confidence — additive, no UI change required.

### Stage 5 — Deterministic rule-based validation
New `runValidation(checklist, extracted, handwriting, settings)` walks `checklist.rules` and produces `{ name, status, detail }[]`. The model **never** decides pass/fail any more — it only supplies evidence.

Rule helpers (pure functions, in-file):

- `isThirteenDigits(s)`
- `isValidISODate(s)` / `isWithinMonths(date, months)` / `isWithinYear(date, year)`
- `signaturePresent(handwriting, label)` — reads `handwriting.signature_blocks`
- `initialsOnEveryPage(handwriting)` — reads `handwriting.initials_per_page`
- `markedNo(handwriting, "TCX Q1")` — reads `handwriting.marks`
- `filenameMatchesConvention(filenameHints, doc_type)` — emits the existing "File naming convention" warning

Each rule returns `pass` / `warning` / `fail`; required rules can fail, optional rules can only warning. Aggregate to `validation_status`:
- any required `fail` → `fail`
- else any `warning` → `warning`
- else → `pass`

This replaces the AI-supplied `checks`/`validation_status`/`issues`. The model's narrative `summary` is still used as a human-readable blurb but is not authoritative.

### Stage 6 — Cross-check critical values
New `crossCheckCriticalFields(filenameHints, criticalFields, handwriting, crossReferenceContext)` produces additional checks:

- `candidate_name` ⇄ `filenameHints.candidateName` ⇄ handwritten name → mismatch = `warning`
- `id_number` ⇄ `filenameHints.idNumber` ⇄ candidate-cross-reference ID ⇄ DOB derived from ID → mismatch = `warning` or `fail` if all three sources disagree
- `date_of_birth` ⇄ ID-derived DOB → mismatch = `fail`
- `stamp_date` ⇄ checklist's stamp rule (year for Certified ID; ≤ N months for everything else) → `fail` when out of range
- `certification_authority` present when checklist requires a Commissioner of Oaths block

Resolution rule when sources conflict: prefer the source with the highest confidence + clearest evidence; **never** silently overwrite a high-confidence extracted value with a filename guess. Filename only wins for identification when the extracted value is empty or low-confidence.

### Stage 7 — Confidence gating
New `gateConfidence(criticalFields, threshold)`:
- For each critical field, if `confidence < threshold` (default = `settings.confidence_threshold`, fallback 70) **and** the field is required by the checklist, downgrade its rule from `pass` to `warning` and append a "Needs human review" check with the evidence_text.
- Never overwrite a clearly-supported high-confidence field with a low-confidence guess from another source (filename / handwriting).

## Prompt changes (`buildSystemPrompt` and the new prompts)

- Existing `buildSystemPrompt` shrinks dramatically: it now only feeds **Stage 4** and explicitly says:
  - "The document type is already known: `<doc_type>`. Do NOT re-classify."
  - "Extract ONLY the fields listed below: `<fields from checklist>`."
  - "Use exact visible text. Do not infer. Return null if uncertain."
  - "Do not decide pass/fail. Validation is performed deterministically after extraction."
- New `CLASSIFY_SYSTEM_PROMPT` for Stage 2 (headings/codes/letterheads only, no extraction).
- The reclassify prompt already exists and is kept.
- The handwriting prompt already exists and is kept.

## Backward compatibility (UI must keep working)

`validation_details` continues to contain:
- `summary` (string)
- `checks` (array of `{ name, status, detail }`) — now produced by deterministic rules + cross-checks + handwriting + classification-evidence
- `extracted_id_number`, `stamp_date`, `stamp_date_valid`, `police_station`, `certification_authority`
- `extracted_info` (same flat shape as today)
- `ai_provider`, `ai_model`, `sa_id_validation`, `handwriting`, `handwriting_model`

Additive (new, optional):
- `validation_details.critical_fields` — structured `{ value, confidence, evidence_text, page_number? }` per critical field
- `validation_details.classification` — `{ document_type, confidence, evidence, source: "ai" | "filename" | "reclassify" }`

Nothing in `src/components/CandidateModal.tsx`, `src/components/CandidateCard.tsx`, `src/pages/SessionDetail.tsx`, or `src/lib/generateReport.ts` needs to change.

## Files modified

- `supabase/functions/process-document/index.ts` (only file touched)
- Memory: update `mem://features/validation-rules` and `mem://tech/ai-stack` to describe the new staged pipeline.

## Out of scope

- DB schema changes
- UI changes (additive `critical_fields` are written but not yet rendered — separate request)
- Assessment Tools system
- Async webhook flow stays as-is (the staged pipeline runs in sync mode; async path simply calls Stage 2 + Stage 4 inside the existing webhook handler in a follow-up if needed)

## Risks & mitigations

- **Two AI calls per document** (classify + extract) instead of one — slightly slower. Mitigation: classify uses `gemini-2.5-flash`, extract continues to use the configured model; both still run in parallel with handwriting.
- **Strict extraction may leave more fields blank.** That is the point — blank + warning is better than confidently wrong. Cross-check + handwriting reconciliation fill the gaps where evidence exists.
- **Checklist coverage** — the initial `CHECKLISTS` is a direct port of the current prose rules, so behaviour stays equivalent on day one and only gets stricter where we add deterministic checks (ID Luhn already exists and is preserved).

