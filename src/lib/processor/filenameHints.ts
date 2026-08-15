// Client-side filename parsing, mirroring the convention used by the
// process-document edge function (name_surname_IDno_doctype and variants).
import type { FilenameHints } from "./classify";

const SUFFIX_TO_DOCTYPE: Record<string, string> = {
  ba: "Beneficiary Agreement",
  beneficiaryagreement: "Beneficiary Agreement",
  bee: "Beneficiary Agreement",
  ftc: "Employment Contract FTC",
  employmentcontract: "Employment Contract FTC",
  fixedtermcontract: "Employment Contract FTC",
  offerletter: "Offer Letter",
  offerofemployment: "Offer Letter",
  offer: "Offer Letter",
  completioncertificate: "Certificate of Completion",
  certificateofcompletion: "Certificate of Completion",
  completion: "Certificate of Completion",
  certificate: "Certificate of Completion",
  bankletter: "Bank Letter",
  bankconfirmation: "Bank Letter",
  bankstatement: "Bank Letter",
  bank: "Bank Letter",
  proofofaddress: "Bank Letter",
  proofofresidence: "Bank Letter",
  addressproof: "Bank Letter",
  utilitybill: "Bank Letter",
  tcx: "TCX Unemployment Affidavit",
  unemploymentaffidavit: "Unemployment Affidavit",
  policeclearance: "Unemployment Affidavit",
  criminalrecord: "Unemployment Affidavit",
  saps: "Unemployment Affidavit",
  cellphoneaffidavit: "Cellphone Affidavit",
  cellphone: "Cellphone Affidavit",
  affidavit: "Unemployment Affidavit",
  eea1: "EEA1 Form",
  eea1form: "EEA1 Form",
  employmentequityform: "EEA1 Form",
  pwd: "PWDS Confirmation of Disability",
  pwds: "PWDS Confirmation of Disability",
  disability: "PWDS Confirmation of Disability",
  socialmediaconsent: "Social Media Consent",
  socialmedia: "Social Media Consent",
  mediaconsent: "Social Media Consent",
  consent: "Social Media Consent",
  cv: "CV",
  curriculumvitae: "CV",
  resume: "CV",
  declaration: "Capaciti Declaration",
  capacitideclaration: "Capaciti Declaration",
  attendanceregister: "Attendance Register",
  signinsheet: "Attendance Register",
  matric: "Qualification Matric",
  matriccertificate: "Qualification Matric",
  seniorcertificate: "Qualification Matric",
  nsc: "Qualification Matric",
  qualification: "Qualification Matric",
  degree: "Qualification Matric",
  diploma: "Qualification Matric",
  tax: "Tax Certificate",
  taxcertificate: "Tax Certificate",
  incometax: "Tax Certificate",
  irp5: "Tax Certificate",
  mie: "MIE Verification",
  mieverification: "MIE Verification",
  backgroundscreening: "MIE Verification",
  backgroundcheck: "MIE Verification",
  id: "Certified ID",
  certifiedid: "Certified ID",
  idcopy: "Certified ID",
  iddocument: "Certified ID",
  idcard: "Certified ID",
  passport: "Certified ID",
  smartid: "Certified ID",
};

function splitCamelCase(input: string): string {
  return input
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/\s+/g, " ");
}

function matchPartialSuffix(suffix: string): string | null {
  let bestKey = "";
  let bestVal: string | null = null;
  for (const [key, val] of Object.entries(SUFFIX_TO_DOCTYPE)) {
    if (suffix.includes(key) && key.length > bestKey.length) {
      bestKey = key;
      bestVal = val;
    }
  }
  return bestVal;
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function parseFilenameHints(fileName: string): FilenameHints {
  const base = fileName.replace(/\.[^.]+$/, "");
  const hints: FilenameHints = { candidateName: null, idNumber: null, documentType: null };

  const idMatch = base.match(/\b(\d{13})\b/);
  if (idMatch) hints.idNumber = idMatch[1];

  const tokens = base
    .split(/[_\-.\s]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  // Document type: scan tokens after the ID (or the trailing tokens).
  const idIndex = idMatch ? tokens.findIndex((token) => token.replace(/\D/g, "") === idMatch[1]) : -1;
  const tailTokens = idIndex >= 0 ? tokens.slice(idIndex + 1) : tokens.slice(1);
  const tailKey = tailTokens.join("").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (tailKey) {
    hints.documentType = SUFFIX_TO_DOCTYPE[tailKey] || matchPartialSuffix(tailKey);
  }
  if (!hints.documentType) {
    const wholeKey = base.toLowerCase().replace(/[^a-z0-9]/g, "");
    hints.documentType = matchPartialSuffix(wholeKey);
  }

  // Candidate name: tokens before the ID, or leading alphabetic tokens.
  const nameTokens = (idIndex > 0 ? tokens.slice(0, idIndex) : tokens.filter((t) => /^[A-Za-z]+$/.test(t)).slice(0, 2))
    .filter((token) => /^[A-Za-z][A-Za-z'\-]*$/.test(token));
  if (nameTokens.length > 0) {
    const spaced = nameTokens.map((token) => splitCamelCase(token)).join(" ").trim();
    const words = spaced.split(/\s+/).filter((word) => word.length > 1);
    if (words.length >= 1 && words.length <= 4) hints.candidateName = titleCase(words.join(" "));
  }

  return hints;
}
