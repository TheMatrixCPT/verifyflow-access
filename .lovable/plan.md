

## Plan: Consolidate All AI to OpenRouter

### Summary

Only **one edge function** uses AI: `process-document/index.ts`. It currently has 3 provider functions — OpenRouter (Gemini 2.5 Flash), OpenAI direct (GPT-5.4), and Lovable AI (Gemini 2.5 Flash). This plan routes everything through OpenRouter so the same models are used but billing is unified.

### Current Model Mapping

| Provider Function | Model | What It Does |
|---|---|---|
| `analyzeWithOpenRouter()` | `google/gemini-2.5-flash` | Document validation (primary) |
| `analyzeWithOpenAI()` | `gpt-5.4` | Document validation (fallback #1) |
| `analyzeWithLovableAI()` | `google/gemini-2.5-flash` | Document validation (fallback #2) |

All three do the **exact same thing** — validate a document using the same system prompt and tool schema. The only differences are API endpoint, auth header, and request format.

### Changes

**1. Refactor `supabase/functions/process-document/index.ts`**
- Remove `analyzeWithOpenAI()` function (~20 lines)
- Remove `analyzeWithLovableAI()` function (~20 lines)
- Remove `buildOpenAIResponsesInput()` helper (~55 lines) — only used by the OpenAI Responses API format
- Remove the 3-tier fallback chain (lines 600–661) — replace with single OpenRouter call
- Keep `analyzeWithOpenRouter()` as the sole provider
- If `OPENROUTER_API_KEY` is missing, return a clear error immediately (no fallbacks)
- On 402 response, return structured JSON `{ error: "credits_exhausted", message: "..." }` with status 402
- On 429 response, return structured JSON `{ error: "rate_limited", message: "..." }` with status 429
- Store `ai_model` in `validation_details` so you can see which model processed each document

**2. Add GPT-5.4 support via OpenRouter**
- Add a `model` field to the request body (optional, defaults to `google/gemini-2.5-flash`)
- When `openai/gpt-5.4` is requested, pass that model to OpenRouter instead — same API format, same billing
- This preserves the ability to use GPT-5.4 without a separate OpenAI key

**3. Update frontend error handling in `src/lib/api.ts`**
- In `uploadAndProcessFiles`, detect 402/429 responses from `process-document`
- Surface a toast: "Your OpenRouter credits have been exhausted. Please top up at openrouter.ai to continue processing." (for 402)
- Surface a toast: "Rate limit reached. Please wait a moment and try again." (for 429)

**4. Clean up Settings page (`src/pages/Settings.tsx`)**
- Remove the OpenAI, Fal, Google Vision, AWS Textract key inputs (none are used by any function)
- Simplify the API Configuration section to show OpenRouter as the active provider
- Keep the collapsible section but only show "OpenRouter (Active)" with a note about model support

**5. Simplify `manage-api-keys` edge function**
- Remove references to `openai`, `fal`, `google_vision`, `aws_textract` keys since they are no longer used
- Or remove the function entirely if no other keys need management

**6. No changes needed to `openrouter-webhook/index.ts`**
- Already OpenRouter-only, works as-is

### Technical Notes
- The `OPENROUTER_API_KEY` secret is already configured
- The `OPENAI_API_KEY` and `LOVABLE_API_KEY` secrets remain but won't be used by `process-document`
- The OpenRouter Chat Completions API format is identical for both Gemini and OpenAI models — only the `model` field changes
- Async webhook mode continues to work unchanged

