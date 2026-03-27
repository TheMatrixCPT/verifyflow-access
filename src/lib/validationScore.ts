export interface ValidationCheck {
  name?: string;
  detail?: string;
  status: string;
}

function isNonScoringOptionalWarning(check: ValidationCheck): boolean {
  if (check.status !== "warning") return false;

  const combinedText = `${check.name || ""} ${check.detail || ""}`.toLowerCase();
  const isOptional = combinedText.includes("optional");
  const isStampOrCertificationWarning =
    combinedText.includes("stamp") ||
    combinedText.includes("certif") ||
    combinedText.includes("commissioner") ||
    combinedText.includes("police station");

  return isOptional || isStampOrCertificationWarning;
}

export function calculateValidationScore(checks: ValidationCheck[] = []): number {
  const scoringChecks = checks.filter((check) => !isNonScoringOptionalWarning(check));
  if (scoringChecks.length === 0) return 0;

  const passedChecks = scoringChecks.filter((check) => check.status === "pass").length;
  return Math.round((passedChecks / scoringChecks.length) * 100);
}
