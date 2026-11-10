export interface ExtractedQuestion {
  question: string;
  options: string[];
  correctOption: string;
  /** -1 means the source does not identify a correct answer. */
  correctIndex: number;
}

/** Parse numbered Microsoft Forms questions from position-ordered PDF text. */
export function parseQuestionDocument(text: string): ExtractedQuestion[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const result: ExtractedQuestion[] = [];
  let questionLines: string[] = [];
  let options: string[] = [];
  let readingQuestion = false;
  const flush = () => {
    if (!questionLines.length || options.length < 2) return;
    const correctIndex = options.findIndex((option) => /\(correct\)/i.test(option));
    result.push({ question: questionLines.join(" ").replace(/\s*\*?\s*\(\s*[\d.]+\s*points?\s*\)\s*$/i, "").trim(),
      options: [...options], correctIndex, correctOption: correctIndex >= 0 ? options[correctIndex] : "" });
  };
  for (const line of lines) {
    const start = line.match(/^\d+\.\s+(.+)/);
    if (start) {
      flush();
      questionLines = [start[1]];
      options = [];
      readingQuestion = !/\(\s*[\d.]+\s*points?\s*\)\s*$/i.test(line);
    } else if (readingQuestion) {
      questionLines.push(line);
      if (/\(\s*[\d.]+\s*points?\s*\)\s*$/i.test(line)) readingQuestion = false;
    } else if (questionLines.length) {
      if (/^(This content is neither|Microsoft Forms)/i.test(line)) break;
      options.push(line);
    }
  }
  flush();
  return result;
}

export async function readQuestionPdf(file: File): Promise<ExtractedQuestion[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  try {
    let text = "";
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items.filter((item) => "str" in item)
        .sort((a, b) => Math.abs(a.transform[5] - b.transform[5]) > 3
          ? b.transform[5] - a.transform[5] : a.transform[4] - b.transform[4]);
      let lastY: number | null = null;
      for (const item of items) {
        const y = item.transform[5];
        text += lastY !== null && Math.abs(y - lastY) <= 3 ? " " : "\n";
        text += item.str;
        lastY = y;
      }
      text += "\n";
    }
    return parseQuestionDocument(text);
  } finally {
    await document.destroy();
  }
}