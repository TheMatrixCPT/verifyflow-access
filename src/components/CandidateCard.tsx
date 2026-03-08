import { useState } from "react";
import { ChevronDown, CheckCircle, AlertTriangle, XCircle, FileText, Eye } from "lucide-react";

export interface DocumentCheck {
  name: string;
  status: "pass" | "warning" | "fail";
  detail: string;
}

export interface DocumentData {
  type: string;
  status: "pass" | "warning" | "fail";
  fileName: string;
  confidence: number;
  summary?: string;
  issues?: string[];
  checks?: DocumentCheck[];
  extractedIdNumber?: string;
  fileUrl?: string;
}

export interface CandidateData {
  id: string;
  name: string;
  idNumber: string;
  score: number;
  status: "pass" | "warning" | "fail";
  documents: DocumentData[];
  summary: string;
  issues?: string[];
}

const statusConfig = {
  pass: {
    border: "border-l-success",
    badge: "vf-badge-success",
    label: "Pass",
    icon: CheckCircle,
    iconColor: "text-success",
  },
  warning: {
    border: "border-l-warning",
    badge: "vf-badge-warning",
    label: "Warning",
    icon: AlertTriangle,
    iconColor: "text-warning",
  },
  fail: {
    border: "border-l-error",
    badge: "vf-badge-error",
    label: "Fail",
    icon: XCircle,
    iconColor: "text-error",
  },
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

const CandidateCard = ({ candidate }: { candidate: CandidateData }) => {
  const [expanded, setExpanded] = useState(false);
  const cfg = statusConfig[candidate.status];
  const StatusIcon = cfg.icon;

  return (
    <div
      className={`vf-card border-l-4 ${cfg.border} cursor-pointer transition-all duration-200 hover:shadow-[var(--shadow-card-hover)]`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-space-kadet">{candidate.name}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {candidate.idNumber !== "N/A" ? `ID: ${candidate.idNumber.slice(0, 4)}••••${candidate.idNumber.slice(-2)}` : "ID: Not extracted"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[32px] font-bold text-space-kadet leading-none">{candidate.score}%</div>
            <span className={cfg.badge}>{cfg.label}</span>
          </div>
          <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
        </div>
      </div>

      <div className="flex items-center gap-1.5 mt-3 text-sm text-muted-foreground">
        <FileText className="h-4 w-4" />
        {candidate.documents.length} document{candidate.documents.length !== 1 ? "s" : ""}
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-border animate-slide-down" onClick={(e) => e.stopPropagation()}>
          {/* Documents detail list */}
          <div className="mb-4">
            <p className="text-sm font-semibold text-space-kadet mb-3">Documents</p>
            <div className="space-y-3">
              {candidate.documents.map((doc, i) => {
                const docCfg = docStatusIcon[doc.status];
                const DocIcon = docCfg.icon;
                return (
                  <div key={i} className={`rounded-lg border border-border p-3 ${docCfg.bg}`}>
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <DocIcon className={`h-4 w-4 ${docCfg.color}`} />
                        <span className="text-sm font-semibold text-space-kadet">{doc.type}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{doc.confidence}% confidence</span>
                        <span className={statusConfig[doc.status].badge}>{statusConfig[doc.status].label}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-1 truncate flex items-center gap-1">
                      <Eye className="h-3 w-3 shrink-0" />
                      <span className="truncate">{doc.fileName}</span>
                      {doc.fileUrl && (
                        <a
                          href={doc.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-auto shrink-0 text-xs font-medium text-purple hover:text-purple/80 underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View Document
                        </a>
                      )}
                    </p>
                    {doc.summary && (
                      <p className="text-sm text-foreground mt-2">{doc.summary}</p>
                    )}

                    {/* Individual Validation Checks */}
                    {doc.checks && doc.checks.length > 0 && (
                      <div className="mt-3 bg-card rounded-md border border-border overflow-hidden">
                        <p className="text-xs font-semibold text-space-kadet px-3 py-1.5 bg-muted border-b border-border">
                          Validation Checks
                        </p>
                        <div className="divide-y divide-border">
                          {doc.checks.map((check, j) => {
                            const chk = checkStatusIcon[check.status as keyof typeof checkStatusIcon] || checkStatusIcon.warning;
                            const ChkIcon = chk.icon;
                            return (
                              <div key={j} className="flex items-start gap-2 px-3 py-2">
                                <ChkIcon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${chk.color}`} />
                                <div className="min-w-0">
                                  <span className="text-xs font-medium text-space-kadet">{check.name}</span>
                                  <p className="text-xs text-muted-foreground">{check.detail}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Extracted ID number */}
                    {doc.extractedIdNumber && (
                      <p className="text-xs text-muted-foreground mt-2">
                        <span className="font-medium text-space-kadet">Extracted ID:</span> {doc.extractedIdNumber}
                      </p>
                    )}

                    {doc.issues && doc.issues.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {doc.issues.map((issue, j) => (
                          <div key={j} className="flex items-start gap-1.5 text-sm text-error">
                            <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            <span>{issue}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Overall Summary */}
          <div className="bg-muted rounded-md p-3">
            <div className="flex items-start gap-2">
              <StatusIcon className={`h-5 w-5 mt-0.5 ${cfg.iconColor}`} />
              <div>
                <p className="text-sm font-semibold text-space-kadet mb-1">Overall Assessment</p>
                <p className="text-sm text-foreground">{candidate.summary}</p>
              </div>
            </div>
          </div>

          {/* All issues consolidated */}
          {candidate.issues && candidate.issues.length > 0 && (
            <div className="mt-3 bg-error/5 border border-error/20 rounded-md p-3">
              <p className="text-sm font-semibold text-error mb-2 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" />
                Issues Found ({candidate.issues.length})
              </p>
              <ul className="space-y-1">
                {candidate.issues.map((issue, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-sm text-foreground">
                    <span className="text-error mt-1.5">•</span>
                    <span>{issue}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CandidateCard;
