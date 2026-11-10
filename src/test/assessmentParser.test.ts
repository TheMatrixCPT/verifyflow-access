import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { applyAssessmentTotal, parseFormsWorkbook } from "../lib/assessmentParser";

function workbook(rows: Record<string, unknown>[]) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), "Assessment");
  return XLSX.write(book, { type: "array", bookType: "xlsx" });
}

function weightedRow(name: string, correct: number) {
  const row: Record<string, unknown> = { Name: name, "Total points": "" };
  for (let i = 0; i < 50; i++) {
    row[`Question ${i + 1}`] = "Selected answer";
    row[`Points - Question ${i + 1}`] = i < correct ? 2 : 0;
  }
  return row;
}

describe("assessment marks", () => {
  it("does not mistake 50 questions for 50 maximum marks", () => {
    const parsed = parseFormsWorkbook(workbook([weightedRow("Alrique Usher", 46)]));
    expect(parsed.respondents[0].rawScore).toBe(92);
    expect(parsed.respondents[0].totalPossible).toBeNull();
    expect(parsed.respondents[0].percent).toBeNull();
  });

  it("calculates Alrique's 92/100 as 92 percent", () => {
    const parsed = applyAssessmentTotal(parseFormsWorkbook(workbook([weightedRow("Alrique Usher", 46)])), 100);
    expect(parsed.respondents[0]).toMatchObject({ rawScore: 92, totalPossible: 100, percent: 92 });
  });

  it("calculates Ncebakazi's 58/100 as 58 percent, below the 75 percent threshold", () => {
    const parsed = applyAssessmentTotal(parseFormsWorkbook(workbook([weightedRow("Ncebakazi Makhanya", 29)])), 100);
    expect(parsed.respondents[0]).toMatchObject({ rawScore: 58, totalPossible: 100, percent: 58 });
    expect(Number(parsed.respondents[0].percent) >= 75).toBe(false);
  });

  it("does not publish a percentage when marks exceed the configured maximum", () => {
    const parsed = applyAssessmentTotal(parseFormsWorkbook(workbook([weightedRow("Alrique Usher", 46)])), 50);
    expect(parsed.respondents[0].rawScore).toBe(92);
    expect(parsed.respondents[0].percent).toBeNull();
  });

  it("uses explicitly provided per-question maximums, including zero awards", () => {
    const parsed = parseFormsWorkbook(workbook([{ Name: "Candidate", Q1: "A", "Points - Q1": "0/2", Q2: "B", "Points - Q2": "2/2" }]));
    expect(parsed.respondents[0]).toMatchObject({ rawScore: 2, totalPossible: 4, percent: 50 });
  });

  it("preserves explicit total marks from Forms", () => {
    const parsed = parseFormsWorkbook(workbook([{ Name: "Candidate", "Total points": "58/100", Q1: "A", "Points - Q1": 2 }]));
    expect(parsed.respondents[0]).toMatchObject({ rawScore: 58, totalPossible: 100, percent: 58 });
  });

  it("ignores stray scoring rows without a respondent", () => {
    const parsed = parseFormsWorkbook(workbook([weightedRow("Alrique Usher", 46), weightedRow("", 1)]));
    expect(parsed.respondents).toHaveLength(1);
  });
});