# Fix document viewing and stuck "Unknown" documents

## 1. "ERR_BLOCKED_BY_CLIENT" when clicking View

This is not a backend or permissions error. The View button opens a new tab pointing straight at the storage domain, and an ad blocker / privacy extension in Chrome is blocking that request before it leaves the browser. Nothing in the app can whitelist itself from an extension.

Fix: stop navigating to the storage domain in a new tab. Instead:
- Fetch the file through the already-working storage client (the same path the Download button uses, which is not blocked), turn it into a local blob URL, and show it in an in-app viewer dialog (PDF/image inline).
- Keep a "Open in new tab / Download" fallback using the blob URL, which extensions do not block.
- Show a clear error toast if the fetch itself fails.

## 2. Why the BA document shows as "Unknown"

Checked that document in the database. Its row has:
- `validation_status = processing`
- `document_type = null`
- empty validation details

So it was never classified — the processing run for it never finished (it was uploaded during the run that hit the compute limit). The card falls back to the label "Unknown" whenever `document_type` is null. The filename parsing itself is fine: `SiposetuMazitshana_9701020485086_BA - Updated (1)` resolves the name, the 13-digit ID and the `BA` suffix to Beneficiary Agreement — it just never got that far.

There are currently 2 documents stuck in `processing`.

Fix, in two parts:
- **Recovery**: add a "Retry processing" action on documents that are stuck in `processing` (and on failed-to-classify docs), which re-invokes the processing function for that single document. Also surface these as "Processing / needs retry" instead of the misleading "Unknown".
- **Prevention**: when the processing function throws or times out, write a terminal state back to the document row (status + error note) instead of leaving it in `processing` forever, and apply the filename hints (name, ID, doc type) to the row up-front at upload time so even a failed AI run leaves the correct document type and candidate grouping rather than "Unknown".

## Technical notes

- Viewer: `src/components/CandidateModal.tsx` `handleViewDocument` — replace `window.open(signedUrl)` with `download()` → `URL.createObjectURL(blob)` rendered in a Dialog; revoke the object URL on close.
- Label fallback lives in `src/pages/SessionDetail.tsx` (`document_type || "Unknown"`) and `buildDocumentTypeLabel`.
- Filename hints are already parsed in `supabase/functions/process-document/index.ts` (`parseFilename`); persist them to the document row before the AI stages run, and wrap the AI stages so any throw sets a final status.
- Retry action calls the same `process-document` function with the existing `document_id` and file path.
