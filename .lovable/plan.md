

## Update Document Validation Checklist

Expand the document validation system from the current 5 document types to the full **15-document Capaciti checklist**, each with its own specific validation rules and file naming convention. The Assessment Tools system will not be touched.

### New / Updated Document Types

The AI extractor will now classify and validate documents into one of these types:

1. Certified ID
2. Unemployment Affidavit
3. EEA1 Form
4. PWDS Confirmation of Disability
5. Social Media Consent
6. Beneficiary Agreement (BA)
7. Offer / Employment Letter
8. Employment Contract / FTC
9. Certificate of Completion
10. Bank Letter
11. TCX Unemployment Affidavit
12. CV (informational, no QA)
13. Capaciti Declaration (internal)
14. Qualification / Matric (informational, MIE handled externally)
15. Tax Certificate (payroll, no QA)
16. Other (fallback)

### Per-Document Validation Rules

Each document gets its own checklist driven by the user-supplied requirements (certification within programme year, signed/dated stamps, barcode visibility, completed fields, race/gender marks, HPCSA numbers, page-specific signatures/initials, ID/name match, bank validity, etc.). Documents marked "no QA" (CV, Bank Letter, Tax Certificate, Qualification/Matric) only run lightweight extraction checks (presence + readability) and never hard-fail the candidate.

### File Naming Validation (new)

A new generic check is added for every type: filename should match the convention `CandidateNameSurname_IDNo_<DocSuffix>` (e.g. `_BA`, `_FTC`, `_CV`, `_Bank Letter`, `_Completionoftraining`). Mismatched naming surfaces as a **warning** (not a fail) so admins can rename without blocking validation.

### Where the Changes Land

**1. `supabase/functions/process-document/index.ts`** (primary change)
- Replace the `document_type` enum in the tool schema with the 15 new types + `Other`.
- Rewrite `buildSystemPrompt` so each of the 15 types has its own `═══ N. TYPE ═══` block listing the exact checks from your spec (page numbers, fields, stamps, signatures, HPCSA numbers, programme-year stamp date, etc.).
- Add a shared "File Naming Convention" section the AI applies to every document.
- Keep the existing SA ID structural validation (Luhn, gender, citizenship) — it continues to run when an ID number is extracted.
- Keep the existing cross-reference logic (ID number must match candidate's ID document where applicable).
- Replace the "stamp within X months" check with "stamp date within the **programme year**" for Certified ID specifically (configurable months remain for other types).

**2. `src/lib/validationScore.ts` / scoring**
- No structural change — the global `(passed ÷ total) × 100` formula keeps working because each new type just produces more granular checks. "Optional" / "no-QA" checks remain prefixed `Optional -` and excluded from the failing logic.

**3. `mem://features/validation-rules`**
- Update the memory file to list all 15 document types and the new file-naming check, replacing the old "5 doc types" line.

### Out of Scope

- No DB schema migration required — `documents.document_type` is a free-text column; the enum is enforced only inside the AI tool schema.
- No UI changes to upload flow, candidate cards, or Settings (existing components already render whatever check list comes back from the edge function).
- Assessment Tools system is untouched.

### Technical Details

- The tool schema's `document_type` enum becomes the 16-value list above; the AI is forced to pick one.
- Each per-type prompt section ends with the file-naming pattern, e.g. `File naming convention: CandidateNameSurname_IDNo_BA → emit a warning check "File naming convention" if the filename does not match`.
- For PWDS the prompt explicitly asks for: specialist signature + date, type of disability, HPCSA practice + personal numbers (private) or HPCSA personal number (public), doctor contact info, doctor's stamp.
- For BA, Employment Contract, and Social Media Consent, the prompt instructs the AI to inspect specific pages (12, 13, 17 for BA; 10, 11, 12 for FTC; pages 1, 2, 4 for Social Media) and report initials on every page as a single aggregated check.
- For EEA1 the existing race + foreign-national logic stays; new checks added for "person with disability Yes/No", "employment number not required", "full name and surname displayed".
- For Bank Letter: "Valid SA bank" (compare extracted bank name against a built-in list of registered SA banks: ABSA, Standard Bank, FNB, Nedbank, Capitec, Investec, African Bank, TymeBank, Discovery Bank, Bidvest, Sasfin, Bank Zero, Access Bank), "valid account number present", "account holder identifiers match candidate".
- For TCX Affidavit: question 1 + 2 must be circled "NO"; full name structure (first, second, surname) verified against ID.
- Certificate of Completion: signed and dated by Programme Manager / Executive of IP.
- Capaciti Declaration: signed + dated only.
- "No-QA" document types (CV, Tax Certificate, Qualification/Matric, Bank Letter per spec note) emit informational checks only, all marked `Optional -` so they cannot drive the candidate to a fail status.

