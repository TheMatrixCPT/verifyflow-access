export interface ValidationCheck {
  status: string;
}

export function calculateValidationScore(checks: ValidationCheck[] = []): number {
  if (checks.length === 0) return 0;

  const passedChecks = checks.filter((check) => check.status === "pass").length;
  return Math.round((passedChecks / checks.length) * 100);
}
