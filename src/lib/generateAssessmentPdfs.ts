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

interface ReportOptions {
  respondent: Respondent;
  assessmentTitle: string;
  assessmentDate: string;
  passThreshold: number;
  /** All possible options per question (collected across respondents). */
  questionOptions: Record<string, string[]>;
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
  const { respondent, assessmentTitle, assessmentDate, passThreshold, questionOptions } = opts;
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

  // Questions
  respondent.answers.forEach((qa, i) => {
    const allOptions = questionOptions[qa.question] ?? [];
    const selected = (qa.selected || "").trim();
    const optionsToList = allOptions.length > 0 ? [...allOptions] : (selected ? [selected] : []);
    const selectedInList = selected && optionsToList.some((o) => o === selected);
    const showOther = selected && !selectedInList;
    const noAnswer = !selected;

    // measure question
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    const qLines = doc.splitTextToSize(`Q${i + 1}. ${qa.question || "(no question text)"}`, usableW);

    // measure options
    const optionMeasures: { lines: string[]; isSelected: boolean }[] = [];
    let optionsBlockH = 0;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    if (noAnswer) {
      const lines = doc.splitTextToSize("(No answer provided)", usableW - 16);
      optionMeasures.push({ lines, isSelected: false });
      optionsBlockH += lines.length * 5 + 4;
    } else {
      for (const opt of optionsToList) {
        const isSel = opt === selected;
        const lines = doc.splitTextToSize(opt || "(blank)", usableW - 30); // leave room for "Your answer"
        optionMeasures.push({ lines, isSelected: isSel });
        optionsBlockH += lines.length * 5 + 3;
      }
      if (showOther) {
        const lines = doc.splitTextToSize(selected, usableW - 30);
        optionMeasures.push({ lines, isSelected: true });
        optionsBlockH += lines.length * 5 + 3;
      }
    }

    const blockH = qLines.length * 5.5 + optionsBlockH + 6;

    // page break if needed
    if (y + blockH > pageH - 18) {
      drawReportFooter(doc, respondent.name, assessmentTitle);
      doc.addPage();
      drawReportHeader(doc, assessmentTitle);
      y = 50;
    }

    // Question text (bold dark)
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(qLines, marginX, y);
    y += qLines.length * 5.5 + 2;

    // Options
    for (const m of optionMeasures) {
      const pillH = m.lines.length * 5 + 3;

      if (m.isSelected) {
        // Light purple bg + purple outline pill
        doc.setFillColor(...LIGHT_PURPLE_BG);
        doc.setDrawColor(...PURPLE);
        doc.setLineWidth(0.4);
        doc.roundedRect(marginX, y - 1, usableW, pillH, 1.2, 1.2, "FD");
        // filled purple bullet
        doc.setFillColor(...PURPLE);
        doc.circle(marginX + 6, y + 2.5, 1.4, "F");
        // option text (bold navy)
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        doc.setTextColor(...NAVY);
        doc.text(m.lines, marginX + 12, y + 3.5);
        // "Your answer" right-aligned
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...PURPLE);
        doc.text("Your answer", marginX + usableW - 3, y + 3.5, { align: "right" });
      } else {
        // empty circle bullet, gray text
        doc.setDrawColor(180, 184, 200);
        doc.setLineWidth(0.4);
        doc.circle(marginX + 6, y + 2.5, 1.4, "S");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10.5);
        doc.setTextColor(...INK);
        doc.text(m.lines, marginX + 12, y + 3.5);
      }
      y += pillH + 1;
    }

    y += 5;
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
