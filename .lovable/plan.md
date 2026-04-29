## Goal

Three fixes:

1. Remove the percentage display from the candidate modal header (the screenshot shows `86%` + `Fail` badge top-right of the modal — both go away, replaced with the same passed/failed counts the card uses).
2. Make Override update the UI immediately (currently the query invalidation key doesn't match, so the user has to refresh).
3. Make the count shown on each candidate card depend on the active filter tab:
   - **All tab**: keep current behavior (`X / Y passed` plus `Z failed` line) — unchanged.
   - **Validated tab**: show only the passed-document count for that candidate (e.g. `3 passed`, green).
   - **Failed tab**: show only the failed-document count for that candidate (e.g. `2 failed`, red).

## Technical changes

### `src/components/CandidateCard.tsx`
- Add a new optional prop `filter?: "all" | "pass" | "fail"` (default `"all"`).
- Keep the existing `passedCount` / `failedCount` / `totalCount` calculation.
- Render the right-hand stat block conditionally:
  - `filter === "all"` → current two-line block (`{passed} / {total} passed` + `{failed} failed`).
  - `filter === "pass"` → single line `<span class="text-success font-bold text-2xl">{passedCount}</span> passed`.
  - `filter === "fail"` → single line `<span class="text-destructive font-bold text-2xl">{failedCount}</span> failed`.
- Empty case (`totalCount === 0`) keeps the `0 documents` fallback.

### `src/pages/SessionDetail.tsx`
- Pass the current `filter` to each `<CandidateCard … filter={filter} />`.
- No other logic changes. (Note: in `pass`/`fail` tabs, `candidate.documents` is already filtered by `getDocumentsForFilter`, so the per-card counts will naturally reflect the visible subset, which is exactly what we want.)

### `src/components/CandidateModal.tsx`
- In the `DialogHeader` right column (lines ~551–554), remove the `{candidate.score}%` and the `{cfg.label}` status badge.
- Replace with the same compact counts block used on the card:
  ```
  X / Y passed     (green numerator)
  Z failed         (red, only if Z > 0)
  ```
  Computed from `candidate.documents` using the same `overridden`-aware rule.
- Drop the now-unused `cfg` lookup in this component (or keep it if used elsewhere — currently only used here).

### Override live-refresh fix — `src/components/CandidateModal.tsx`
In `DocumentSection.handleOverride` the invalidation currently calls:
```ts
queryClient.invalidateQueries({ queryKey: ["documents"] });
queryClient.invalidateQueries({ queryKey: ["candidates"] });
```
But `SessionDetail` registers the queries as `["documents", id]` and `["candidates", id]`. React Query does prefix-match these correctly, **but** when the user clicks Override the UI doesn't appear to update because:
- `candidate` passed into the modal is a **memoized snapshot** built in `SessionDetail` (`candidatesWithDocs` → `filtered`). The modal renders `candidate.documents` from props, not from a fresh query.
- After a successful override, the modal stays open showing stale props until it's reopened.

Fix:
1. Keep the query invalidations and broaden them to ensure refetch:
   ```ts
   await Promise.all([
     queryClient.invalidateQueries({ queryKey: ["documents"] }),
     queryClient.invalidateQueries({ queryKey: ["candidates"] }),
     queryClient.invalidateQueries({ queryKey: ["session"] }),
   ]);
   ```
2. Make the modal re-render against fresh data by selecting the latest candidate from the cache in `SessionDetail`. The simplest approach: store only `selectedCandidateId` (string) in `SessionDetail` state, then derive `selectedCandidate` from `candidatesWithDocs` on every render:
   ```ts
   const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
   const selectedCandidate = useMemo(
     () => candidatesWithDocs.find(c => c.id === selectedCandidateId) ?? null,
     [candidatesWithDocs, selectedCandidateId]
   );
   ```
   Update the card click handler (`onClick={() => setSelectedCandidateId(candidate.id)}`) and the modal `onClose` (`setSelectedCandidateId(null)`).
   This way, as soon as the documents query refetches after override, the modal automatically reflects the new `overridden: true` flag — the document badge flips to "Approved (overridden)", the per-card and per-modal counts update, and tab membership updates without a manual refresh.

### Out of scope
- No DB / edge-function changes.
- No changes to `score` calculation, reports, or CSV/PDF export (they keep using `score` internally).
- No changes to `SessionCard` or the top stats bar on `SessionDetail`.

## Files to change
- `src/components/CandidateCard.tsx`
- `src/components/CandidateModal.tsx`
- `src/pages/SessionDetail.tsx`
