import { useState } from "react";
import { CheckCircle, AlertTriangle, XCircle, FileText, Eye, ExternalLink, Clock, Loader2, ChevronDown, User, Hash, Calendar, MapPin, Phone, Mail, Briefcase, GraduationCap, Building, ShieldCheck, Upload, Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import { formatDateToDayMonthYear, normalizeBirthDateText } from "@/lib/dateFormatting";
import type { CandidateData, DocumentData } from "@/components/CandidateCard";

const statusConfig = {
  pass: { badge: "vf-badge-success", label: "Pass", icon: CheckCircle, iconColor: "text-success" },
  warning: { badge: "vf-badge-warning", label: "Warning", icon: AlertTriangle, iconColor: "text-warning" },
  fail: { badge: "vf-badge-error", label: "Fail", icon: XCircle, iconColor: "text-error" },
};

const docStatusIcon = {
  pass: { icon: CheckCircle, color: "text-success", bg: "bg-success/10" },
  warning: { icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10" },
  fail: { icon: XCircle, color: "text-error", bg: "bg-error/10" },
};

const checkStatusIcon = {
  pass: { icon: CheckCircle, color: "text-success" },
  warning: { icon: AlertTriangle, color: "text-warning" },
  fail: { icon: XCircle, color: "text-error" },
};

interface ExtractedInfo {
  full_name?: string;
  id_number?: string;
  date_of_birth?: string;
  gender?: string;
  race?: string;
  nationality?: string;
  foreign_national?: boolean;
  foreign_national_support_date?: string;
  address?: string;
  phone_number?: string;
  email?: string;
  employer?: string;
  job_title?: string;
  qualification_name?: string;
  institution?: string;
  issue_date?: string;
  expiry_date?: string;
  reference_number?: string;
  signature_present?: boolean;
  additional_notes?: string;
}

const InfoRow = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | boolean | null }) => {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground min-w-[100px] shrink-0">{label}:</span>
      <span className="text-foreground font-medium">{typeof value === "boolean" ? (value ? "Yes" : "No") : value}</span>
    </div>
  );
};

const DocumentSection = ({ doc, onReplaceDocument, candidateName }: { doc: DocumentData; onReplaceDocument?: (doc: DocumentData) => void; candidateName?: string }) => {
  const [expanded, setExpanded] = useState(false);
  const [viewingDoc, setViewingDoc] = useState(false);
  const docCfg = docStatusIcon[doc.status as keyof typeof docStatusIcon] || docStatusIcon.warning;
  const DocIcon = docCfg.icon;

  const handleViewDocument = async (filePath: string) => {
    setViewingDoc(true);
    try {
      const { data, error } = await supabase.storage.from("documents").createSignedUrl(filePath, 600);
      if (error || !data?.signedUrl) {
        toast.error("Could not open document.");
        return;
      }
      window.open(data.signedUrl, "_blank");
    } catch {
      toast.error("Failed to open document");
    } finally {
      setViewingDoc(false);
    }
  };

  const handleDownloadPdf = async (candidateName: string, doc: DocumentData) => {
    try {
      // Get the file from storage
      if (!doc.filePath) {
        toast.error("Document file not found");
        return;
      }

      const { data: signedData, error: urlError } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.filePath, 60);

      if (urlError || !signedData?.signedUrl) {
        toast.error("Could not generate download link");
        return;
      }

      // Fetch the file as blob
      const response = await fetch(signedData.signedUrl);
      if (!response.ok) throw new Error("Failed to fetch file");
      const blob = await response.blob();

      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      
      // Generate filename: CandidateName_Surname_DocumentType.pdf
      const nameParts = candidateName.split(" ");
      const surname = nameParts.length > 1 ? nameParts.pop() : "";
      const firstName = nameParts.join(" ");
      const docTypeSanitized = doc.type.replace(/[^a-zA-Z0-9]/g, "_");
      link.download = `${firstName}_${surname}_${docTypeSanitized}.pdf`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Document downloaded");
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Failed to download document");
    }
  };

  const handleDownloadCsv = (candidateName: string, doc: DocumentData) => {
    try {
      // Generate filename: CandidateName_Surname_DocumentType.csv
      const nameParts = candidateName.split(" ");
      const surname = nameParts.length > 1 ? nameParts.pop() : "";
      const firstName = nameParts.join(" ");
      const docTypeSanitized = doc.type.replace(/[^a-zA-Z0-9]/g, "_");

      // Build CSV content
      const rows: string[] = [];
      
      // Header
      rows.push("Document Validation Report");
      rows.push("");
      
      // Document Info
      rows.push("Document Information");
      rows.push("Candidate Name," + candidateName);
      rows.push("Document Type," + doc.type);
      rows.push("File Name," + doc.fileName);
      rows.push("Status," + doc.status.toUpperCase());
      rows.push("Confidence Score," + doc.confidence + "%");
      rows.push("");
      
      // Validation Checks
      rows.push("Validation Checks");
      rows.push("Check Name,Status,Details");
      
      if (doc.checks && doc.checks.length > 0) {
        doc.checks.forEach(check => {
          rows.push(`"${check.name}","${check.status}","${check.detail}"`);
        });
      } else {
        rows.push("No detailed checks available");
      }
      
      rows.push("");
      
      // Issues (if any)
      if (doc.issues && doc.issues.length > 0) {
        rows.push("Issues");
        doc.issues.forEach(issue => {
          rows.push(`"${issue}"`);
        });
      } else {
        rows.push("Issues,None");
      }
      
      rows.push("");
      
      // Summary
      if (doc.summary) {
        rows.push("Summary");
        rows.push(`"${doc.summary.replace(/"/g, '""')}"`);
      }

      const csvContent = rows.join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${firstName}_${surname}_${docTypeSanitized}.csv`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("CSV report downloaded");
    } catch (error) {
      console.error("CSV download error:", error);
      toast.error("Failed to download CSV");
    }
  };

  const extractedInfo = doc.extractedInfo as ExtractedInfo | undefined;

  return (
    <div className={`rounded-lg border border-border ${docCfg.bg}`}>
      <div
        className="flex items-center justify-between p-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <DocIcon className={`h-4 w-4 shrink-0 ${docCfg.color}`} />
          <span className="text-sm font-semibold text-foreground truncate">{doc.type}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {(() => {
            const sc = statusConfig[doc.status as keyof typeof statusConfig] || statusConfig.warning;
            return <span className={sc.badge}>{sc.label}</span>;
          })()}
          {doc.status === "fail" && onReplaceDocument && (
            <button
              className="text-xs font-medium text-destructive hover:text-destructive/80 underline flex items-center gap-0.5"
              onClick={(e) => { e.stopPropagation(); onReplaceDocument(doc); }}
            >
              <Upload className="h-3 w-3" />
              Re-upload
            </button>
          )}
          {doc.filePath && (
            <button
              className="text-xs font-medium text-primary hover:text-primary/80 underline flex items-center gap-0.5"
              disabled={viewingDoc}
              onClick={(e) => { e.stopPropagation(); handleViewDocument(doc.filePath!); }}
            >
              {viewingDoc ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
              {viewingDoc ? "Opening..." : "View"}
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="text-xs font-medium text-purple hover:text-purple/80 flex items-center gap-0.5"
                onClick={(e) => e.stopPropagation()}
              >
                <Download className="h-3 w-3" />
                Download
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDownloadPdf(candidateName || "", doc); }}>
                <FileText className="h-4 w-4 mr-2" />
                PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDownloadCsv(candidateName || "", doc); }}>
                <FileText className="h-4 w-4 mr-2" />
                CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 border-t border-border/50 pt-2 space-y-3 animate-slide-down">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Eye className="h-3 w-3" />
            <span className="truncate">{doc.fileName}</span>
            {doc.uploadedAt && (
              <>
                <span>•</span>
                <Clock className="h-3 w-3" />
                <span>{format(new Date(doc.uploadedAt), "dd MMM yyyy 'at' HH:mm")}</span>
              </>
            )}
          </div>

          {doc.summary && <p className="text-sm text-foreground">{normalizeBirthDateText(doc.summary)}</p>}

          {extractedInfo && Object.values(extractedInfo).some((value) => value && value !== "") && (
            <div className="bg-card rounded-md border border-border p-3">
              <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Extracted Information
              </p>
              <div className="space-y-1.5">
                <InfoRow icon={User} label="Full Name" value={extractedInfo.full_name} />
                <InfoRow icon={Hash} label="ID Number" value={extractedInfo.id_number} />
                <InfoRow icon={Calendar} label="Date of Birth" value={formatDateToDayMonthYear(extractedInfo.date_of_birth)} />
                <InfoRow icon={User} label="Gender" value={extractedInfo.gender} />
                <InfoRow icon={Hash} label="Race" value={extractedInfo.race} />
                <InfoRow icon={ShieldCheck} label="Nationality" value={extractedInfo.nationality} />
                <InfoRow icon={ShieldCheck} label="Foreign National" value={extractedInfo.foreign_national} />
                <InfoRow icon={Calendar} label="Foreign National Date" value={formatDateToDayMonthYear(extractedInfo.foreign_national_support_date)} />
                <InfoRow icon={MapPin} label="Address" value={extractedInfo.address} />
                <InfoRow icon={Phone} label="Phone" value={extractedInfo.phone_number} />
                <InfoRow icon={Mail} label="Email" value={extractedInfo.email} />
                <InfoRow icon={Building} label="Employer" value={extractedInfo.employer} />
                <InfoRow icon={Briefcase} label="Job Title" value={extractedInfo.job_title} />
                <InfoRow icon={GraduationCap} label="Qualification" value={extractedInfo.qualification_name} />
                <InfoRow icon={Building} label="Institution" value={extractedInfo.institution} />
                <InfoRow icon={Calendar} label="Issue Date" value={formatDateToDayMonthYear(extractedInfo.issue_date)} />
                <InfoRow icon={Calendar} label="Expiry Date" value={formatDateToDayMonthYear(extractedInfo.expiry_date)} />
                <InfoRow icon={Hash} label="Reference #" value={extractedInfo.reference_number} />
                <InfoRow icon={FileText} label="Signature" value={extractedInfo.signature_present} />
                {extractedInfo.additional_notes && (
                  <p className="text-xs text-muted-foreground mt-1 italic">{extractedInfo.additional_notes}</p>
                )}
              </div>
            </div>
          )}

          {doc.handwriting && (
            <div className="bg-card rounded-md border border-border p-3">
              <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Handwriting Recognition
                <span className="ml-auto text-[10px] font-normal text-muted-foreground">Neural network pass</span>
              </p>
              <div className="space-y-1.5 text-xs">
                {(doc.handwriting.handwritten_name || doc.handwriting.handwritten_surname) && (
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground min-w-[110px]">Name (HW):</span>
                    <span className="text-foreground font-medium">
                      {[doc.handwriting.handwritten_name, doc.handwriting.handwritten_surname].filter(Boolean).join(" ")}
                    </span>
                    {doc.handwriting.field_confidences?.name != null && (
                      <span className="ml-auto text-[10px] text-muted-foreground">{doc.handwriting.field_confidences.name}%</span>
                    )}
                  </div>
                )}
                {doc.handwriting.handwritten_id_number && (
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground min-w-[110px]">ID No (HW):</span>
                    <span className="text-foreground font-medium font-mono">{doc.handwriting.handwritten_id_number}</span>
                    {doc.handwriting.field_confidences?.id_number != null && (
                      <span className="ml-auto text-[10px] text-muted-foreground">{doc.handwriting.field_confidences.id_number}%</span>
                    )}
                  </div>
                )}
                {Array.isArray(doc.handwriting.handwritten_dates) && doc.handwriting.handwritten_dates.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">Dates:</span>
                    <ul className="mt-1 ml-2 space-y-0.5">
                      {doc.handwriting.handwritten_dates.map((d: any, i: number) => (
                        <li key={i} className="text-foreground">
                          <span className="text-muted-foreground">{d.label}:</span> {formatDateToDayMonthYear(d.value_iso)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {Array.isArray(doc.handwriting.marks) && doc.handwriting.marks.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">Pen marks:</span>
                    <ul className="mt-1 ml-2 space-y-0.5">
                      {doc.handwriting.marks.map((m: any, i: number) => (
                        <li key={i} className="text-foreground">
                          {m.label} — <span className="font-medium">{m.kind}</span>
                          <span className="ml-1 text-[10px] text-muted-foreground">({m.confidence}%)</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {Array.isArray(doc.handwriting.signature_blocks) && doc.handwriting.signature_blocks.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">Signatures:</span>
                    <ul className="mt-1 ml-2 space-y-0.5">
                      {doc.handwriting.signature_blocks.map((s: any, i: number) => (
                        <li key={i} className="text-foreground">
                          {s.label}: <span className="font-medium">{s.present ? "present" : "missing"}</span>
                          <span className="ml-1 text-[10px] text-muted-foreground">({s.confidence}%)</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {Array.isArray(doc.handwriting.illegible_fields) && doc.handwriting.illegible_fields.length > 0 && (
                  <p className="text-warning italic">Illegible: {doc.handwriting.illegible_fields.join(", ")}</p>
                )}
              </div>
            </div>
          )}

          {(doc.stampDate || doc.policeStation || doc.certificationAuthority) && (
            <div className="bg-card rounded-md border border-border p-3">
              <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" /> Certification Details
              </p>
              <div className="space-y-1">
                {doc.stampDate && (
                  <p className="text-xs">
                    <span className="text-muted-foreground">Stamp Date:</span>{" "}
                    <span className={`font-medium ${doc.stampDateValid === false ? "text-destructive" : "text-success"}`}>
                      {doc.stampDate} {doc.stampDateValid === false ? "(Expired)" : doc.stampDateValid === true ? "(Valid)" : ""}
                    </span>
                  </p>
                )}
                {doc.policeStation && (
                  <p className="text-xs"><span className="text-muted-foreground">Police Station:</span> <span className="font-medium text-foreground">{doc.policeStation}</span></p>
                )}
                {doc.certificationAuthority && (
                  <p className="text-xs"><span className="text-muted-foreground">Certified By:</span> <span className="font-medium text-foreground">{doc.certificationAuthority}</span></p>
                )}
              </div>
            </div>
          )}

          {doc.checks && doc.checks.length > 0 && (
            <div className="bg-card rounded-md border border-border overflow-hidden">
              <p className="text-xs font-semibold text-foreground px-3 py-1.5 bg-muted border-b border-border">
                Validation Checks
              </p>
              <div className="divide-y divide-border">
                {doc.checks.map((check, index) => {
                  const checkConfig = checkStatusIcon[check.status as keyof typeof checkStatusIcon] || checkStatusIcon.warning;
                  const CheckIcon = checkConfig.icon;
                  return (
                    <div key={index} className="flex items-start gap-2 px-3 py-2">
                      <CheckIcon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${checkConfig.color}`} />
                      <div className="min-w-0">
                        <span className="text-xs font-medium text-foreground">{check.name}</span>
                        <p className="text-xs text-muted-foreground">{normalizeBirthDateText(check.detail)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {doc.issues && doc.issues.length > 0 && (
            <div className="space-y-1">
              {doc.issues.map((issue, index) => (
                <div key={index} className="flex items-start gap-1.5 text-sm text-destructive">
                  <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{issue}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface CandidateModalProps {
  candidate: CandidateData | null;
  open: boolean;
  onClose: () => void;
  onReplaceDocument?: (candidate: CandidateData, doc: DocumentData) => void;
}

const CandidateModal = ({ candidate, open, onClose, onReplaceDocument }: CandidateModalProps) => {
  if (!candidate) return null;

  const cfg = statusConfig[candidate.status as keyof typeof statusConfig] || statusConfig.warning;
  const secondaryLabel = candidate.primaryDocumentLabel || "Document Type: Unknown";

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogDescription className="sr-only">Candidate validation details and document review</DialogDescription>
          <div className="flex items-center justify-between pr-6">
            <div>
              <DialogTitle className="text-xl font-bold text-foreground">{candidate.name}</DialogTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                {secondaryLabel}
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-foreground leading-none">{candidate.score}%</div>
              <span className={cfg.badge}>{cfg.label}</span>
            </div>
          </div>
        </DialogHeader>

        {candidate.issues && candidate.issues.length > 0 && (
          <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4">
            <p className="text-sm font-semibold text-destructive mb-2 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" />
              Issues Found ({candidate.issues.length})
            </p>
            <ul className="space-y-1">
              {candidate.issues.map((issue, index) => (
                <li key={index} className="flex items-start gap-1.5 text-sm text-foreground">
                  <span className="text-destructive mt-1.5">•</span>
                  <span>{issue}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
            <FileText className="h-4 w-4" />
            Documents ({candidate.documents.length})
          </p>
          <div className="space-y-2">
            {candidate.documents.map((doc, index) => (
              <DocumentSection
                key={index}
                doc={doc}
                candidateName={candidate.name}
                onReplaceDocument={onReplaceDocument ? (selectedDoc) => onReplaceDocument(candidate, selectedDoc) : undefined}
              />
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CandidateModal;
