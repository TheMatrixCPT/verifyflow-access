import jsPDF from "jspdf";
import { format } from "date-fns";
import type { Respondent } from "./assessmentParser";
import capacitiLogoUrl from "@/assets/capaciti-logo.png";
import certificateTemplate from "@/assets/certificate-template.png.asset.json";

// Logo aspect ratio (width / height) for the trimmed CAPACITI mark.
const LOGO_ASPECT = 1299 / 277;

let _certTemplateDataUrl: string | null = null;
async function getCertificateTemplateDataUrl(): Promise<string> {
  if (_certTemplateDataUrl) return _certTemplateDataUrl;
  const res = await fetch(certificateTemplate.url);
  const blob = await res.blob();
  _certTemplateDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return _certTemplateDataUrl;
}

let _logoDataUrl: string | null = null;
async function getLogoDataUrl(): Promise<string> {
  if (_logoDataUrl) return _logoDataUrl;
  const res = await fetch(capacitiLogoUrl);
  const blob = await res.blob();
  _logoDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return _logoDataUrl;
}

function drawLogo(
  doc: jsPDF,
  dataUrl: string,
  x: number,
  y: number,
  height: number,
) {
  const width = height * LOGO_ASPECT;
  doc.addImage(dataUrl, "PNG", x, y, width, height, undefined, "FAST");
  return { width, height };
}

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
 * Draw the decorative geometric border (red diagonal stripes, purple blocks,
 * navy accents) that frames the white certificate card.
 */
function drawCertificateFrame(doc: jsPDF, pageW: number, pageH: number) {
  // Base: white
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, pageH, "F");

  // --- Top-left: navy triangle backdrop + red diagonal stripes ---
  doc.setFillColor(...NAVY);
  // Large navy triangle behind the red stripes
  doc.triangle(0, 0, 110, 0, 0, 90, "F");

  doc.setFillColor(...CORAL);
  // Diagonal parallelogram stripes running from top-edge down to left-edge.
  // Each stripe defined by 4 points (top-left, top-right, bottom-right, bottom-left).
  const stripe = (p1: [number, number], p2: [number, number], p3: [number, number], p4: [number, number]) => {
    doc.lines(
      [
        [p2[0] - p1[0], p2[1] - p1[1]],
        [p3[0] - p2[0], p3[1] - p2[1]],
        [p4[0] - p3[0], p4[1] - p3[1]],
      ],
      p1[0],
      p1[1],
      [1, 1],
      "F",
      true,
    );
  };
  // Stripe A
  stripe([30, 0], [60, 0], [0, 60], [0, 30]);
  // Stripe B (thinner, offset)
  stripe([75, 0], [90, 0], [0, 90], [0, 75]);

  // --- Top-right: purple block with navy inset ---
  doc.setFillColor(...PURPLE);
  doc.rect(pageW - 95, 0, 95, 55, "F");
  doc.setFillColor(...NAVY);
  doc.rect(pageW - 55, 0, 55, 22, "F");

  // --- Right edge: navy vertical band + purple stripe ---
  doc.setFillColor(...NAVY);
  doc.rect(pageW - 18, 0, 18, pageH, "F");
  doc.setFillColor(...PURPLE);
  doc.rect(pageW - 40, 60, 22, 55, "F");

  // --- Bottom-right: purple large block ---
  doc.setFillColor(...PURPLE);
  doc.rect(pageW - 110, pageH - 55, 110, 55, "F");
  doc.setFillColor(...NAVY);
  doc.rect(pageW - 65, pageH - 30, 30, 30, "F");

  // --- Bottom-left: small navy accent ---
  doc.setFillColor(...NAVY);
  doc.rect(0, pageH - 20, 60, 20, "F");
  doc.setFillColor(...CORAL);
  doc.rect(15, pageH - 20, 20, 20, "F");

  // --- White inner card (with a subtle shadow-like offset) ---
  doc.setFillColor(255, 255, 255);
  doc.rect(20, 18, pageW - 55, pageH - 42, "F");
}

/** Generate an A4 LANDSCAPE certificate PDF that mirrors the CAPACITI template. */
export async function generateCertificate(opts: CertificateOptions): Promise<Blob> {
  const { respondent, assessmentDate } = opts;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();   // 297
  const pageH = doc.internal.pageSize.getHeight();  // 210

  // Decorative frame + white card
  drawCertificateFrame(doc, pageW, pageH);

  // Card bounds
  const cardX = 20;
  const cardW = pageW - 55;
  const centerX = cardX + cardW / 2;

  // CAPACITI logo centered near top of card
  const logoH = 14;
  const logoW = logoH * LOGO_ASPECT;
  const logoY = 26;
  const logoDataUrl = await getLogoDataUrl();
  drawLogo(doc, logoDataUrl, centerX - logoW / 2, logoY, logoH);

  // "CERTIFICATE" — bold sans-serif, navy, huge
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.setFontSize(52);
  doc.text("CERTIFICATE", centerX, 72, { align: "center" });

  // "OF COMPLETION" — smaller
  doc.setFont("helvetica", "normal");
  doc.setFontSize(22);
  doc.text("OF COMPLETION", centerX, 87, { align: "center" });

  // "This certificate is proudly presented to:"
  doc.setFont("helvetica", "normal");
  doc.setFontSize(14);
  doc.setTextColor(...NAVY);
  doc.text("This certificate is proudly presented to:", centerX, 105, { align: "center" });

  // Recipient name — serif bold, navy
  doc.setFont("times", "bold");
  doc.setFontSize(34);
  doc.setTextColor(...NAVY);
  doc.text(respondent.name, centerX, 128, { align: "center" });

  // Purple underline beneath name
  doc.setDrawColor(...PURPLE);
  doc.setLineWidth(0.6);
  doc.line(centerX - 70, 134, centerX + 70, 134);

  // "for achieving a score of"
  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.setTextColor(...NAVY);
  doc.text("for achieving a score of", centerX, 152, { align: "center" });


  // Score — serif bold navy, large
  const scoreText =
    respondent.percent !== null
      ? respondent.rawScore !== null && respondent.totalPossible !== null
        ? `${respondent.rawScore} / ${respondent.totalPossible}  (${respondent.percent.toFixed(2)}%)`
        : `${respondent.percent.toFixed(2)}%`
      : respondent.rawScore !== null
        ? `${respondent.rawScore}`
        : "—";
  doc.setFont("times", "bold");
  doc.setFontSize(26);
  doc.setTextColor(...NAVY);
  doc.text(scoreText, centerX, 170, { align: "center" });

  // Purple underline beneath score
  doc.setDrawColor(...PURPLE);
  doc.setLineWidth(0.6);
  doc.line(centerX - 55, 175, centerX + 55, 175);

  // Date
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...MUTED);
  doc.text(`Date: ${assessmentDate}`, centerX, 185, { align: "center" });

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

function drawReportHeader(doc: jsPDF, assessmentTitle: string, logoDataUrl: string) {
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

  // CAPACITI logo
  const headerLogoH = 11;
  drawLogo(doc, logoDataUrl, 14, 10, headerLogoH);

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

  const logoDataUrl = await getLogoDataUrl();
  drawReportHeader(doc, assessmentTitle, logoDataUrl);

  // Summary card (light gray rounded box)
  let y = 50;
  const cardH = 42;
  doc.setFillColor(...LIGHT_GRAY);
  doc.roundedRect(marginX, y, usableW, cardH, 2.5, 2.5, "F");

  // Two columns of labels/values + PASS/FAIL on the right
  const passed = respondent.percent !== null && respondent.percent >= passThreshold;
  const labelColor = MUTED;
  const valueColor = NAVY;

  // Layout: left column NAME/EMAIL, right column SCORE/DATE, then PASS/FAIL badge.
  const badgeW = 38;
  const badgeH = 16;
  const badgeX = marginX + usableW - badgeW - 6;
  const badgeY = y + 6;

  const leftX = marginX + 6;
  const rightX = marginX + 95;
  const leftColW = rightX - leftX - 6;
  const rightColW = badgeX - rightX - 6;

  // NAME
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...labelColor);
  doc.text("NAME", leftX, y + 8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...valueColor);
  doc.text(doc.splitTextToSize(respondent.name, leftColW)[0] ?? respondent.name, leftX, y + 15);

  // SCORE
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...labelColor);
  doc.text("SCORE", rightX, y + 8);
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
  doc.text(scoreLine, rightX, y + 15);

  // EMAIL — auto-shrink font size so the address fits within the left column.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...labelColor);
  doc.text("EMAIL", leftX, y + 25);
  const emailText = respondent.email || "—";
  let emailFontSize = 11;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(emailFontSize);
  while (doc.getTextWidth(emailText) > leftColW && emailFontSize > 7) {
    emailFontSize -= 0.5;
    doc.setFontSize(emailFontSize);
  }
  doc.setTextColor(...valueColor);
  doc.text(emailText, leftX, y + 32);

  // DATE
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...labelColor);
  doc.text("DATE", rightX, y + 25);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...valueColor);
  doc.text(doc.splitTextToSize(assessmentDate, rightColW)[0] ?? assessmentDate, rightX, y + 32);

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

  type OptionState = "neutral" | "selected-correct" | "selected-wrong" | "selected-unknown";
  type OptionRender = {
    lines: string[];
    state: OptionState;
  };

  const PILL_PAD_X = 12;        // left text inset (after bullet)
  const PILL_PAD_RIGHT = 32;    // reserve space for the right-side label
  const LINE_HEIGHT = 5.0;
  const PILL_TOP_PAD = 2.2;
  const PILL_BOTTOM_PAD = 3.0;
  const OPTION_GAP = 2.0;       // vertical gap between options
  const QUESTION_GAP = 8.0;     // gap after a question's options end

  respondent.answers.forEach((qa, i) => {
    const selected = (qa.selected || "").trim();
    const noAnswer = !selected;
    const key = answerKey?.[qa.question];

    // Build option list
    const renders: OptionRender[] = [];
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);

    if (key && key.options.length > 0) {
      const selectedIdx = noAnswer ? -1 : findOptionIndex(selected, key.options);
      key.options.forEach((opt, idx) => {
        const isSelected = idx === selectedIdx;
        const isCorrect = idx === key.correctIndex;
        let state: OptionState = "neutral";
        if (isSelected && isCorrect) state = "selected-correct";
        else if (isSelected && !isCorrect) state = "selected-wrong";
        const lines = doc.splitTextToSize(opt, usableW - PILL_PAD_X - PILL_PAD_RIGHT);
        renders.push({ lines, state });
      });
      // Selected value not in extracted options → render it as a wrong selection
      if (!noAnswer && selectedIdx === -1) {
        const lines = doc.splitTextToSize(selected, usableW - PILL_PAD_X - PILL_PAD_RIGHT);
        renders.push({ lines, state: "selected-wrong" });
      }
    } else if (noAnswer) {
      const lines = doc.splitTextToSize("(No answer provided)", usableW - PILL_PAD_X - PILL_PAD_RIGHT);
      renders.push({ lines, state: "neutral" });
    } else {
      const lines = doc.splitTextToSize(selected, usableW - PILL_PAD_X - PILL_PAD_RIGHT);
      renders.push({ lines, state: "selected-unknown" });
    }

    // Measure block height for page-break
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    const qLines = doc.splitTextToSize(`Q${i + 1}. ${qa.question || "(no question text)"}`, usableW);
    const qHeight = qLines.length * 5.6 + 4;
    let optionsBlockH = 0;
    for (const r of renders) {
      const pillH = r.lines.length * LINE_HEIGHT + PILL_TOP_PAD + PILL_BOTTOM_PAD;
      optionsBlockH += pillH + OPTION_GAP;
    }
    const blockH = qHeight + optionsBlockH + QUESTION_GAP;

    // Page break
    if (y + blockH > pageH - 18) {
      drawReportFooter(doc, respondent.name, assessmentTitle);
      doc.addPage();
      drawReportHeader(doc, assessmentTitle, logoDataUrl);
      y = 50;
    }

    // Question text
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(qLines, marginX, y + 4);
    y += qHeight;

    // Options
    for (const r of renders) {
      const pillH = r.lines.length * LINE_HEIGHT + PILL_TOP_PAD + PILL_BOTTOM_PAD;

      // Style by state
      let fill: [number, number, number] | null = null;
      let stroke: [number, number, number] = [200, 204, 214];
      let bulletFill: [number, number, number] | null = null;
      let textColor: [number, number, number] = INK;
      let bold = false;
      let label: string | null = null;
      let labelColor: [number, number, number] = SUCCESS;

      switch (r.state) {
        case "selected-correct":
          fill = SUCCESS_BG;
          stroke = SUCCESS;
          bulletFill = SUCCESS;
          textColor = NAVY;
          bold = true;
          label = "Correct";
          labelColor = SUCCESS;
          break;
        case "selected-wrong":
          fill = FAIL_BG;
          stroke = CORAL;
          bulletFill = CORAL;
          textColor = NAVY;
          bold = true;
          label = "Incorrect";
          labelColor = CORAL;
          break;
        case "selected-unknown":
          fill = LIGHT_PURPLE_BG;
          stroke = PURPLE;
          bulletFill = PURPLE;
          textColor = NAVY;
          bold = true;
          break;
        case "neutral":
        default:
          break;
      }

      // Pill
      doc.setDrawColor(...stroke);
      doc.setLineWidth(0.4);
      if (fill) {
        doc.setFillColor(...fill);
        doc.roundedRect(marginX, y, usableW, pillH, 1.4, 1.4, "FD");
      } else {
        doc.roundedRect(marginX, y, usableW, pillH, 1.4, 1.4, "S");
      }

      // Bullet (vertically centered)
      const bulletY = y + pillH / 2;
      if (bulletFill) {
        doc.setFillColor(...bulletFill);
        doc.circle(marginX + 6, bulletY, 1.4, "F");
      } else {
        doc.setDrawColor(...stroke);
        doc.circle(marginX + 6, bulletY, 1.4, "S");
      }

      // Option text — baseline of first line
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(...textColor);
      const textBaseline = y + PILL_TOP_PAD + LINE_HEIGHT - 1.2;
      doc.text(r.lines, marginX + PILL_PAD_X, textBaseline, { lineHeightFactor: 1.15 });

      // Right-side label (vertically centered)
      if (label) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...labelColor);
        doc.text(label, marginX + usableW - 4, bulletY + 1.2, { align: "right" });
      }

      y += pillH + OPTION_GAP;
    }

    y += QUESTION_GAP;
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
