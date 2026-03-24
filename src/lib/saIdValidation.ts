/**
 * South African ID Number Structural Validation
 * Format: YYMMDDSSSSCAZ (13 digits)
 *
 * YYMMDD = date of birth
 * SSSS   = sequence/gender (0000–4999 female, 5000–9999 male)
 * C      = citizenship (0 = SA citizen, 1 = permanent resident)
 * A      = legacy race digit (typically 8 or 9)
 * Z      = Luhn checksum digit
 */

export interface SAIdValidationResult {
  valid: boolean;
  checks: { name: string; status: "pass" | "fail"; detail: string }[];
  dateOfBirth?: string;
  gender?: "Male" | "Female";
  citizenship?: "SA Citizen" | "Permanent Resident";
}

function luhnChecksum(id: string): boolean {
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    let digit = parseInt(id[i], 10);
    // Double every second digit from the right (0-indexed: positions 11,9,7,5,3,1)
    if ((13 - i) % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

function isValidDate(yy: string, mm: string, dd: string): { valid: boolean; dateStr: string } {
  const month = parseInt(mm, 10);
  const day = parseInt(dd, 10);
  const yearNum = parseInt(yy, 10);

  // Determine century: 00-current suffix → 2000s, rest → 1900s
  const currentYearSuffix = new Date().getFullYear() % 100;
  const century = yearNum <= currentYearSuffix ? 2000 : 1900;
  const fullYear = century + yearNum;

  if (month < 1 || month > 12) return { valid: false, dateStr: "" };

  const date = new Date(fullYear, month - 1, day);
  const valid =
    date.getFullYear() === fullYear &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date <= new Date(); // Can't be born in the future

  const dateStr = valid
    ? `${fullYear}-${mm}-${dd}`
    : "";

  return { valid, dateStr };
}

export function validateSAId(idNumber: string, extractedGender?: string): SAIdValidationResult {
  const cleaned = idNumber.replace(/\s/g, "");
  const checks: SAIdValidationResult["checks"] = [];
  let valid = true;

  // 1. Exactly 13 digits
  const isThirteenDigits = /^\d{13}$/.test(cleaned);
  checks.push({
    name: "ID Length (13 digits)",
    status: isThirteenDigits ? "pass" : "fail",
    detail: isThirteenDigits
      ? "ID number contains exactly 13 digits"
      : `ID number has ${cleaned.length} characters — expected 13 digits`,
  });
  if (!isThirteenDigits) {
    return { valid: false, checks };
  }

  // 2. Date of birth (YYMMDD)
  const yy = cleaned.substring(0, 2);
  const mm = cleaned.substring(2, 4);
  const dd = cleaned.substring(4, 6);
  const dob = isValidDate(yy, mm, dd);
  checks.push({
    name: "Date of Birth (YYMMDD)",
    status: dob.valid ? "pass" : "fail",
    detail: dob.valid
      ? `Valid date of birth: ${dob.dateStr}`
      : `Invalid date segment: ${yy}-${mm}-${dd}`,
  });
  if (!dob.valid) valid = false;

  // 3. Gender sequence (SSSS)
  const genderSeq = parseInt(cleaned.substring(6, 10), 10);
  const derivedGender: "Male" | "Female" = genderSeq >= 5000 ? "Male" : "Female";
  checks.push({
    name: "Gender Sequence (SSSS)",
    status: "pass",
    detail: `Sequence ${cleaned.substring(6, 10)} → ${derivedGender}`,
  });

  // 4. Gender cross-check (if metadata available)
  if (extractedGender) {
    const normalGender = extractedGender.toLowerCase().trim();
    const matches =
      (normalGender === "male" && derivedGender === "Male") ||
      (normalGender === "female" && derivedGender === "Female") ||
      (normalGender === "m" && derivedGender === "Male") ||
      (normalGender === "f" && derivedGender === "Female");
    checks.push({
      name: "Gender Cross-Check",
      status: matches ? "pass" : "fail",
      detail: matches
        ? `Extracted gender (${extractedGender}) matches ID-derived gender (${derivedGender})`
        : `Mismatch: extracted "${extractedGender}" but ID indicates ${derivedGender}`,
    });
    if (!matches) valid = false;
  }

  // 5. Citizenship indicator
  const citizenDigit = cleaned[10];
  const validCitizen = citizenDigit === "0" || citizenDigit === "1";
  const citizenship: "SA Citizen" | "Permanent Resident" =
    citizenDigit === "0" ? "SA Citizen" : "Permanent Resident";
  checks.push({
    name: "Citizenship Indicator",
    status: validCitizen ? "pass" : "fail",
    detail: validCitizen
      ? `Digit ${citizenDigit} → ${citizenship}`
      : `Invalid citizenship digit: ${citizenDigit} (expected 0 or 1)`,
  });
  if (!validCitizen) valid = false;

  // 6. Luhn checksum
  const luhnValid = luhnChecksum(cleaned);
  checks.push({
    name: "Luhn Checksum",
    status: luhnValid ? "pass" : "fail",
    detail: luhnValid
      ? "Checksum digit verified successfully"
      : "Checksum digit is incorrect — ID number may be invalid or misread",
  });
  if (!luhnValid) valid = false;

  return {
    valid,
    checks,
    dateOfBirth: dob.valid ? dob.dateStr : undefined,
    gender: derivedGender,
    citizenship: validCitizen ? citizenship : undefined,
  };
}
