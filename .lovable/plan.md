# Phase 7 + 8 — Candidate-grouped export and manual resolution

Phases 1–6 (upload modes, extraction, classification, renaming, review table, ZIP re-packaging) are already live at `/processor`. This plan adds the remaining two phases additively — no existing page, route, style or Reports option changes behaviour.

## Phase 7a — Manual resolution dialog for unidentified documents

Any processed file whose candidate name is missing (or whose type fell back to `Document`) gets a "Resolve" action in the results table.

- Opens a dialog with a real preview of that file: PDF rendered to an image via the already-installed pdf.js, images shown directly, DOCX shown as its extracted text (no preview engine for Word).
- The dialog lists the candidates already identified in this batch (real extracted name + ID), plus an option to enter a new name and ID manually.
- A document-type picker uses the app's existing Capaciti type vocabulary.
- On save, the file's metadata, new filename and status are recomputed through the same Phase 4 naming engine — the row updates in place, and the file joins that candidate's group everywhere downstream (ZIP, CSV, grouped export).
- Nothing is auto-guessed here: the record only changes when a person confirms it.

Unresolved files keep a real `Unknown_Candidate_N` folder with a sequential suffix so separate unidentified people are never merged.

## Phase 7b — Candidate-grouped bulk export (both places)

Same folder structure in both locations:

```text
<Session label>/
  Thabo_Mokoena/
    Thabo_Mokoena_9701020485086_Certified_ID.pdf
    Thabo_Mokoena_9701020485086_EEA1_Form.pdf
  Unknown_Candidate_1/
    ...
```

**Document Processor page** — a new Reports dropdown on the processor page (it currently has separate buttons; the existing buttons stay and the dropdown adds "Download all candidate documents"). Packages the current in-memory batch. Session label = the batch label shown in the UI (timestamp-based), stated on screen so the user knows what they downloaded.

**Session page** — one new item, "Download All Candidate Documents", appended to the existing Reports dropdown next to "Download as PDF" and "Download as CSV". Both existing items are untouched. It downloads each candidate's stored documents from the backend bucket, grouped by the candidate records already in the session, using the session's real name as the top-level folder.

Grouping rule: files group together only when the extracted candidate name matches, with the ID number as tie-breaker for identical surnames. Manual resolutions from Phase 7a are treated as confirmed matches.

If the export runs with nothing processed (or a session with no documents), a clear message says there is nothing to export — no empty archive is produced.

## Phase 8 — Hardening pass

- Specific user-facing errors for: unsupported type, corrupt file, empty ZIP, OCR failure, no-match, premature export, and a failed backend download during session export (that file is reported, the rest still export).
- Verify the full chain on real files end-to-end in both modes, including a resolved unknown flowing into the grouped ZIP.
- Confirm no placeholder values remain and that the new route, dropdown item and components collide with nothing existing.

## Technical notes

- New files: `src/components/processor/ResolveDocumentDialog.tsx`, `src/lib/processor/grouping.ts` (grouping + session-folder ZIP builder, shared by both export entry points).
- Edited: `src/pages/DocumentProcessor.tsx` (resolve action, Reports dropdown), `src/pages/SessionDetail.tsx` (one added `DropdownMenuItem` + handler).
- Session-side export downloads documents from the existing `documents` storage bucket via signed URLs, reusing current API helpers; no schema change and no new backend function.
- Re-uses `buildNewFileName` / `statusForMetadata` from `src/lib/processor/naming.ts` so manual edits produce identical naming to the automatic path.
