import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { normalizeBirthDateText } from "@/lib/dateFormatting";

interface ReportCandidate {
  name: string;
  status: "pass" | "warning" | "fail";
  score: number;
  summary: string;
  issues: string[];
  documents: {
    type: string;
    status: "pass" | "warning" | "fail";
    fileName: string;
    confidence: number;
    summary?: string;
    issues?: string[];
    checks?: { name: string; status: string; detail: string }[];
  }[];
}

interface ReportData {
  sessionName: string;
  sessionDate: string;
  stats: { total: number; validated: number; complete: number; issues: number };
  candidates: ReportCandidate[];
}

const COLORS = {
  navy: [29, 41, 81] as [number, number, number],
  purple: [88, 28, 135] as [number, number, number],
  salmon: [242, 82, 81] as [number, number, number],
  green: [34, 197, 94] as [number, number, number],
  amber: [245, 158, 11] as [number, number, number],
  red: [239, 68, 68] as [number, number, number],
  gray: [107, 114, 128] as [number, number, number],
  lightGray: [243, 244, 246] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

function statusColor(status: string): [number, number, number] {
  if (status === "pass") return COLORS.green;
  if (status === "warning") return COLORS.amber;
  return COLORS.red;
}

function statusLabel(status: string): string {
  if (status === "pass") return "PASSED";
  if (status === "warning") return "WARNING";
  return "FAILED";
}

export function generateReport(data: ReportData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  let y = 0;

  // ── Header bar ──
  doc.setFillColor(...COLORS.navy);
  doc.rect(0, 0, pageWidth, 38, "F");

  // Accent line
  doc.setFillColor(...COLORS.salmon);
  doc.rect(0, 38, pageWidth, 1.5, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...COLORS.white);
  doc.text("VerifyFlow AI", margin, 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255, 180);
  doc.text("Document Validation Report", margin, 24);

  doc.setFontSize(9);
  doc.text(`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}`, pageWidth - margin, 16, { align: "right" });
  doc.text(`Session: ${data.sessionName}`, pageWidth - margin, 22, { align: "right" });
  doc.text(`Date: ${data.sessionDate}`, pageWidth - margin, 28, { align: "right" });

  y = 48;

  // ── Summary cards row ──
  const cardW = (contentWidth - 9) / 4;
  const cardH = 22;
  const summaryItems = [
    { label: "Total Candidates", value: String(data.stats.total), color: COLORS.purple },
    { label: "Validated", value: String(data.stats.validated), color: COLORS.green },
    { label: "Pass Rate", value: `${data.stats.complete}%`, color: COLORS.purple },
    { label: "Issues Found", value: String(data.stats.issues), color: COLORS.salmon },
  ];

  summaryItems.forEach((item, i) => {
    const x = margin + i * (cardW + 3);
    // Card background
    doc.setFillColor(...COLORS.lightGray);
    doc.roundedRect(x, y, cardW, cardH, 2, 2, "F");
    // Top accent
    doc.setFillColor(...item.color);
    doc.roundedRect(x, y, cardW, 2.5, 2, 2, "F");
    doc.rect(x, y + 1.5, cardW, 1, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...item.color);
    doc.text(item.value, x + cardW / 2, y + 12, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.gray);
    doc.text(item.label.toUpperCase(), x + cardW / 2, y + 18, { align: "center" });
  });

  y += cardH + 10;

  // ── Per-candidate sections ──
  data.candidates.forEach((candidate, idx) => {
    // Check if we need a new page (need ~60mm minimum)
    if (y > doc.internal.pageSize.getHeight() - 60) {
      doc.addPage();
      y = 16;
    }

    // Candidate header bar
    const sc = statusColor(candidate.status);
    doc.setFillColor(...COLORS.navy);
    doc.roundedRect(margin, y, contentWidth, 12, 2, 2, "F");

    // Status pill
    doc.setFillColor(...sc);
    doc.roundedRect(margin + 2, y + 2.5, 22, 7, 3, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(...COLORS.white);
    doc.text(statusLabel(candidate.status), margin + 13, y + 7.2, { align: "center" });

    // Name
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.white);
    doc.text(candidate.name, margin + 28, y + 8);

    // Score
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Score: ${candidate.score}%`, pageWidth - margin - 4, y + 8, { align: "right" });

    y += 15;

    // Summary text
    if (candidate.summary) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(...COLORS.gray);
      const lines = doc.splitTextToSize(normalizeBirthDateText(candidate.summary) || "", contentWidth - 4);
      doc.text(lines, margin + 2, y + 3);
      y += lines.length * 3.5 + 4;
    }

    // Documents table
    if (candidate.documents.length > 0) {
      const tableBody = candidate.documents.map((d) => [
        d.fileName,
        d.type,
        statusLabel(d.status),
        `${d.confidence}%`,
        (d.issues || []).join("; ") || "None",
      ]);

      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [["File Name", "Document Type", "Status", "Confidence", "Issues"]],
        body: tableBody,
        theme: "grid",
        headStyles: {
          fillColor: COLORS.purple,
          textColor: COLORS.white,
          fontSize: 7,
          fontStyle: "bold",
          cellPadding: 2.5,
        },
        bodyStyles: {
          fontSize: 7,
          cellPadding: 2.5,
          textColor: [51, 51, 51],
        },
        alternateRowStyles: {
          fillColor: [249, 250, 251],
        },
        columnStyles: {
          0: { cellWidth: 45 },
          1: { cellWidth: 28 },
          2: { cellWidth: 20, halign: "center" },
          3: { cellWidth: 20, halign: "center" },
          4: { cellWidth: "auto" },
        },
        didParseCell: (data) => {
          if (data.column.index === 2 && data.section === "body") {
            const val = String(data.cell.raw);
            if (val === "PASSED") data.cell.styles.textColor = COLORS.green;
            else if (val === "WARNING") data.cell.styles.textColor = COLORS.amber;
            else if (val === "FAILED") data.cell.styles.textColor = COLORS.red;
            data.cell.styles.fontStyle = "bold";
          }
        },
      });

      y = (doc as any).lastAutoTable.finalY + 4;

      // Per-document validation checks
      candidate.documents.forEach((d) => {
        if (!d.checks || d.checks.length === 0) return;

        if (y > doc.internal.pageSize.getHeight() - 40) {
          doc.addPage();
          y = 16;
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(...COLORS.navy);
        doc.text(`Checks: ${d.fileName}`, margin + 2, y + 3);
        y += 5;

        autoTable(doc, {
          startY: y,
          margin: { left: margin + 2, right: margin + 2 },
          head: [["Check", "Result", "Detail"]],
          body: d.checks.map((c) => [c.name, statusLabel(c.status), normalizeBirthDateText(c.detail) || ""]),
          theme: "grid",
          headStyles: { fillColor: COLORS.navy, textColor: COLORS.white, fontSize: 6, fontStyle: "bold", cellPadding: 1.5 },
          bodyStyles: { fontSize: 6, cellPadding: 1.5, textColor: [51, 51, 51] },
          alternateRowStyles: { fillColor: [249, 250, 251] },
          columnStyles: { 0: { cellWidth: 35 }, 1: { cellWidth: 18, halign: "center" }, 2: { cellWidth: "auto" } },
          didParseCell: (data) => {
            if (data.column.index === 1 && data.section === "body") {
              const val = String(data.cell.raw);
              if (val === "PASSED") data.cell.styles.textColor = COLORS.green;
              else if (val === "WARNING") data.cell.styles.textColor = COLORS.amber;
              else if (val === "FAILED") data.cell.styles.textColor = COLORS.red;
              data.cell.styles.fontStyle = "bold";
            }
          },
        });

        y = (doc as any).lastAutoTable.finalY + 4;
      });

      y += 4;
    }
  });

  // ── Footer on every page ──
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const pageH = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...COLORS.lightGray);
    doc.line(margin, pageH - 12, pageWidth - margin, pageH - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.gray);
    doc.text("VerifyFlow AI — Confidential Document Validation Report", margin, pageH - 7);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageH - 7, { align: "right" });
  }

  doc.save(`${data.sessionName}-report-${format(new Date(), "yyyy-MM-dd")}.pdf`);
}

function csvEscape(value: unknown) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsvRow(values: unknown[]) {
  return values.map(csvEscape).join(",");
}

export function generateReportCsv(data: ReportData) {
  const rows: string[] = [];

  rows.push(buildCsvRow(["VerifyFlow AI Document Validation Report"]));
  rows.push(buildCsvRow(["Generated", format(new Date(), "dd MMM yyyy, HH:mm")]));
  rows.push(buildCsvRow(["Session", data.sessionName]));
  rows.push(buildCsvRow(["Date", data.sessionDate]));
  rows.push("");
  rows.push(buildCsvRow(["Total Candidates", data.stats.total]));
  rows.push(buildCsvRow(["Validated", data.stats.validated]));
  rows.push(buildCsvRow(["Pass Rate", `${data.stats.complete}%`]));
  rows.push(buildCsvRow(["Issues Found", data.stats.issues]));
  rows.push("");
  rows.push(
    buildCsvRow([
      "Candidate Name",
      "Document File Name",
      "Document Type",
      "Document Status",
      "Confidence",
      "Document Issues",
    ]),
  );

  data.candidates.forEach((candidate) => {
    if (candidate.documents.length === 0) {
      rows.push(buildCsvRow([candidate.name, "", "", "", "", ""]));
      return;
    }

    candidate.documents.forEach((document) => {
      const documentIssues = (document.issues || []).join("; ");
      rows.push(
        buildCsvRow([
          candidate.name,
          document.fileName,
          document.type,
          statusLabel(document.status),
          `${document.confidence}%`,
          documentIssues,
        ]),
      );
    });
  });

  const csvContent = rows.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `${data.sessionName}-report-${format(new Date(), "yyyy-MM-dd")}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
