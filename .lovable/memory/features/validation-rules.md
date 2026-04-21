---
name: Validation Rules
description: 15 Capaciti document types with per-type checks, file naming convention, SA ID structural checks, programme-year stamp rule, and score formula.
type: feature
---

# Document Validation Rules

## Supported Document Types (16 total, 15 + Other)
1. Certified ID
2. Unemployment Affidavit
3. EEA1 Form
4. PWDS Confirmation of Disability
5. Social Media Consent
6. Beneficiary Agreement (BA)
7. Offer Letter
8. Employment Contract FTC
9. Certificate of Completion
10. Bank Letter (no QA — informational only)
11. TCX Unemployment Affidavit
12. CV (no QA — informational only)
13. Capaciti Declaration (internal)
14. Qualification Matric (no QA — MIE handled externally)
15. Tax Certificate (no QA — payroll only)
16. Other (fallback)

## File Naming Convention (every document)
Pattern: `CandidateNameSurname_IDNo_<DocSuffix>` (e.g. `_BA`, `_FTC`, `_CV`, `_Bank Letter`, `_Completionoftraining`, `_PWD`, `_Declaration`, `_Tax number`, `_Matric`, `_Qualification`, `_Offerletter`, `_Social Media Consent`, `_EEA1 Form`).
Mismatch → emits a single "File naming convention" check with status `warning` (NEVER fail).

## Per-Type Highlights
- **Certified ID**: stamp date must be within the current PROGRAMME YEAR (not the generic month window). Barcode check is "Optional - " for book IDs.
- **PWDS**: HPCSA practice + personal numbers (private practice) OR HPCSA personal number (public clinic). Specialist signature, doctor stamp, contact info, type of disability all required.
- **BA**: front-page name/surname/13-digit ID; initials on every page; specific signatures on pages 12, 13, 17; typed-name "signatures" fail.
- **Employment Contract / FTC**: front cover identity; initials every page; signatures on page 10; Schedule 1 page 11 complete; page 12 signed and dated.
- **Social Media Consent**: page 1 candidate-completed; page 2 graduate signature+date+name; host-partner signature and page 4 may be blank → "Optional - " warnings.
- **EEA1**: race + gender + person-with-disability (Yes/No) + foreign-national (Yes requires acquired/residence/permit date). Employment number is "Optional -".
- **TCX Affidavit**: question 1 AND question 2 must be circled NO; first/second/surname must match ID; standard stamp+signed/sworn date correspondence.
- **Certificate of Completion**: signed + dated by Programme Manager or Executive of IP.
- **Capaciti Declaration**: signed + dated by candidate only.
- **Bank Letter**: SA bank name compared against ABSA, Standard Bank, FNB, Nedbank, Capitec, Investec, African Bank, TymeBank, Discovery Bank, Bidvest, Sasfin, Bank Zero, Access Bank. All checks "Optional - ".
- **No-QA types** (CV, Bank Letter, Tax Certificate, Qualification/Matric): all checks prefixed "Optional - " and never drive a fail.

## SA ID Structural Validation (runs whenever a 13-digit ID is extracted)
Length, date of birth (YYMMDD), gender sequence, gender cross-check vs extracted gender, citizenship indicator (0 SA / 1 PR), Luhn checksum.

## Cross-Reference
When the candidate has an uploaded Certified ID document, its extracted ID number is passed as context so other documents (Affidavit, BA, FTC, TCX) can verify the ID matches.

## Scoring
`score = round((passed checks ÷ scoring checks) × 100)`.
"Optional - ..." warning checks are excluded from the denominator (see `src/lib/validationScore.ts`). Stamp/certification/police-station/commissioner warnings are also excluded.
