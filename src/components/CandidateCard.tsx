import { useState } from "react";
import { ChevronDown, CheckCircle, AlertTriangle, XCircle, FileText, Eye } from "lucide-react";

export interface DocumentData {
  type: string;
  status: "pass" | "warning" | "fail";
  fileName: string;
  confidence: number;
  summary?: string;
  issues?: string[];
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
                    <p className="text-xs text-muted-foreground mb-1 truncate">
                      <Eye className="h-3 w-3 inline mr-1" />{doc.fileName}
                    </p>
                    {doc.summary && (
                      <p className="text-sm text-foreground mt-2">{doc.summary}</p>
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
