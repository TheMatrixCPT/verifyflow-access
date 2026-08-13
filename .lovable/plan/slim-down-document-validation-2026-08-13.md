# Slim down document validation

Goal: cut the number of checks run per document, and stop deep-validating document types that don't need QA. Review the proposed keep/drop lists below and tell me which lines to change before I build.

## Tier 1 — Full QA (core checks only)

These types still fail on problems, but with a shorter list.

**Certified ID** — keep: ID number readable, ID details legible, certification stamp present, stamp signed, stamp dated, stamp date within programme year, Image clarity, image clarity, stamp authority name, barcode visibility. Keep everything related to the Certified ID.

**Disable the entire Unemployment Affidavit checks (I would like to activate it at a later stage hence i am saying we need to disable it and not drop.)** — Drop: name + surname, 13-digit ID, candidate signature, sworn date, stamp present/signed/dated, stamp within validity window, "no blanks anywhere", sworn-date-vs-stamp-date match, Capaciti template match.

**Disable the entire TCX Affidavit (I would like to activate it at a later stage hence i am saying we need to disable it and not drop.)** — Drop: name + surname, 13-digit ID, Q1 marked NO, Q2 marked NO, candidate signature, date, stamp present/signed/dated, stamp validity, "all fields completed", sworn-vs-stamp date match.

**EEA1 Form** — keep: name + surname, race marked, gender marked, disability question answered, signed, dated. foreign-national supporting-date rule (extract only), employment number check. Keep everything for the EA1 form.

**Beneficiary Agreement** — keep: front page name + ID, initials on every page, final beneficiary signature + printed name, real (non-typed) signature,per-page checks for p13 and p17 as separate items, "all annexures present", ID cross-match. Keep everything related to the Beneficiary agreement.

**Disable the entire Employment Contract / FTC (I would like to activate it at a later stage hence i am saying we need to disable it and not drop.)** — Drop: cover name + ID, initials on every page, employee signature present, signature date, separate p11 / p12 checks, employer signature as its own fail, annexures, ID cross-match.

**Disable the entire PWD Disability (I would like to activate it at a later stage hence i am saying we need to disable it and not drop.)** — Drop: disability type stated, specialist signature + date, doctor stamp, HPCSA number present, contact details, private-vs-public HPCSA branching, template match.

## Tier 2 — Informational only (never fail)

Reduced to a single readability/identification check each, all prefixed "Optional -":
Bank Letter (incl. Proof of Address), CV, Qualification / Matric, Tax Certificate, Certificate of Completion, Capaciti Declaration, Offer Letter, Social Media Consent, Other.

These still get classified, extracted and shown — they just no longer produce failures.

## Cross-cutting passes

- **Handwriting (Stage B) pass**: run only for Certified ID, EEA1, Beneficiary Agreement. Skipped elsewhere — cuts AI cost per document.
- **SA ID structural validation**: run only on types where an ID number is required (Certified ID, BA). Reduce the 6 checks to 2 scored ones: 13-digit format and Luhn checksum; date of birth / gender / citizenship become extracted info, not checks.
- **File naming convention**: keep on every document, warning only (unchanged).
- **Filename-vs-content conflict checks**: keep as is.

## Technical notes

- All per-type check lists live in the system prompt inside `supabase/functions/process-document/index.ts`; Tier 1/Tier 2 rewrites happen there.
- Handwriting gating: guard the Stage B call with a doc-type allowlist in the same file.
- SA ID checks are code-side near the end of `index.ts`; trim to format + Luhn and gate by doc type.
- Scoring in `src/lib/validationScore.ts` already ignores "Optional -" warnings, so Tier 2 docs will score cleanly with no UI change.
- No database or UI changes required.