# Document Processor — bulk extract, classify and rename

A new additive feature on the document validation side: upload individual files or a ZIP, extract real text, classify the document, generate a standardised filename, review the results, and download — then optionally push the renamed files into a validation session so the existing AI checks run on them.

Nothing existing changes: current upload flow, sessions, candidates, validation and assessment pages keep working exactly as they are.

## Decisions locked in
- Integrated with sessions: after review, files can be committed into a validation session and run through the existing `process-document` pipeline.
- Hybrid extraction: browser-first (native PDF text, DOCX, ZIP). AI vision fallback only when a file yields no usable text.
- Document types use the app's existing Capaciti vocabulary (Beneficiary Agreement, Certified ID, EEA1 Form, etc.), with the spec's keyword groups mapped onto them.

## Phase 1 — Upload intake and mode selection
- New route `/processor` plus a nav entry, using the existing Header/`vf-card` layout.
- Mode switch: **Individual Files** (multi-select / drag-drop of PDF, DOCX, JPG, PNG, TIF) and **Folder (ZIP)** (single archive, nested folders supported). The switch changes real behaviour, not just labels.
- Client validation: unsupported extension, zero-byte file, or unreadable ZIP each produce a specific inline error.
- Files are held in memory for the session (no permanent storage until the user commits to a session), and a real list of accepted files with name and type is shown.

## Phase 2 — Text extraction
- PDF: native text via pdf.js. If the extracted text is below a usable threshold, the page is rendered to an image and sent to the AI vision fallback (OCR).
- DOCX: body text via mammoth.
- JPG/PNG/TIF: straight to the AI vision fallback.
- Each file carries its real text, its source filename, and which method was used (native / docx / ocr).
- A file that yields nothing is marked `Extraction Failed` and the batch continues.

## Phase 3 — Pattern matching and classification
- Name: labelled patterns (`Name:`, `Full Name:`, `Candidate:`, `I, [Name]`), then a capitalised-sequence heuristic near the top of the document.
- ID: 13-digit SA ID pattern, or a value following `ID Number:` / `Identity No:`, validated with the existing SA ID helpers.
- Type: the spec's keyword groups, mapped to existing type names with a fixed priority order, e.g. BA/BEE → Beneficiary Agreement, Identity Document/ID Card/Passport → Certified ID, EEA1/Employment Equity → EEA1 Form, Criminal Record/Police Clearance → Criminal Record Affidavit, Cellphone/Affidavit → Cellphone Affidavit, Completion Certificate → Completion Certificate, Qualification/Degree/Diploma → Qualification, and so on. No match → `Document`.
- The existing filename parser runs too; filename hints win on conflict, matching the current pipeline's rule. Nothing is fabricated — every field records where it came from.

## Phase 4 — Naming rule engine
- Output: `[Name]_[ID]_[Type].[original extension]`, sanitised to underscores.
- Missing name → `Unknown_Name`; missing ID → `Unknown_ID`; per-file only, never blocking the batch.
- Collisions get a numeric suffix.
- A per-file mapping record is kept: original name → metadata → new name → status.

## Phase 5 — Review interface and downloads
- Real progress bar driven by files completed / total.
- Results table: Original Name, Extracted Name, New Name, Status (`Renamed Successfully`, `Partial Match (Missing ID)`, `Partial Match (Missing Name)`, `Extraction Failed`).
- Per-row download under the new filename, plus **Download All as ZIP** for successful files. Failed files stay visible and are excluded from the ZIP.

## Phase 6 — ZIP mode
- Archive is unpacked in the browser, every supported file enumerated at any nesting depth, unsupported entries recorded as skipped.
- The same Phase 2–4 engine runs — one shared code path, no duplication.
- Re-packaged output ZIP with the new filenames, plus a real summary: files found / renamed / failed / skipped.

## Phase 7 — Session hand-off and hardening
- **Send to validation session**: pick an existing session or create one; renamed files upload to the `documents` bucket under their new names and go through the existing `process-document` invocation, so candidate grouping and the current validation checks apply unchanged.
- Specific user-facing errors for unsupported type, corrupt file, empty ZIP, OCR failure, and no-match.
- Verify no route, component or style collides with existing ones, and no placeholder data survives anywhere in the feature.

## Technical notes
- New deps: `pdfjs-dist`, `mammoth`. `jszip` is already installed.
- New files: `src/pages/DocumentProcessor.tsx`, `src/components/processor/*`, `src/lib/processor/{extract,classify,naming,zip}.ts`. Route added in `src/App.tsx` behind the existing `ProtectedRoute`; nav link in `src/components/Header.tsx`.
- Classification keyword map lives next to the edge function's `SUFFIX_TO_DOCTYPE` vocabulary so both stay consistent.
- OCR fallback: a small `extract-text` edge function that takes a page image and returns text via the existing OpenRouter vision model — called only for files with no usable native text, keeping credit use and compute low.
- Session hand-off reuses `src/lib/api.ts` upload helpers rather than a new upload path.
