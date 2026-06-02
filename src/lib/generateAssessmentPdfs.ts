import jsPDF from "jspdf";
import { format } from "date-fns";
import type { Respondent } from "./assessmentParser";

// CAPACITI palette (from template)
const NAVY: [number, number, number] = [27, 27, 92];        // deep indigo navy
const CORAL: [number, number, number] = [240, 78, 90];      // red/coral
const PURPLE: [number, number, number] = [99, 84, 230];     // electric purple
const INK: [number, number, number] = [30, 30, 50];
const MUTED: [number, number, number] = [120, 124, 145];
const LIGHT_GRAY: [number, number, number] = [243, 243, 247];
const LIGHT_PURPLE_BG: [number, number, number] = [238, 235, 252];
const SUCCESS: [number, number, number] = [34, 139, 88];
const SUCCESS_BG: [number, number, number] = [223, 244, 232];
const FAIL_BG: [number, number, number] = [253, 226, 226];

interface CertificateOptions {
  respondent: Respondent;
  assessmentTitle: string;
  assessmentDate: string;
}

/** Set fill opacity (silently no-op if unsupported). */
function setOpacity(doc: jsPDF, opacity: number) {
  try {
    const G = doc as unknown as {
      GState: new (opts: { opacity: number }) => unknown;
      setGState: (gs: unknown) => void;
    };
    const gs = new G.GState({ opacity });
    G.setGState.call(doc, gs);
  } catch {
    /* noop */
  }
}

/** Draw the small CAPACITI mark: red filled dot with navy dot inside + "CAPACITI" wordmark. */
function drawCapacitiMark(doc: jsPDF, x: number, y: number, scale = 1) {
  const r = 2.2 * scale;
  // outer red ring
  doc.setFillColor(...CORAL);
  doc.circle(x, y, r, "F");
  // inner navy dot
  doc.setFillColor(...NAVY);
  doc.circle(x, y, r * 0.45, "F");
  // wordmark
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11 * scale);
  doc.setTextColor(...NAVY);
  doc.text("CAPACITI", x + r + 2, y + 1.2 * scale);
}

/**
 * Draw a corner "blob" cluster — overlapping red and purple ovals like the template.
 * `corner` chooses which corner to render in.
 */
function drawCornerBlobs(
  doc: jsPDF,
  pageW: number,
  pageH: number,
  corner: "tr" | "bl",
) {
  if (corner === "tr") {
    // Top-right: large purple behind, red in front
    doc.setFillColor(...PURPLE);
    doc.ellipse(pageW - 8, -8, 60, 38, "F");
    doc.setFillColor(...CORAL);
    doc.ellipse(pageW - 35, -2, 55, 32, "F");
  } else {
    // Bottom-left: large red behind, purple in front
    doc.setFillColor(...CORAL);
    doc.ellipse(0, pageH + 4, 55, 32, "F");
    doc.setFillColor(...PURPLE);
    doc.ellipse(28, pageH + 4, 50, 30, "F");
  }
}

/** Generate an A4 PORTRAIT certificate PDF that mirrors the CAPACITI template. */
export async function generateCertificate(opts: CertificateOptions): Promise<Blob> {
  const { respondent, assessmentTitle, assessmentDate } = opts;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();   // 210
  const pageH = doc.internal.pageSize.getHeight();  // 297

  // White background (already default but explicit for safety)
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, pageH, "F");

  // Decorative blob clusters
  drawCornerBlobs(doc, pageW, pageH, "tr");
  drawCornerBlobs(doc, pageW, pageH, "bl");

  // Title — "CERTIFICATE OF COMPLETION" (serif, navy, two lines, centered)
  doc.setFont("times", "bold");
  doc.setTextColor(...NAVY);
  doc.setFontSize(48);
  doc.text("CERTIFICATE", pageW / 2, 78, { align: "center" });
  doc.text("OF COMPLETION", pageW / 2, 100, { align: "center" });

  // Eyebrow
  doc.setFont("times", "normal");
  doc.setTextColor(...NAVY);
  doc.setFontSize(13);
  doc.text("This certificate is presented to", pageW / 2, 122, { align: "center" });

  // Recipient name (UPPERCASE serif bold)
  doc.setFont("times", "bold");
  doc.setTextColor(...NAVY);
  doc.setFontSize(28);
  doc.text(respondent.name.toUpperCase(), pageW / 2, 142, { align: "center" });

  // Diamond divider line
  const divY = 152;
  const divHalf = 60;
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.6);
  doc.line(pageW / 2 - divHalf + 4, divY, pageW / 2 + divHalf - 4, divY);
  // diamonds at each end
  const drawDiamond = (cx: number, cy: number, s: number) => {
    doc.setFillColor(...NAVY);
    doc.triangle(cx - s, cy, cx, cy - s, cx + s, cy, "F");
    doc.triangle(cx - s, cy, cx, cy + s, cx + s, cy, "F");
  };
  drawDiamond(pageW / 2 - divHalf, divY, 1.8);
  drawDiamond(pageW / 2 + divHalf, divY, 1.8);

  // "has successfully completed the assessment for"
  doc.setFont("times", "normal");
  doc.setTextColor(...NAVY);
  doc.setFontSize(13);
  doc.text("has successfully completed the assessment for", pageW / 2, 172, { align: "center" });

  // Assessment title (serif bold)
  doc.setFont("times", "bold");
  doc.setTextColor(...NAVY);
  doc.setFontSize(20);
  const titleLines = doc.splitTextToSize(assessmentTitle, pageW - 60);
  doc.text(titleLines, pageW / 2, 188, { align: "center" });

  // "Achieving a score of"
  doc.setFont("times", "normal");
  doc.setTextColor(...NAVY);
  doc.setFontSize(13);
  doc.text("Achieving a score of", pageW / 2, 215, { align: "center" });

  // Score (coral, large)
  const scoreText =
    respondent.percent !== null
      ? respondent.rawScore !== null && respondent.totalPossible !== null
        ? `${respondent.rawScore} / ${respondent.totalPossible}  (${respondent.percent.toFixed(2)}%)`
        : `${respondent.percent.toFixed(2)}%`
      : respondent.rawScore !== null
        ? `${respondent.rawScore}`
        : "—";
  doc.setFont("times", "bold");
  doc.setTextColor(...CORAL);
  doc.setFontSize(26);
  doc.text(scoreText, pageW / 2, 230, { align: "center" });

  // Underline beneath score
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.5);
  doc.line(pageW / 2 - 50, 235, pageW / 2 + 50, 235);

  // Date
  doc.setFont("times", "normal");
  doc.setTextColor(...MUTED);
  doc.setFontSize(11);
  doc.text(`Date: ${assessmentDate}`, pageW / 2, 244, { align: "center" });

  // CAPACITI mark centered near bottom
  const markY = 268;
  const markText = "CAPACITI";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  const markTextW = doc.getTextWidth(markText);
  const dotR = 2.6;
  const totalW = dotR * 2 + 2.5 + markTextW;
  const startX = (pageW - totalW) / 2;
  // red ring
  doc.setFillColor(...CORAL);
  doc.circle(startX + dotR, markY - 1.2, dotR, "F");
  // navy inner
  doc.setFillColor(...NAVY);
  doc.circle(startX + dotR, markY - 1.2, dotR * 0.45, "F");
  // text
  doc.setTextColor(...NAVY);
  doc.text(markText, startX + dotR * 2 + 2.5, markY);

  // "Issued by CAPACITI"
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text("Issued by CAPACITI", pageW / 2, markY + 6, { align: "center" });

  return doc.output("blob");
}

export interface AnswerKeyEntry {
  options: string[];
  correctOption: string;
  correctIndex: number;
}

interface ReportOptions {
  respondent: Respondent;
  assessmentTitle: string;
  assessmentDate: string;
  passThreshold: number;
  /** All possible options per question (collected across respondents). */
  questionOptions: Record<string, string[]>;
  /** Optional answer key keyed by question text. When present, all options are rendered with correct/incorrect marking. */
  answerKey?: Record<string, AnswerKeyEntry>;
}

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function findOptionIndex(target: string, options: string[]): number {
  if (!target) return -1;
  const n = normalizeForMatch(target);
  for (let i = 0; i < options.length; i++) {
    if (normalizeForMatch(options[i]) === n) return i;
  }
  for (let i = 0; i < options.length; i++) {
    const a = normalizeForMatch(options[i]);
    if (a && (a.includes(n) || n.includes(a))) return i;
  }
  return -1;
}

function drawReportHeader(doc: jsPDF, assessmentTitle: string) {
  const pageW = doc.internal.pageSize.getWidth();

  // Top tri-color stripe (coral | purple | navy)
  const stripeY = 0;
  const stripeH = 4;
  const seg1 = pageW * 0.28;
  const seg2 = pageW * 0.42;
  doc.setFillColor(...CORAL);
  doc.rect(0, stripeY, seg1, stripeH, "F");
  doc.setFillColor(...PURPLE);
  doc.rect(seg1, stripeY, seg2, stripeH, "F");
  doc.setFillColor(...NAVY);
  doc.rect(seg1 + seg2, stripeY, pageW - seg1 - seg2, stripeH, "F");

  // CAPACITI mark
  drawCapacitiMark(doc, 18, 18, 1);

  // "Assessment Results Report"
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.setFontSize(22);
  doc.text("Assessment Results Report", 14, 32);

  // Subtitle
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(...MUTED);
  const titleLines = doc.splitTextToSize(assessmentTitle, pageW - 28);
  doc.text(titleLines, 14, 40);
}

function drawReportFooter(doc: jsPDF, name: string, title: string) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const current = doc.getCurrentPageInfo().pageNumber;
  const total = doc.getNumberOfPages();

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(
    `${name}  •  ${title}  •  Page ${current} of ${total}`,
    pageW / 2,
    pageH - 10,
    { align: "center" },
  );
}

/** Generate the assessment results report (portrait A4) — matches CAPACITI template. */
export async function generateReport(opts: ReportOptions): Promise<Blob> {
  const { respondent, assessmentTitle, assessmentDate, passThreshold, questionOptions, answerKey } = opts;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const usableW = pageW - marginX * 2;

  drawReportHeader(doc, assessmentTitle);

  // Summary card (light gray rounded box)
  let y = 50;
  const cardH = 42;
  doc.setFillColor(...LIGHT_GRAY);
  doc.roundedRect(marginX, y, usableW, cardH, 2.5, 2.5, "F");

  // Two columns of labels/values + PASS/FAIL on the right
  const passed = respondent.percent !== null && respondent.percent >= passThreshold;
  const labelColor = MUTED;
  const valueColor = NAVY;

  // NAME
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...labelColor);
  doc.text("NAME", marginX + 6, y + 8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...valueColor);
  doc.text(respondent.name, marginX + 6, y + 15);

  // SCORE
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...labelColor);
  doc.text("SCORE", marginX + 70, y + 8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...valueColor);
  const scoreLine =
    respondent.percent !== null
      ? respondent.rawScore !== null && respondent.totalPossible !== null
        ? `${respondent.rawScore} / ${respondent.totalPossible}  (${respondent.percent.toFixed(2)}%)`
        : `${respondent.percent.toFixed(2)}%`
      : respondent.rawScore !== null
        ? `${respondent.rawScore}`
        : "—";
  doc.text(scoreLine, marginX + 70, y + 15);

  // EMAIL
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...labelColor);
  doc.text("EMAIL", marginX + 6, y + 25);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...valueColor);
  doc.text(respondent.email || "—", marginX + 6, y + 32);

  // DATE
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...labelColor);
  doc.text("DATE", marginX + 70, y + 25);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...valueColor);
  doc.text(assessmentDate, marginX + 70, y + 32);

  // PASS / FAIL badge (top-right of card)
  const badgeW = 38;
  const badgeH = 16;
  const badgeX = marginX + usableW - badgeW - 6;
  const badgeY = y + 6;
  if (passed) {
    doc.setFillColor(...SUCCESS_BG);
    doc.setDrawColor(...SUCCESS);
  } else {
    doc.setFillColor(...FAIL_BG);
    doc.setDrawColor(...CORAL);
  }
  doc.setLineWidth(0.6);
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.5, 1.5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...(passed ? SUCCESS : CORAL));
  doc.text(passed ? "PASS" : "FAIL", badgeX + badgeW / 2, badgeY + 11, { align: "center" });

  y += cardH + 6;

  // Pass threshold line
  doc.setFont("helvetica", "italic");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(`Pass threshold: ${passThreshold}%`, marginX, y);
  y += 8;

  // "Your Answers" section heading
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...NAVY);
  doc.text("Your Answers", marginX, y);
  y += 8;

  // Legend (only when an answer key is in use)
  const hasAnyKey = !!answerKey && Object.keys(answerKey).length > 0;
  if (hasAnyKey) {
    const legendY = y;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    // green swatch
    doc.setFillColor(...SUCCESS_BG);
    doc.setDrawColor(...SUCCESS);
    doc.setLineWidth(0.4);
    doc.roundedRect(marginX, legendY - 3, 4, 4, 0.6, 0.6, "FD");
    doc.text("Your answer (correct)", marginX + 6, legendY);
    // red swatch
    const x2 = marginX + 62;
    doc.setFillColor(...FAIL_BG);
    doc.setDrawColor(...CORAL);
    doc.roundedRect(x2, legendY - 3, 4, 4, 0.6, 0.6, "FD");
    doc.text("Your answer (incorrect)", x2 + 6, legendY);
    y += 9;
  }

  // Helper: render a tick or cross icon at (x,y)
  const drawTick = (cx: number, cy: number, color: [number, number, number]) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(0.9);
    doc.line(cx - 1.6, cy + 0.2, cx - 0.4, cy + 1.4);
    doc.line(cx - 0.4, cy + 1.4, cx + 1.8, cy - 1.4);
  };
  const drawCross = (cx: number, cy: number, color: [number, number, number]) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(0.9);
    doc.line(cx - 1.4, cy - 1.4, cx + 1.4, cy + 1.4);
    doc.line(cx - 1.4, cy + 1.4, cx + 1.4, cy - 1.4);
  };

  type OptionRender = {
    lines: string[];
    state: "neutral" | "selected-correct" | "selected-wrong" | "correct-only" | "selected-only";
    caption?: string;
  };

  respondent.answers.forEach((qa, i) => {
    const selected = (qa.selected || "").trim();
    const noAnswer = !selected;
    const key = answerKey?.[qa.question];

    // Build the list of options to render for this question
    const renders: OptionRender[] = [];
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);

    if (key && key.options.length > 0) {
      const selectedIdx = noAnswer ? -1 : findOptionIndex(selected, key.options);
      key.options.forEach((opt, idx) => {
        const isCorrect = idx === key.correctIndex;
        const isSelected = idx === selectedIdx;
        let state: OptionRender["state"] = "neutral";
        let caption: string | undefined;
        if (isSelected && isCorrect) {
          state = "selected-correct";
          caption = "Your answer · Correct";
        } else if (isSelected && !isCorrect) {
          state = "selected-wrong";
          caption = "Your answer";
        } else if (!isSelected && isCorrect) {
          state = "correct-only";
          caption = "Correct answer";
        }
        const lines = doc.splitTextToSize(opt, usableW - 22);
        renders.push({ lines, state, caption });
      });
      // If candidate's selected text didn't match any option, append it as a wrong selection
      if (!noAnswer && selectedIdx === -1) {
        const lines = doc.splitTextToSize(selected, usableW - 22);
        renders.push({ lines, state: "selected-wrong", caption: "Your answer (not in key)" });
      }
    } else if (noAnswer) {
      renders.push({ lines: doc.splitTextToSize("(No answer provided)", usableW - 22), state: "neutral" });
    } else {
      renders.push({
        lines: doc.splitTextToSize(selected, usableW - 22),
        state: "selected-only",
        caption: "Your answer",
      });
    }

    // Measure block height
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    const qLines = doc.splitTextToSize(`Q${i + 1}. ${qa.question || "(no question text)"}`, usableW);

    let optionsBlockH = 0;
    for (const r of renders) {
      const pillH = r.lines.length * 5.4 + 5;
      optionsBlockH += pillH + 1 + (r.caption ? 4 : 0);
    }
    const blockH = qLines.length * 6.2 + 5 + optionsBlockH + 7;

    // Page break
    if (y + blockH > pageH - 18) {
      drawReportFooter(doc, respondent.name, assessmentTitle);
      doc.addPage();
      drawReportHeader(doc, assessmentTitle);
      y = 50;
    }

    // Question
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(qLines, marginX, y);
    y += qLines.length * 6.2 + 5;

    // Render options
    for (const r of renders) {
      const pillH = r.lines.length * 5.4 + 5;

      if (r.caption) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        const capColor: [number, number, number] =
          r.state === "selected-correct" ? SUCCESS :
          r.state === "selected-wrong" ? CORAL :
          r.state === "correct-only" ? SUCCESS :
          PURPLE;
        doc.setTextColor(...capColor);
        doc.text(r.caption, marginX + usableW, y, { align: "right" });
        y += 4;
      }

      // Pill background + outline based on state
      let fill: [number, number, number] | null = null;
      let stroke: [number, number, number] = [180, 184, 200];
      let bulletFill: [number, number, number] | null = null;
      let textColor: [number, number, number] = INK;
      let bold = false;
      let iconAtRight: "tick" | "cross" | null = null;
      let iconColor: [number, number, number] = SUCCESS;

      switch (r.state) {
        case "selected-correct":
          fill = SUCCESS_BG;
          stroke = SUCCESS;
          bulletFill = SUCCESS;
          textColor = NAVY;
          bold = true;
          iconAtRight = "tick";
          iconColor = SUCCESS;
          break;
        case "selected-wrong":
          fill = FAIL_BG;
          stroke = CORAL;
          bulletFill = CORAL;
          textColor = NAVY;
          bold = true;
          iconAtRight = "cross";
          iconColor = CORAL;
          break;
        case "correct-only":
          fill = null;
          stroke = SUCCESS;
          bulletFill = null;
          textColor = INK;
          bold = false;
          iconAtRight = "tick";
          iconColor = SUCCESS;
          break;
        case "selected-only":
          fill = LIGHT_PURPLE_BG;
          stroke = PURPLE;
          bulletFill = PURPLE;
          textColor = NAVY;
          bold = true;
          break;
        case "neutral":
        default:
          fill = null;
          stroke = [180, 184, 200];
          bulletFill = null;
          textColor = INK;
          bold = false;
      }

      doc.setDrawColor(...stroke);
      doc.setLineWidth(0.4);
      if (fill) {
        doc.setFillColor(...fill);
        doc.roundedRect(marginX, y - 1, usableW, pillH, 1.2, 1.2, "FD");
      } else {
        doc.roundedRect(marginX, y - 1, usableW, pillH, 1.2, 1.2, "S");
      }

      // Bullet
      if (bulletFill) {
        doc.setFillColor(...bulletFill);
        doc.circle(marginX + 6, y + 3.2, 1.4, "F");
      } else {
        doc.setDrawColor(...stroke);
        doc.circle(marginX + 6, y + 3.2, 1.4, "S");
      }

      // Option text
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(...textColor);
      doc.text(r.lines, marginX + 12, y + 4.2);

      // Right-side icon
      if (iconAtRight) {
        const ix = marginX + usableW - 5;
        const iy = y + 3.2;
        if (iconAtRight === "tick") drawTick(ix, iy, iconColor);
        else drawCross(ix, iy, iconColor);
      }

      y += pillH + 1;
    }

    y += 7;
  });

  drawReportFooter(doc, respondent.name, assessmentTitle);
  return doc.output("blob");
}

export function makeFileNameSafe(name: string): string {
  return name.replace(/[^\w\s.-]+/g, "").replace(/\s+/g, "_");
}

export function formatAssessmentDate(d: Date | string | null | undefined): string {
  if (!d) return format(new Date(), "d MMMM yyyy");
  const parsed = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(parsed.getTime())) return format(new Date(), "d MMMM yyyy");
  return format(parsed, "d MMMM yyyy");
}
