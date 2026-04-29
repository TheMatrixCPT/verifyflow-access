## Goal

On each candidate card (and matching modal header if applicable), replace the large percentage score (e.g. `86%`) and single status badge with **document pass/fail counts** so reviewers immediately see how many of the candidate's documents passed vs failed.

## What changes visually

Currently each card shows on the right:
```
   86%
  [Fail]
```

After the change it will show:
```
  3 / 5 passed
  2 failed
```

- `passed` count rendered in green (`text-success`)
- `failed` count rendered in red (`text-destructive`)
- If all docs pass: only show `5 / 5 passed` in green, no failed line
- If 0 docs: show `0 documents`
- "Failed" includes documents with status `fail` or `warning` that are **not overridden** (consistent with the Failed tab logic already in `SessionDetail`)
- Overridden documents count as passed

The colored left border and the bottom row (`N documents`, issues count) stay as-is, since they already convey status.

## Technical changes

### `src/components/CandidateCard.tsx`
- Remove the `{candidate.score}%` number and the single status badge from the right column.
- Replace with a small two-line stat block computed from `candidate.documents`:
  ```ts
  const passed = candidate.documents.filter(
    d => d.overridden || d.status === "pass"
  ).length;
  const failed = candidate.documents.filter(
    d => !d.overridden && (d.status === "fail" || d.status === "warning")
  ).length;
  const total = candidate.documents.length;
  ```
- Render:
  - Line 1: `<span class="text-success font-bold">{passed}</span> / {total} passed`
  - Line 2 (only when `failed > 0`): `<span class="text-destructive font-semibold">{failed}</span> failed`
- Keep the status-driven left border (`border-l-success | border-l-warning | border-l-error`) so the card still has an at-a-glance status color.
- Drop the now-unused `statusConfig.badge` / `label` references in the card body (keep the icon mapping if still needed elsewhere; otherwise simplify).

### `src/pages/SessionDetail.tsx`
- No logic changes required — `candidate.documents` is already passed in with `overridden` and `status`. The existing `effectiveStatus` helper aligns with the same rule.
- The top stats cards (`Documents X / Y`) already added in the previous change remain unchanged.

### Out of scope
- The candidate `score` field stays in the data model (still used by reports/PDF/CSV); we just stop rendering it on the card.
- No changes to `CandidateModal`, reports, or DB.
- No changes to the session list cards (`SessionCard.tsx`).

## Files to change
- `src/components/CandidateCard.tsx`
