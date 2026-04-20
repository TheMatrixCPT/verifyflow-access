import jsPDF from "jspdf";
import { format } from "date-fns";
import type { Respondent } from "./assessmentParser";

// CAPACITI palette
const NAVY: [number, number, number] = [11, 31, 77];      // #0B1F4D
const NAVY_DEEP: [number, number, number] = [7, 22, 56];
const CORAL: [number, number, number] = [255, 107, 92];   // #FF6B5C
const PURPLE: [number, number, number] = [124, 58, 237];  // #7C3AED
const GOLD: [number, number, number] = [201, 168, 76];
const IVORY: [number, number, number] = [251, 247, 240];
const INK: [number, number, number] = [22, 28, 45];
const MUTED: [number, number, number] = [110, 116, 134];
const SUCCESS: [number, number, number] = [34, 139, 88];

interface CertificateOptions {
  respondent: Respondent;
  assessmentTitle: string;
  assessmentDate: string;
}

/** Draw a soft circular blob (fake blur via stacked transparent circles). */
function drawBlob(
  doc: jsPDF,
  cx: number,
  cy: number,
  radius: number,
  color: [number, number, number],
) {
  const layers = 6;
  for (let i = layers; i >= 1; i--) {
    const r = (radius * i) / layers;
    const opacity = 0.08 + (1 - i / layers) * 0.12;
    // jsPDF uses GState for opacity
    const GState = (doc as unknown as {
      GState: new (opts: { opacity: number }) => unknown;
      setGState: (gs: unknown) => void;
    });
    try {
      const gs = new GState.GState({ opacity });
      GState.setGState.call(doc, gs);
    } catch {
      // ignore if GState unsupported
    }
    doc.setFillColor(...color);
    doc.circle(cx, cy, r, "F");
  }
  // reset opacity
  try {
    const GState = (doc as unknown as {
      GState: new (opts: { opacity: number }) => unknown;
      setGState: (gs: unknown) => void;
    });
    const gs = new GState.GState({ opacity: 1 });
    GState.setGState.call(doc, gs);
  } catch {
    /* noop */
  }
}

/** Generate an A4 LANDSCAPE certificate PDF (CAPACITI brand, pure code). */
export async function generateCertificate(opts: CertificateOptions): Promise<Blob> {
  const { respondent, assessmentTitle, assessmentDate } = opts;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();   // 297
  const pageH = doc.internal.pageSize.getHeight();  // 210

  // Navy background
  doc.setFillColor(...NAVY_DEEP);
  doc.rect(0, 0, pageW, pageH, "F");

  // Coral & purple blurred blobs
  drawBlob(doc, pageW - 20, 10, 70, CORAL);
  drawBlob(doc, 10, pageH - 10, 80, PURPLE);
  drawBlob(doc, pageW + 10, pageH - 30, 50, PURPLE);

  // Inner ivory card
  const cardX = 18;
  const cardY = 18;
  const cardW = pageW - 36;
  const cardH = pageH - 36;
  doc.setFillColor(...IVORY);
  doc.roundedRect(cardX, cardY, cardW, cardH, 6, 6, "F");

  // Gold inner border
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.6);
  doc.roundedRect(cardX + 4, cardY + 4, cardW - 8, cardH - 8, 4, 4, "S");

  // Top-left CAPACITI wordmark
  doc.setFont("times", "bold");
  doc.setTextColor(...NAVY);
  doc.setFontSize(18);
  doc.text("CAPACITI", cardX + 14, cardY + 18);

  // Top-right small accent
  doc.setFillColor(...CORAL);
  doc.circle(cardX + cardW - 14, cardY + 15, 2, "F");
  doc.setFillColor(...PURPLE);
  doc.circle(cardX + cardW - 8, cardY + 15, 2, "F");

  // Eyebrow
  doc.setFont("times", "italic");
  doc.setTextColor(...MUTED);
  doc.setFontSize(13);
  doc.text("Certificate of Completion", pageW / 2, cardY + 42, { align: "center" });

  // Recipient name (huge display)
  doc.setFont("times", "bold");
  doc.setTextColor(...NAVY);
  doc.setFontSize(40);
  doc.text(respondent.name, pageW / 2, cardY + 70, { align: "center" });

  // Underline accent
  doc.setDrawColor(...CORAL);
  doc.setLineWidth(0.8);
  doc.line(pageW / 2 - 35, cardY + 76, pageW / 2 + 35, cardY + 76);

  // "has successfully completed"
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...INK);
  doc.setFontSize(13);
  doc.text("has successfully completed", pageW / 2, cardY + 90, { align: "center" });

  // Assessment title
  doc.setFont("times", "bolditalic");
  doc.setTextColor(...NAVY);
  doc.setFontSize(20);
  const titleLines = doc.splitTextToSize(assessmentTitle, cardW - 40);
  doc.text(titleLines, pageW / 2, cardY + 102, { align: "center" });

  // Score line
  const scoreText =
    respondent.percent !== null
      ? `${respondent.rawScore !== null && respondent.totalPossible !== null ? `${respondent.rawScore}/${respondent.totalPossible} · ` : ""}${respondent.percent.toFixed(1)}%`
      : respondent.rawScore !== null
        ? `${respondent.rawScore}`
        : "—";

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.setFontSize(22);
  doc.text(scoreText, pageW / 2, cardY + 128, { align: "center" });

  // Date
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...MUTED);
  doc.text(`Issued ${assessmentDate}`, pageW / 2, cardY + 138, { align: "center" });

  // Signature line bottom-right
  const sigX = cardX + cardW - 80;
  const sigY = cardY + cardH - 22;
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.4);
  doc.line(sigX, sigY, sigX + 65, sigY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text("CAPACITI Programme Lead", sigX + 32.5, sigY + 5, { align: "center" });

  // Bottom-left small CAPACITI mark
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text("CAPACITI · Empowering Digital Talent", cardX + 14, cardY + cardH - 10);

  return doc.output("blob");
}

interface ReportOptions {
  respondent: Respondent;
  assessmentTitle: string;
  assessmentDate: string;
  passThreshold: number;
  /** All possible options per question (collected across respondents). */
  questionOptions: Record<string, string[]>;
}

function drawReportHeader(doc: jsPDF, title: string, name: string, email: string) {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageW, 32, "F");
  doc.setFillColor(...CORAL);
  doc.rect(0, 32, pageW, 1.5, "F");
  doc.setFillColor(...PURPLE);
  doc.rect(0, 33.5, pageW, 1, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(title, 14, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`${name}${email ? ` · ${email}` : ""}`, 14, 22);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("CAPACITI", pageW - 14, 19, { align: "right" });
}

function drawReportFooter(doc: jsPDF) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const current = doc.getCurrentPageInfo().pageNumber;
  const total = doc.getNumberOfPages();

  doc.setDrawColor(220, 220, 230);
  doc.setLineWidth(0.3);
  doc.line(14, pageH - 14, pageW - 14, pageH - 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text("Generated by CAPACITI Certificate Generator", 14, pageH - 8);
  doc.text(`Page ${current} of ${total}`, pageW - 14, pageH - 8, { align: "right" });
}

/** Generate the assessment results report (portrait A4) — every option listed, selected highlighted. */
export async function generateReport(opts: ReportOptions): Promise<Blob> {
  const { respondent, assessmentTitle, assessmentDate, passThreshold, questionOptions } = opts;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  drawReportHeader(doc, assessmentTitle, respondent.name, respondent.email);

  // Summary card
  let y = 46;
  const passed = respondent.percent !== null && respondent.percent >= passThreshold;
  const cardH = 26;
  doc.setFillColor(248, 248, 252);
  doc.setDrawColor(225, 225, 235);
  doc.roundedRect(14, y, pageW - 28, cardH, 2, 2, "FD");

  // Score
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("SCORE", 20, y + 8);
  doc.setFontSize(18);
  const scoreLine =
    respondent.percent !== null
      ? `${respondent.percent.toFixed(1)}%`
      : respondent.rawScore !== null
        ? `${respondent.rawScore}`
        : "—";
  doc.text(scoreLine, 20, y + 18);

  // Raw
  if (respondent.rawScore !== null && respondent.totalPossible !== null) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(`${respondent.rawScore} / ${respondent.totalPossible} pts`, 20, y + 23);
  }

  // Threshold
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text("THRESHOLD", 80, y + 8);
  doc.setFontSize(14);
  doc.text(`${passThreshold}%`, 80, y + 18);

  // Date
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("DATE", 130, y + 8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(assessmentDate, 130, y + 18);

  // Pass badge
  const badgeColor = passed ? SUCCESS : CORAL;
  const badgeX = pageW - 60;
  const badgeY = y + 6;
  doc.setFillColor(...badgeColor);
  doc.roundedRect(badgeX, badgeY, 46, 14, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(passed ? "PASS" : "FAIL", badgeX + 23, badgeY + 9, { align: "center" });

  y += cardH + 10;

  // Section title
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Responses", 14, y);
  doc.setDrawColor(...PURPLE);
  doc.setLineWidth(0.6);
  doc.line(14, y + 2, 40, y + 2);
  y += 8;

  const marginX = 14;
  const usableW = pageW - marginX * 2;

  respondent.answers.forEach((qa, i) => {
    const allOptions = questionOptions[qa.question] ?? [];
    const selected = (qa.selected || "").trim();
    const optionsToList = allOptions.length > 0 ? [...allOptions] : (selected ? [selected] : []);
    const selectedInList = selected && optionsToList.some((o) => o === selected);
    const showOther = selected && !selectedInList;

    // measure
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    const qLines = doc.splitTextToSize(`Q${i + 1}. ${qa.question || "(no question text)"}`, usableW);

    let optionsBlockH = 0;
    const optionMeasures: { lines: string[]; isSelected: boolean }[] = [];
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    for (const opt of optionsToList) {
      const isSel = opt === selected;
      const lines = doc.splitTextToSize(opt || "(blank)", usableW - 14);
      optionMeasures.push({ lines, isSelected: isSel });
      optionsBlockH += lines.length * 5 + 4;
    }
    let otherLines: string[] = [];
    if (showOther) {
      otherLines = doc.splitTextToSize(`Other answer: ${selected}`, usableW - 14);
      optionsBlockH += otherLines.length * 5 + 4;
    }
    if (optionsToList.length === 0 && !showOther) {
      optionsBlockH = 8;
    }

    const blockH = qLines.length * 5.5 + optionsBlockH + 8;

    if (y + blockH > pageH - 22) {
      drawReportFooter(doc);
      doc.addPage();
      drawReportHeader(doc, assessmentTitle, respondent.name, respondent.email);
      y = 46;
    }

    // Question text
    doc.setTextColor(...NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(qLines, marginX, y);
    y += qLines.length * 5.5 + 3;

    if (optionsToList.length === 0 && !showOther) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.setTextColor(...MUTED);
      doc.text("(no answer provided)", marginX + 4, y + 2);
      y += 8;
      return;
    }

    // Options
    for (const m of optionMeasures) {
      const pillH = m.lines.length * 5 + 4;
      if (m.isSelected) {
        // coral highlight pill
        doc.setFillColor(255, 232, 228); // light coral bg
        doc.setDrawColor(...CORAL);
        doc.setLineWidth(0.4);
        doc.roundedRect(marginX + 2, y - 1, usableW - 2, pillH, 1.5, 1.5, "FD");
        // checkmark
        doc.setTextColor(...CORAL);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("\u2714", marginX + 6, y + 4);
        doc.setTextColor(...INK);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        doc.text(m.lines, marginX + 12, y + 4);
      } else {
        // bullet
        doc.setFillColor(180, 184, 200);
        doc.circle(marginX + 7, y + 2.5, 0.9, "F");
        doc.setTextColor(...INK);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10.5);
        doc.text(m.lines, marginX + 12, y + 4);
      }
      y += pillH + 1;
    }

    if (showOther) {
      doc.setFillColor(255, 232, 228);
      doc.setDrawColor(...CORAL);
      doc.setLineWidth(0.4);
      const pillH = otherLines.length * 5 + 4;
      doc.roundedRect(marginX + 2, y - 1, usableW - 2, pillH, 1.5, 1.5, "FD");
      doc.setTextColor(...CORAL);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("\u2714", marginX + 6, y + 4);
      doc.setTextColor(...INK);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.text(otherLines, marginX + 12, y + 4);
      y += pillH + 1;
    }

    y += 5;
  });

  drawReportFooter(doc);
  return doc.output("blob");
}

export function makeFileNameSafe(name: string): string {
  return name.replace(/[^\w\s.-]+/g, "").replace(/\s+/g, "_");
}

export function formatAssessmentDate(d: Date | string | null | undefined): string {
  if (!d) return format(new Date(), "MMMM d, yyyy");
  const parsed = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(parsed.getTime())) return format(new Date(), "MMMM d, yyyy");
  return format(parsed, "MMMM d, yyyy");
}
