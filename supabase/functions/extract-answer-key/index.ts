import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

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
- Only include single-correct multiple-choice questions.
- If a question has no clear correct answer indicated (no tick, highlight, asterisk, key, or answer section), skip it.
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
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

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

    const content: any[] = [
      {
        type: "text",
        text:
          "Extract every multiple-choice question, its full set of options, and the correct option from the attached document." +
          userHint,
      },
    ];

    if (isImageOrPdf) {
      content.push({
        type: "image_url",
        image_url: { url: `data:${body.mimeType};base64,${body.fileBase64}` },
      });
    } else {
      // DOCX or text — decode and pass as text
      const decoded = atob(body.fileBase64);
      content.push({ type: "text", text: `\n\n----- DOCUMENT CONTENT -----\n${decoded}` });
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "return_answer_key" } },
      }),
    });

    if (aiResp.status === 429) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (aiResp.status === 402) {
      return new Response(
        JSON.stringify({ error: "Lovable AI credits exhausted. Add credits in Settings → Workspace → Usage." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      return new Response(
        JSON.stringify({ error: "AI gateway error", detail: t }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const json = await aiResp.json();
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
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
