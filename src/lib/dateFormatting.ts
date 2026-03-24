import { format, parse } from "date-fns";

const DATE_PATTERNS = [
  "yyyy-MM-dd",
  "yyyy/MM/dd",
  "dd/MM/yyyy",
  "MM/dd/yyyy",
  "dd-MM-yyyy",
  "MM-dd-yyyy",
] as const;

export function formatDateToDayMonthYear(value?: string | null): string | undefined | null {
  if (!value || value.trim() === "") return value;

  const trimmedValue = value.trim();

  for (const pattern of DATE_PATTERNS) {
    const parsedDate = parse(trimmedValue, pattern, new Date());

    if (!Number.isNaN(parsedDate.getTime()) && format(parsedDate, pattern) === trimmedValue) {
      return format(parsedDate, "dd/MM/yyyy");
    }
  }

  const fallbackDate = new Date(trimmedValue);
  if (!Number.isNaN(fallbackDate.getTime())) {
    return format(fallbackDate, "dd/MM/yyyy");
  }

  return value;
}

export function normalizeBirthDateText(value?: string | null): string | undefined | null {
  if (!value) return value;

  return value.replace(
    /\b(DOB|Date of Birth|Valid date of birth)\b:\s*(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[/-]\d{2}[/-]\d{4})/gi,
    (match, label, dateValue) => {
      const formattedDate = formatDateToDayMonthYear(dateValue);
      return formattedDate ? `${label}: ${formattedDate}` : match;
    },
  );
}
