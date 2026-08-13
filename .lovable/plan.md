# Slim down document validation

Goal: cut the number of checks run per document, and stop deep-validating document types that don't need QA. Review the proposed keep/drop lists below and tell me which lines to change before I build.

## Tier 1 — Full QA (core checks only)

These types still fail on problems, but with a shorter list.

**Certified ID** — keep: ID number readable, ID details legible, certification stamp present, stamp signed, stamp dated, stamp date within programme year.
Drop: image clarity, stamp authority name, barcode visibility (still extracted, not scored).

**Unemployment Affidavit** — keep: name + surname, 13-digit ID, candidate signature, sworn date, stamp present/signed/dated, stamp within validity window.
Drop: "no blanks anywhere", sworn-date-vs-stamp-date match, Capaciti template match.

**TCX Affidavit** — keep: name + surname, 13-digit ID, Q1 marked NO, Q2 marked NO, candidate signature, date, stamp present/signed/dated, stamp validity.
Drop: "all fields completed", sworn-vs-stamp date match.

**EEA1 Form** — keep: name + surname, race marked, gender marked, disability question answered, signed, dated.
Drop: foreign-national supporting-date rule (extract only), employment number check.

**Beneficiary Agreement** — keep: front page name + ID, initials on every page, final beneficiary signature + printed name, real (non-typed) signature.
Drop: per-page checks for p13 and p17 as separate items, "all annexures present", ID cross-match.

**Employment Contract / FTC** — keep: cover name + ID, initials on every page, employee signature present, signature date.
Drop: separate p11 / p12 checks, employer signature as its own fail, annexures, ID cross-match.

**PWD Disability** — keep: disability type stated, specialist signature + date, doctor stamp, HPCSA number present.
Drop: contact details, private-vs-public HPCSA branching, template match.

## Tier 2 — Informational only (never fail)

Reduced to a single readability/identification check each, all prefixed "Optional -":
Bank Letter (incl. Proof of Address), CV, Qualification / Matric, Tax Certificate, Certificate of Completion, Capaciti Declaration, Offer Letter, Social Media Consent, Other.

These still get classified, extracted and shown — they just no longer produce failures.

## Cross-cutting passes

- **Handwriting (Stage B) pass**: run only for Certified ID, Unemployment Affidavit, TCX, EEA1, PWD, Beneficiary Agreement, FTC. Skipped elsewhere — cuts AI cost per document.
- **SA ID structural validation**: run only on types where an ID number is required (Certified ID, affidavits, TCX, BA, FTC). Reduce the 6 checks to 2 scored ones: 13-digit format and Luhn checksum; date of birth / gender / citizenship become extracted info, not checks.
- **File naming convention**: keep on every document, warning only (unchanged).
- **Filename-vs-content conflict checks**: keep (they drive classification), but report as a single informational check instead of several.

## Technical notes

- All per-type check lists live in the system prompt inside `supabase/functions/process-document/index.ts`; Tier 1/Tier 2 rewrites happen there.
- Handwriting gating: guard the Stage B call with a doc-type allowlist in the same file.
- SA ID checks are code-side near the end of `index.ts`; trim to format + Luhn and gate by doc type.
- Scoring in `src/lib/validationScore.ts` already ignores "Optional -" warnings, so Tier 2 docs will score cleanly with no UI change.
- No database or UI changes required.
