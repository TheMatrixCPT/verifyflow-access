// Phase 2 — real text extraction. Browser-first, AI vision fallback for scans.
import { supabase } from "@/integrations/supabase/client";
import type { ExtractionResult, StagedFile } from "./types";
import { getExtension } from "./types";

// Below this many characters we treat a PDF as a scan and fall back to OCR.
const USABLE_TEXT_THRESHOLD = 40;
const MAX_OCR_PAGES = 2;

async function getPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read file bytes"));
    reader.readAsDataURL(blob);
  });
}

/** Sends one page image to the extract-text edge function (OpenRouter vision OCR). */
async function ocrImage(dataUrl: string, fileName: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("extract-text", {
    body: { image_data_url: dataUrl, file_name: fileName },
  });
  if (error) throw new Error(error.message || "OCR service unavailable");
  if (data?.error) throw new Error(data.message || data.error);
  return typeof data?.text === "string" ? data.text : "";
}

async function extractPdf(file: File): Promise<ExtractionResult> {
  const pdfjs = await getPdfjs();
  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;

  let nativeText = "";
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    nativeText += content.items.map((item) => ("str" in item ? item.str : "")).join(" ") + "\n";
  }

  if (nativeText.trim().length >= USABLE_TEXT_THRESHOLD) {
    return { text: nativeText.trim(), method: "pdf-native" };
  }

  // Scanned document — render pages and OCR them.
  let ocrText = "";
  const pageCount = Math.min(doc.numPages, MAX_OCR_PAGES);
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.6 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Browser could not render this PDF page for OCR");
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) continue;
    ocrText += (await ocrImage(await blobToDataUrl(blob), `${file.name}#p${pageNumber}`)) + "\n";
  }

  if (!ocrText.trim()) {
    return { text: "", method: "pdf-ocr", error: "No readable text found — the scan may be blank or unreadable." };
  }
  return { text: ocrText.trim(), method: "pdf-ocr" };
}

async function extractDocx(file: File): Promise<ExtractionResult> {
  const mammoth = await import("mammoth/mammoth.browser");
  const arrayBuffer = await file.arrayBuffer();
  const result = await (mammoth as any).extractRawText({ arrayBuffer });
  const text = (result?.value || "").trim();
  if (!text) return { text: "", method: "docx", error: "The Word document contains no readable text." };
  return { text, method: "docx" };
}

async function extractImage(file: File): Promise<ExtractionResult> {
  const dataUrl = await blobToDataUrl(file);
  const text = (await ocrImage(dataUrl, file.name)).trim();
  if (!text) return { text: "", method: "image-ocr", error: "OCR found no readable text in this image." };
  return { text, method: "image-ocr" };
}

export async function extractText(staged: StagedFile): Promise<ExtractionResult> {
  const extension = getExtension(staged.file.name) || staged.extension;
  try {
    if (staged.file.size === 0) {
      return { text: "", method: "none", error: "File is empty (0 bytes)." };
    }
    if (extension === "pdf") return await extractPdf(staged.file);
    if (extension === "docx") return await extractDocx(staged.file);
    if (["jpg", "jpeg", "png", "tif", "tiff"].includes(extension)) return await extractImage(staged.file);
    return { text: "", method: "none", error: `Unsupported file type ".${extension}".` };
  } catch (error) {
    return {
      text: "",
      method: "none",
      error: error instanceof Error ? error.message : "Extraction failed for an unknown reason.",
    };
  }
}
