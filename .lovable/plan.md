

## Diagnosis: Preview Failure

After reviewing all source files, imports, exports, types, and configurations, **there are no build-breaking or syntax errors** in the codebase. The console log shows `[vite] server connection lost. Polling for restart...` which indicates a temporary dev server restart — this is the most likely cause of the preview appearing to fail.

However, there are **two runtime warnings** that should be fixed to improve stability:

### Issue 1: Missing `DialogDescription` in Alert Dialogs
The console shows repeated `Warning: Missing Description or aria-describedby` for `DialogContent`. This comes from the `CandidateModal` component which uses `DialogContent` without a `DialogDescription`. While not a crash, it generates console noise and could cause accessibility issues.

**Fix:** Add a visually hidden `DialogDescription` to `CandidateModal.tsx`.

### Issue 2: Header Component Ref Warning
The Settings page renders `<Header />` but something upstream tries to pass a ref to it. `Header` is a plain function component without `forwardRef`, causing the warning `Function components cannot be given refs`.

**Fix:** Wrap `Header` in `React.forwardRef` so it can accept refs gracefully.

---

### Implementation Steps

1. **CandidateModal.tsx** — Import `DialogDescription` from the dialog component and add it with a `sr-only` class after `DialogHeader` so it satisfies the accessibility requirement without being visible.

2. **Header.tsx** — Wrap the component in `React.forwardRef` to suppress the ref warning.

Both changes are non-breaking and address the only warnings present in the application.

