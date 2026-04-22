

## Fix Report PDF: Question Cut-off & "Your Answer" Overlap

Two layout fixes to the assessment results report (`src/lib/generateAssessmentPdfs.ts`). The certificate, header, footer, summary card, and Assessment Tools data flow are not touched.

### Problems Today

1. **Questions get visually cut off / collide with the answer pill** — line-height (`5.5mm`) used in the height calc is tight for 11pt bold text, and there's only 2mm of vertical padding before the answer pill, so descenders of long wrapped questions overlap the pill above.
2. **"Your answer" label overlaps the selected answer text** — the answer text wraps at `usableW - 30` (only 30mm reserved), while the right-aligned "Your answer" label at 9pt bold is ~18mm wide and sits flush at `usableW - 3`, leaving zero horizontal gap and overlapping multi-line answers.

### Fix

**1. Move "Your answer" label OUT of the pill, above it (right-aligned)**
- Render "Your answer" as a small purple caption on its own line, right-aligned, just above the pill.
- The pill itself becomes a clean full-width row with bullet + answer text only — no collision possible regardless of answer length.
- This also looks more like a proper "label → value" pattern.

**2. Give the answer text the full pill width**
- Change wrap width from `usableW - 30` → `usableW - 16` (just bullet + padding reserved).
- Long answers now use the entire pill width and wrap cleanly across multiple lines.

**3. Fix question text height & spacing**
- Increase question line-height from `5.5` → `6.2` so 11pt bold text never clips its descenders.
- Increase gap between question and answer pill from `2` → `5`.
- Increase gap between question blocks from `5` → `7`.
- Increase pill internal vertical padding (height `lines * 5 + 3` → `lines * 5.4 + 5`) and shift text baseline down slightly so multi-line answers breathe.

**4. Recompute `blockH`** with the new constants so page-break detection stays accurate (no question gets orphaned at the bottom of a page).

### Out of Scope
- Certificate PDF — unchanged.
- Report header, footer, summary card, PASS/FAIL badge — unchanged.
- Assessment parsing, scoring, candidate flow, Document Validation system — all untouched.

### Technical Details
- Constants updated inside the `respondent.answers.forEach` loop in `generateReport`.
- "Your answer" label drawn at `marginX + usableW`, right-aligned, font 9pt bold purple, on a dedicated `y` line (~4mm tall) before the pill is drawn.
- Pill height formula: `lines.length * 5.4 + 5` (was `lines.length * 5 + 3`).
- Answer text baseline inside pill: `y + 4.2` (was `y + 3.5`) for better vertical centering.
- Question wrap stays at `usableW`; only the line-height multiplier changes.
- All changes are additive to vertical layout — no horizontal layout shift, no color/font/branding changes.

