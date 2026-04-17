import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import certificateBg from "@/assets/certificate-template.png";
import type { Respondent } from "./assessmentParser";

const NAVY: [number, number, number] = [20, 30, 76]; // CAPACITI navy
const PURPLE: [number, number, number] = [76, 28, 168];
const CORAL: [number, number, number] = [240, 80, 90];
const MUTED: [number, number, number] = [110, 116, 134];
const SELECTED_BG: [number, number, number] = [237, 233, 254]; // light purple highlight
const SELECTED_BORDER: [number, number, number] = [76, 28, 168];

let cachedBg: string | null = null;
async function loadCertBackground(): Promise<string> {
  if (cachedBg) return cachedBg;
  const res = await fetch(certificateBg);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      cachedBg = reader.result as string;
      resolve(cachedBg);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

interface CertificateOptions {
  respondent: Respondent;
  assessmentTitle: string;
  assessmentDate: string; // formatted
}

/** Generate an A4 portrait certificate PDF for a passing respondent. */
export async function generateCertificate(opts: CertificateOptions): Promise<Blob> {
  const { respondent, assessmentTitle, assessmentDate } = opts;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const bg = await loadCertBackground();
  doc.addImage(bg, "PNG", 0, 0, pageW, pageH);

  // Recipient name
  const name = respondent.name;
  doc.setFont("times", "bold");
  doc.setTextColor(...NAVY);
  doc.setFontSize(34);
  doc.text(name, pageW / 2, 128, { align: "center" });

  // Assessment title
  doc.setFont("times", "italic");
  doc.setFontSize(18);
  doc.text(assessmentTitle, pageW / 2, 165, { align: "center", maxWidth: pageW - 60 });

  // Score
  const scoreText =
    respondent.percent !== null
      ? `${respondent.percent.toFixed(1)}%${
          respondent.rawScore !== null && respondent.totalPossible !== null
            ? `  (${respondent.rawScore}/${respondent.totalPossible})`
            : ""
        }`
      : respondent.rawScore !== null
        ? `${respondent.rawScore}`
        : "—";

  doc.setFont("times", "bold");
  doc.setFontSize(26);
  doc.text(scoreText, pageW / 2, 222, { align: "center" });

  // Date (small, above logo region but doesn't conflict with template text)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...MUTED);
  doc.text(`Issued: ${assessmentDate}`, pageW / 2, 240, { align: "center" });

  return doc.output("blob");
}

interface ReportOptions {
  respondent: Respondent;
  assessmentTitle: string;
  assessmentDate: string;
  passThreshold: number;
}

function drawHeader(doc: jsPDF, title: string, subtitle: string) {
  const pageW = doc.internal.pageSize.getWidth();

  // Top navy band
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageW, 28, "F");
  // Coral accent stripe
  doc.setFillColor(...CORAL);
  doc.rect(0, 28, pageW, 2, "F");
  doc.setFillColor(...PURPLE);
  doc.rect(0, 30, pageW, 1.5, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, 14, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(subtitle, 14, 21);

  // CAPACITI brand right side
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("CAPACITI", pageW - 14, 17, { align: "right" });
}

function drawFooter(doc: jsPDF) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const totalPages = doc.getNumberOfPages();
  const current = doc.getCurrentPageInfo().pageNumber;

  doc.setDrawColor(220, 220, 230);
  doc.setLineWidth(0.3);
  doc.line(14, pageH - 14, pageW - 14, pageH - 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text("CAPACITI Assessment Results", 14, pageH - 8);
  doc.text(`Page ${current} of ${totalPages}`, pageW - 14, pageH - 8, { align: "right" });
}

/** Generate the assessment results report PDF for a single respondent. */
export async function generateReport(opts: ReportOptions): Promise<Blob> {
  const { respondent, assessmentTitle, assessmentDate, passThreshold } = opts;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();

  drawHeader(doc, assessmentTitle, "Assessment Results Report");

  // Summary block
  let y = 42;
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(respondent.name, 14, y);
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  if (respondent.email) {
    doc.text(respondent.email, 14, y);
    y += 5;
  }
  doc.text(`Date: ${assessmentDate}`, 14, y);
  y += 8;

  // Stats card
  const passed = respondent.percent !== null && respondent.percent >= passThreshold;
  const cardY = y;
  doc.setFillColor(248, 248, 252);
  doc.setDrawColor(225, 225, 235);
  doc.roundedRect(14, cardY, pageW - 28, 24, 2, 2, "FD");

  // Score
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Score", 20, cardY + 8);
  doc.setFontSize(16);
  const scoreLine =
    respondent.percent !== null
      ? `${respondent.percent.toFixed(1)}%`
      : respondent.rawScore !== null
        ? `${respondent.rawScore}`
        : "—";
  doc.text(scoreLine, 20, cardY + 17);

  // Raw
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  if (respondent.rawScore !== null && respondent.totalPossible !== null) {
    doc.text(`${respondent.rawScore} / ${respondent.totalPossible} points`, 60, cardY + 17);
  }

  // Pass threshold
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text("Pass Threshold", 110, cardY + 8);
  doc.setFontSize(13);
  doc.text(`${passThreshold}%`, 110, cardY + 17);

  // Result badge
  const badgeX = pageW - 60;
  const badgeY = cardY + 5;
  const badgeColor = passed ? ([34, 139, 88] as [number, number, number]) : CORAL;
  doc.setFillColor(...badgeColor);
  doc.roundedRect(badgeX, badgeY, 46, 14, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(passed ? "PASS" : "DID NOT PASS", badgeX + 23, badgeY + 9, { align: "center" });

  y = cardY + 32;

  // Questions section title
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Responses", 14, y);
  y += 6;

  doc.setDrawColor(...PURPLE);
  doc.setLineWidth(0.6);
  doc.line(14, y, 40, y);
  y += 6;

  // Questions list
  const marginX = 14;
  const usableW = pageW - marginX * 2;

  respondent.answers.forEach((qa, i) => {
    // Estimate block height: question text + answer
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    const qLines = doc.splitTextToSize(`Q${i + 1}. ${qa.question || "(no question text)"}`, usableW - 4);
    const ansText = qa.selected || "(no answer provided)";
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    const aLines = doc.splitTextToSize(ansText, usableW - 14);

    const blockH = qLines.length * 5.5 + aLines.length * 5 + 12;

    if (y + blockH > doc.internal.pageSize.getHeight() - 22) {
      drawFooter(doc);
      doc.addPage();
      drawHeader(doc, assessmentTitle, `${respondent.name} — Continued`);
      y = 42;
    }

    // Question text
    doc.setTextColor(...NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(qLines, marginX, y);
    y += qLines.length * 5.5 + 2;

    // Selected answer pill
    const pillH = aLines.length * 5 + 6;
    doc.setFillColor(...SELECTED_BG);
    doc.setDrawColor(...SELECTED_BORDER);
    doc.setLineWidth(0.3);
    doc.roundedRect(marginX + 3, y - 1, usableW - 3, pillH, 1.5, 1.5, "FD");

    // "Selected:" label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...PURPLE);
    doc.text("SELECTED", marginX + 6, y + 4);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(...NAVY);
    doc.text(aLines, marginX + 6, y + 9);

    y += pillH + 6;
  });

  // Final footer on every page (we only added on overflow)
  // ensure last page also has footer
  drawFooter(doc);

  return doc.output("blob");
}

/** Generate a summary CSV-like overview for the whole batch (optional helper, not used yet). */
export function makeFileNameSafe(name: string): string {
  return name.replace(/[^\w\s.-]+/g, "").replace(/\s+/g, "_");
}

export function formatAssessmentDate(d: Date | string | null | undefined): string {
  if (!d) return format(new Date(), "MMMM d, yyyy");
  const parsed = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(parsed.getTime())) return format(new Date(), "MMMM d, yyyy");
  return format(parsed, "MMMM d, yyyy");
}
