# Stop documents from being misclassified as "Other"

The screenshot shows `AmkeleYamani_9912125698081_Proof of Address.pdf` ending up as **Other**. The edge function logs confirm the root cause:

```
Filename hints for "AmkeleYamani_9912125698081_Proof of Address.pdf":
  {"docTypeHint":null, ...}
```

So no build/runtime error — the edge function ran cleanly. The bug is logic-only inside `supabase/functions/process-document/index.ts`.

## Root cause

1. **Filename suffix dictionary is too narrow.** Tokens after the ID get joined and normalized: `"Proof of Address"` → `"proofofaddress"`. That key isn't in `SUFFIX_TO_DOCTYPE`, and `matchPartialSuffix` has no entry containing `"proof"` or `"address"`, so `docTypeHint` becomes `null`. The same gap will hit `"Bank Confirmation"`, `"Police Clearance"`, `"Income Tax Certificate"` (only matches by accident on `"tax"`), `"ID Copy"`, etc.
2. **`matchPartialSuffix` is order-dependent**, not longest-match. `"taxcertificate"` matches `"tax"` first and short-circuits — fragile.
3. **No content-based fallback when AI returns "Other"** and the filename gives no hint. The "Other" verdict stands even when the document body clearly says "Proof of Residence" or has a SAPS letterhead.

## What changes (only `supabase/functions/process-document/index.ts`)

### 1. Expand `SUFFIX_TO_DOCTYPE` with real-world phrases
Add aliases observed in the logs and common admin variants. New entries:
- `proofofaddress`, `proofofresidence`, `addressproof`, `residenceproof`, `utilitybill`, `municipalbill` → **Bank Letter** *(Capaciti's existing "proof of residence/address" slot — confirmed by question 1)*
- `incometax`, `incometaxcertificate`, `sarsletter`, `taxnumberletter`, `irp5certificate` → **Tax Certificate**
- `mieconsent`, `mieverification`, `mieclearance`, `backgroundcheck` → **MIE Verification**
- `signedofferletter`, `offerofemployment`, `employmentoffer` → **Offer Letter**
- `bankstatement`, `bankconfirmation`, `bankaccountconfirmation` → **Bank Letter**
- `idcopy`, `idphoto`, `saidcopy`, `greenid`, `smartid`, `iddocument` → **Certified ID**
- `policeclearance`, `saps`, `affidavitofunemployment` → **Unemployment Affidavit**
- `matriccertificate`, `seniorcertificate`, `nsc`, `ieb` → **Qualification Matric**
- `disabilitycertificate`, `disabilityconfirmation` → **PWDS Confirmation of Disability**
- `socialmediaconsentform`, `mediaconsent`, `photographyconsent` → **Social Media Consent**
- `cvresume`, `curriculumvitae` → **CV**
- `capaciticonsent`, `capacitiagreement` → **Capaciti Declaration**
- `fixedtermcontract`, `employmentftc` → **Employment Contract FTC**
- `completioncertificate`, `trainingcompletion` → **Certificate of Completion**
- `eea1employmentequity`, `employmentequityform` → **EEA1 Form**

### 2. Replace `matchPartialSuffix` with longest-key-wins
Iterate all keys, pick the **longest** key contained in the suffix. Guarantees `"taxcertificate"` beats `"tax"`, `"capacitideclaration"` beats `"declaration"`, `"proofofaddress"` beats `"address"` should both ever exist.

### 3. Add Stage A2 — content-based reclassification
After Stage A, if **all** of these hold:
- `extracted.document_type === "Other"`
- `filenameHints.docTypeHint` is `null`

…run a focused second OpenRouter call using `google/gemini-2.5-pro` with a tight prompt:

> "You previously classified this document as Other. Re-examine ONLY the visual headings, footers, form codes (EEA1, TCX, IRP5, BA), letterheads (SARS, SAPS, banks, training providers), and title text (Affidavit, Bank Letter, Proof of Address, Curriculum Vitae, Certificate of Completion). Pick the single best match from the 16 Capaciti types. Return Other ONLY if nothing recognisable exists. Provide `classification_evidence` (the exact text relied on) and `confidence` 0-100."

Use a dedicated tool schema `reclassify_document` with `document_type` (same enum), `confidence`, `classification_evidence`. Apply the result when `confidence >= 70` AND not "Other":
- Override `extracted.document_type`
- Append check: `{ name: "Document type from content", status: "pass", detail: "Re-classified as <type> based on: <evidence>" }`

If reclassify still says "Other" with high confidence, append a `warning` check `"No recognisable Capaciti document headings or form codes found"` so admins can see the AI looked.

### 4. Tighten the Stage A system prompt
Add one paragraph in `buildSystemPrompt`:

> "Choose `Other` ONLY as a last resort. Before picking `Other`, scan for: (a) form codes (EEA1, TCX, IRP5, BA); (b) letterheads (SARS, SAPS, banks); (c) titles ("Affidavit", "Bank Letter", "Proof of Address/Residence", "Certificate of Completion", "Curriculum Vitae"); (d) signatory blocks ("Commissioner of Oaths"). If any point to one of the 16 Capaciti types, pick that type even when the filename gives no hint."

### Resulting hierarchy
```
Filename suffix (Stage A1)  ▶  Stage A AI  ▶  Stage A2 reclassify (if Other & no hint)  ▶  Stage B handwriting
```
Filename still wins for **name & ID**. Doc type now has a content-based safety net before falling back to "Other".

## Out of scope
- Assessment Tools system (untouched)
- DB schema (no migration; results stay in existing `validation_details` JSON)
- UI changes (the new check renders automatically in the existing checks list)

## Files modified
- `supabase/functions/process-document/index.ts`
- `mem://features/validation-rules` — note expanded mapping & Stage A2 rule
- `mem://tech/ai-stack` — note Stage A2 uses `google/gemini-2.5-pro`

## One clarifying question

Capaciti's 16-type list does not contain a literal "Proof of Address" type. I'll ask which existing type these proof-of-residence documents should map to so the alias table is correct.
