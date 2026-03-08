import { useState } from "react";
import { ChevronDown, CheckCircle, AlertTriangle, XCircle, FileText } from "lucide-react";

export interface CandidateData {
  id: string;
  name: string;
  idNumber: string;
  score: number;
  status: "pass" | "warning" | "fail";
  documents: { type: string; status: "pass" | "warning" | "fail" }[];
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
            ID: {candidate.idNumber.slice(0, 4)}••••{candidate.idNumber.slice(-2)}
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
        {candidate.documents.length}/{candidate.documents.length} documents
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-border animate-slide-down">
          {/* Documents */}
          <div className="mb-4">
            <p className="text-sm font-semibold text-space-kadet mb-2">Documents</p>
            <div className="flex flex-wrap gap-2">
              {candidate.documents.map((doc, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-md text-sm text-space-kadet"
                >
                  <span className={`w-2 h-2 rounded-full ${
                    doc.status === "pass" ? "bg-success" : doc.status === "warning" ? "bg-warning" : "bg-error"
                  }`} />
                  {doc.type}
                </span>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="bg-muted rounded-md p-3">
            <div className="flex items-start gap-2">
              <StatusIcon className={`h-5 w-5 mt-0.5 ${cfg.iconColor}`} />
              <p className="text-sm text-foreground">{candidate.summary}</p>
            </div>
          </div>

          {/* Issues */}
          {candidate.issues && candidate.issues.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-semibold text-space-kadet mb-1">Issues</p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                {candidate.issues.map((issue, i) => (
                  <li key={i}>{issue}</li>
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
