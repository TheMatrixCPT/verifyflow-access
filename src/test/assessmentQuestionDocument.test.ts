import { describe, expect, it } from "vitest";
import { parseQuestionDocument } from "../lib/assessmentQuestionDocument";
import { matchExtractedQuestions } from "../lib/answerKeyExtractor";

describe("question document extraction", () => {
  it("keeps all 50 questions even when only one has a marked correct answer", () => {
    const text = Array.from({ length: 50 }, (_, i) => `${i + 1}. Question ${i + 1}? * (2 Points)\nOption A\n${i === 18 ? "Option B (Correct)" : "Option B"}\nOption C\nOption D`).join("\n");
    const result = parseQuestionDocument(text);
    expect(result).toHaveLength(50);
    expect(result[0]).toMatchObject({ question: "Question 1?", correctIndex: -1, correctOption: "" });
    expect(result[18].correctIndex).toBe(1);
    expect(result[49].options).toHaveLength(4);
  });
  it("joins wrapped questions without losing their options", () => {
    const result = parseQuestionDocument("2. Which cloud pattern\nshould be used? * (2 Points)\nMicroservices\nLoad balancer");
    expect(result[0].question).toBe("Which cloud pattern should be used?");
    expect(result[0].options).toEqual(["Microservices", "Load balancer"]);
  });
  it("matches repeated question occurrences and never invents a correct answer", () => {
    const extracted = parseQuestionDocument("1. Which AWS service? (2 Points)\nS3\nCloudWatch\n2. Which AWS service? (2 Points)\nS3\nCloudWatch");
    const result = matchExtractedQuestions(extracted, ["Which AWS service?", "Which AWS service?1"]);
    expect(result.matched).toBe(2);
    expect(result.answerKey["Which AWS service?1"].correctIndex).toBe(-1);
    expect(result.answerKey["Which AWS service?1"].correctOption).toBe("");
  });
});