import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { generateChatCompletion, GatewayError, type GeminiChatMessage } from "npm:@lovable.dev/ai-gateway@0.1.11";

interface ExtractRequest {
  fileBase64: string;
  mimeType: string;
  fileName?: string;
  questions?: string[];
}

const SYSTEM_PROMPT = `You extract assessment answer keys from a source document (PDF page images, scanned forms, slides, screenshots, or text). For each question in the document return:
- the full question text exactly as written (single line, normalized whitespace)
- the complete ordered list of answer options (do NOT include the option letter prefix like "A)" or "1." — only the answer text)
- which option is the correct answer (both the text and the zero-based index into the options array)

Rules:
- Include EVERY multiple-choice question, even if no correct answer is indicated.
- If no correct answer is explicitly indicated, return correct_option "" and correct_index -1. Never infer or guess the correct answer.
- A required-field asterisk and an empty radio button are NOT correct-answer markings.
- Read every page, preserving question order and repeated questions as separate entries.
- Preserve original casing and punctuation of options.
- Do not invent options. If you cannot read all options for a question, skip it.
- Return ALL questions you find — do not summarize or omit.`;

const TOOL = {
  type: "function" as const,
  function: {
    name: "return_answer_key",
    description: "Return the extracted assessment answer key.",
    parameters: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              options: { type: "array", items: { type: "string" } },
              correct_option: { type: "string" },
              correct_index: { type: "integer" },
            },
            required: ["question", "options", "correct_option", "correct_index"],
            additionalProperties: false,
          },
        },
      },
      required: ["questions"],
      additionalProperties: false,
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as ExtractRequest;
    if (!body?.fileBase64 || !body?.mimeType) {
      return new Response(
        JSON.stringify({ error: "fileBase64 and mimeType are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userHint = body.questions?.length
      ? `\n\nFor reference, the assessment is known to contain these question texts (try to match wording exactly when extracting):\n${body.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`
      : "";

    const isImageOrPdf =
      body.mimeType.startsWith("image/") || body.mimeType === "application/pdf";

    const content: Exclude<GeminiChatMessage["content"], string | null | undefined> = [
      {
        type: "text",
        text:
          "Extract ALL multiple-choice questions and options from EVERY page. Correct answers are optional; use -1 when unmarked." +
          userHint,
      },
    ];

    if (isImageOrPdf) {
      content.push({
        ...(body.mimeType === "application/pdf"
          ? { type: "file" as const, file: { filename: body.fileName || "assessment.pdf", file_data: `data:application/pdf;base64,${body.fileBase64}` } }
          : { type: "image_url" as const, image_url: { url: `data:${body.mimeType};base64,${body.fileBase64}` } }),
      });
    } else {
      // DOCX or text — decode and pass as text
      const decoded = atob(body.fileBase64);
      content.push({ type: "text", text: `\n\n----- DOCUMENT CONTENT -----\n${decoded}` });
    }

    const json = await generateChatCompletion({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "return_answer_key" } },
    });
    const toolCall = json?.choices?.[0]?.message?.tool_calls?.[0];
    const argsRaw = toolCall?.function?.arguments;
    if (!argsRaw) {
      return new Response(
        JSON.stringify({ error: "AI did not return a structured answer key.", raw: json }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let parsed: { questions: Array<{ question: string; options: string[]; correct_option: string; correct_index: number }> };
    try {
      parsed = typeof argsRaw === "string" ? JSON.parse(argsRaw) : argsRaw;
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "Failed to parse AI response", argsRaw }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-answer-key error", e);
    const status = e instanceof GatewayError ? e.httpStatus || 500 : 500;
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
