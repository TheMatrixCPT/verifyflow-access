## Goal

Restructure the SessionDetail page filtering, stats, and document actions so reviewers think in **documents passed vs failed** (not percentages), warnings are treated as failures requiring action, and individual warning documents can be manually overridden into the validated bucket.

---

## Scope of changes

### 1. Treat "warning" as "fail" in the Filter tabs

In `src/pages/SessionDetail.tsx`, the `getDocumentsForFilter` helper currently filters strictly by `status === filter`. Update it so:

- **All** tab → shows everything (unchanged).
- **Validated** tab → shows only documents with status `pass` (or `pass` after override — see #3).
- **Failed** tab → shows documents with status `fail` **or** `warning`.

The candidate-level `visibleStatus` derivation already collapses warnings into a non-pass bucket, so candidates surfaced under Failed will correctly include warning-only candidates.

### 2. Replace the "Pass Rate %" stat with a document count visualization

Today the third stat card shows `stats.complete%` (pass rate from checks). Replace that card so it shows **document counts** that adapt to the active filter, mirroring the user's spec.

New stat card: **Documents** — shows a fraction `X / Y` where `Y` is the total documents in view and `X` is the count relevant to the active tab:

| Active filter | Display | Color of numerator | Color of denominator |
|---|---|---|---|
| All | `passed / total` (e.g. `10 / 20`) | green if ≥1 pass else neutral | red if any fail/warning else green |
| Validated | `validated / total` (e.g. `12 / 20`) | green | neutral |
| Failed | `failed / total` (e.g. `8 / 20`) | red | neutral |

Counts are computed from the **document** array (not candidates), using:
- `passedDocs = documents.filter(d => d.status === "pass" || d.overridden === true)`
- `failedDocs = documents.filter(d => (d.status === "fail" || d.status === "warning") && !d.overridden)`
- `totalDocs = documents.length`

The other three stat cards (Candidates, Validated candidates, Issues) remain.

### 3. Override action on warning documents

Allow the reviewer to manually approve a `warning` document so it counts as validated.

**Backend (migration):**
- Add nullable column `documents.overridden boolean default false`.
- Add nullable column `documents.overridden_at timestamptz`.
- No RLS changes needed (existing "Anyone can update" policy already allows updates; this app is auth-free per project memory).

**API (`src/lib/api.ts`):**
- Add `overrideDocument(documentId: string)` which updates `overridden=true`, `overridden_at=now()`, and sets `validation_status='pass'` so existing aggregations and the Validated filter pick it up automatically.

**UI (`src/components/CandidateModal.tsx` → `DocumentSection`):**
- When `doc.status === "warning"` and not yet overridden, render a new **Override** action button next to "View" / "Download". Use the `ShieldCheck` icon (already imported) with label "Override" and a tooltip "Approve this document".
- Clicking it opens a themed `AlertDialog` (per memory rule: never browser alerts) confirming "Approve this document despite warnings? It will be moved to Validated."
- On confirm, call `overrideDocument`, invalidate the `documents` query, and toast "Document approved".
- After override, show a small green "Approved (overridden)" pill instead of the warning badge.

**Type updates:**
- Extend `DocumentData` in `CandidateCard.tsx` with `overridden?: boolean`.
- Map it through in `SessionDetail.tsx` candidate building (`overridden: d.overridden ?? false`).

### 4. Status rollups

Update `candidatesWithDocs` and `filtered` in `SessionDetail.tsx` so a document with `overridden === true` is treated as `pass` when computing:
- candidate `status`
- `visibleStatus`
- the new Documents stat counts

Centralize this with a small helper `effectiveStatus(doc)` returning `"pass"` if overridden, else `doc.status`.

---

## Technical notes

- `SessionCard.tsx` currently maps statuses (`complete | in-progress | has-issues`); no change required — session-level status is unaffected.
- `validationScore.ts` (per-check scoring) is unchanged; we are only changing how stats are *displayed*, not how individual document scores are computed.
- The CSV/PDF report generators read from `candidatesWithDocs` and remain functional; overridden docs naturally appear as `pass`.

## Files to change

- `src/pages/SessionDetail.tsx` — filter logic, stats card, status helper, query mapping
- `src/components/CandidateCard.tsx` — add `overridden` field to `DocumentData`
- `src/components/CandidateModal.tsx` — Override button + confirm dialog in `DocumentSection`
- `src/lib/api.ts` — add `overrideDocument`
- New migration — add `overridden`, `overridden_at` columns to `documents`

## Out of scope

- No changes to the AI processing pipeline, scoring formula, or report templates.
- No undo-override flow (can be added later if needed).
