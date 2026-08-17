# Certified ID validation — real 5-rule check

Scope: documents classified as **Certified ID** only. No changes to upload, extraction, classification, renaming, downloads or reporting for any other type. Every result comes from the actual document — no sample outcomes, no defaults.

## The five checks

Each produces Pass / Fail / Not applicable, and a Fail always carries its own specific reason.

1. **Stamp date within programme year** — read the certification stamp date from the document and compare it only against the current calendar year. Anywhere inside that year = Pass. The ID's own issue date is never used for this check; it is extracted and displayed separately as information only.
2. **Stamp signed and dated** — evaluated as two distinct outcomes so the reason is exact: "Stamp not signed" or "Stamp not dated" (or both), never one generic message.
3. **Barcode visible on both sides** — only applies when the document is a card-type ID. Book-type ID or passport returns "Not applicable", never a fail.
4. **Legibility and 13-digit ID number** — separate reasons: "ID number not legible", "13-digit ID number not found", or "Personal details not legible".
5. **Filename consistency** — the generated `Name_Surname_IDNo_Type` filename must match the name and ID actually extracted from the document content. Mismatch fails with the specific field that differs.

**Overall result**: Fail only if at least one of the five genuinely failed on this document. Not-applicable checks never cause a fail. A missing or unreadable stamp date is reported as its own honest failure reason, not as "outside programme year".

## Fixing the wrong-fail bug

The current prompt lets the model infer the stamp date rule on its own, so an ID issue date can leak into the comparison. The stamp date comparison moves out of the model's judgement: the model only reports the stamp date it can literally read (and separately the ID issue date). The year comparison is then computed in code from that reported stamp date, and that computed answer is the final result for check 1 — any conflicting model verdict is discarded, not merged.

## Where it appears

**Document Processor (`/processor`)** — a new "Validation" column next to Status, showing an overall Pass / Fail / Not run pill for Certified ID rows. Clicking it opens a breakdown of the five checks with each result and reason. All existing columns (Original name, New name, Detected, Status, Action) stay exactly as they are; other document types show a dash.

**Validation session view** — the same five checks flow through the existing per-document check list in the candidate modal, so the session page and the existing PDF/CSV reports pick them up with no structural change.

## Technical notes

- `supabase/functions/process-document/index.ts`: rewrite the Certified ID block of the system prompt to emit raw observations (`stamp_date`, `id_issue_date`, `stamp_signature_present`, `stamp_date_present`, `id_format` card/book/passport, `barcode_front`, `barcode_back`, legibility flags) instead of a pre-judged verdict. Add a `buildCertifiedIdChecks()` helper that turns those observations plus the filename/extracted-content comparison into the five checks and the overall status; it overwrites any model-supplied Certified ID checks. Programme year = `new Date().getFullYear()` on the server, applied only to `stamp_date`.
- New shared module `src/lib/processor/certifiedId.ts` holding the same rule evaluation for the client-side processor, fed by the existing extraction text plus a Certified-ID-only call to the existing `extract-text` function for the stamp/barcode observations (no new edge function).
- `src/lib/processor/types.ts`: add an optional `validation` field to `ProcessedFileRecord`; absent for non-Certified-ID rows.
- `src/pages/DocumentProcessor.tsx`: add the Validation column and breakdown popover.
- No database or settings changes.

## Verification

Run a real Certified ID whose stamp date falls in the current year and confirm check 1 reports Pass, that the ID issue date is shown as information only, and that the overall result is Pass when the other four checks pass.
