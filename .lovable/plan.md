# Goal

Improve the AI's robustness when reading handwritten documents so it correctly handles the wide variety of real-world handwriting: cursive vs print, mixed scripts, slanted/messy writing, varied signature styles (full signatures, scribbles, stylized marks), and initials in different forms (block letters, monograms, joined cursive).

This is a prompt-only change — no schema, DB, or UI changes needed.

# Technical changes

### `supabase/functions/process-document/index.ts`

**1. `HANDWRITING_SYSTEM_PROMPT` (around line 756)** — extend the rules so the HTR pass explicitly accounts for handwriting variability:

- Add an explicit instruction that handwriting may appear in many styles: block print (UPPERCASE), lowercase print, cursive/joined, mixed cursive+print, slanted/italic, neat or messy, written with pen, pencil, or marker in any color.
- Instruct the model to normalize each transcription to the intended characters regardless of style — don't lower confidence purely because the script style is unusual; only lower it when characters are genuinely ambiguous.
- For **signatures**: accept ALL signature forms as valid pen marks — full legible names, partial names, stylized scribbles, looped flourishes, single-stroke marks, monograms, or marks that don't resemble the printed name. A signature does NOT need to be readable to count as present; mark `signature_present = true` whenever any deliberate handwritten ink mark sits in the signature line/box. Only mark absent when the signature area is clearly empty.
- For **initials**: accept initials written as separated block letters (e.g. "J.S."), joined cursive monograms, overlapping letters, single-letter shorthand, or stylized marks. Treat any deliberate handwritten mark in an initials box/margin as initials present, even if the exact letters are not decipherable.
- Clarify that `field_confidences` should reflect *character-level* legibility, not stylistic neatness — a clean cursive signature is high confidence even if not transcribable to a name.

**2. Main extraction prompt — `textPrompt` (around line 595)** — add one short sentence reminding the model to consider that handwritten content may appear in many fonts, scripts and styles (cursive, print, mixed, stylized signatures and initials), and to validate signature/initial presence based on the existence of a deliberate pen mark rather than legibility.

**3. `analyzeHandwriting` user message (lines 782, 786)** — append a brief reminder to the per-call user prompt: "Account for varied handwriting styles, cursive and print scripts, and stylized signatures and initials."

# Out of scope

- No changes to `handwritingToolSchema` (the structured fields already capture what we need).
- No changes to `reconcileHandwriting` logic.
- No frontend, DB, or migration changes.
- No model swap — `google/gemini-2.5-pro` already supports diverse handwriting well; this is a prompting refinement.

# Files to change

- `supabase/functions/process-document/index.ts`
