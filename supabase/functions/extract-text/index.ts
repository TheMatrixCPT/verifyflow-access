import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => null);
    const imageDataUrl = body?.image_data_url;
    const fileName = typeof body?.file_name === "string" ? body.file_name : "document";

    if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
      return new Response(
        JSON.stringify({ error: "invalid_input", message: "A base64 image data URL is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!OPENROUTER_API_KEY) {
      return new Response(
        JSON.stringify({ error: "missing_key", message: "OCR is not configured — no OpenRouter API key is set." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are an OCR engine. Transcribe ALL visible text from the image, including handwritten text in any style (cursive, print, messy). Preserve labels such as 'Name:' and 'ID Number:' exactly as printed. Output only the transcribed text, no commentary. If the image contains no readable text, output nothing.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Transcribe all text from this page of "${fileName}".` },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("OCR provider error", response.status, detail.slice(0, 400));
      const message = response.status === 402
        ? "OCR could not run — OpenRouter credits are exhausted."
        : response.status === 429
        ? "OCR is rate limited right now. Please retry in a moment."
        : "The OCR service could not read this page.";
      return new Response(JSON.stringify({ error: "ocr_failed", message }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content ?? "";

    return new Response(JSON.stringify({ text: typeof text === "string" ? text : "" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("extract-text error", error);
    return new Response(
      JSON.stringify({ error: "unexpected", message: "OCR failed unexpectedly for this page." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
