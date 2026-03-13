import { useState } from "react";
import { CheckCircle, AlertTriangle, XCircle, FileText, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  filePath?: string;
  uploadedAt?: string;
  stampDate?: string;
  stampDateValid?: boolean | null;
  policeStation?: string;
  certificationAuthority?: string;
  extractedInfo?: Record<string, any>;
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
  pass: { border: "border-l-success", badge: "vf-badge-success", label: "Pass", icon: CheckCircle, iconColor: "text-success" },
  warning: { border: "border-l-warning", badge: "vf-badge-warning", label: "Warning", icon: AlertTriangle, iconColor: "text-warning" },
  fail: { border: "border-l-error", badge: "vf-badge-error", label: "Fail", icon: XCircle, iconColor: "text-error" },
};

interface CandidateCardProps {
  candidate: CandidateData;
  onClick: () => void;
}

const CandidateCard = ({ candidate, onClick }: CandidateCardProps) => {
  const cfg = statusConfig[candidate.status];

  return (
    <div
      className={`vf-card border-l-4 ${cfg.border} cursor-pointer transition-all duration-200 hover:shadow-[var(--shadow-card-hover)]`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{candidate.name}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {candidate.idNumber !== "N/A" ? `ID: ${candidate.idNumber.slice(0, 4)}••••${candidate.idNumber.slice(-2)}` : "ID: Not extracted"}
          </p>
        </div>
        <div className="text-right">
          <div className="text-[32px] font-bold text-foreground leading-none">{candidate.score}%</div>
          <span className={cfg.badge}>{cfg.label}</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mt-3 text-sm text-muted-foreground">
        <FileText className="h-4 w-4" />
        {candidate.documents.length} document{candidate.documents.length !== 1 ? "s" : ""}
      </div>

      {candidate.issues && candidate.issues.length > 0 && (
        <div className="flex items-center gap-1.5 mt-1 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" />
          {candidate.issues.length} issue{candidate.issues.length !== 1 ? "s" : ""} found
        </div>
      )}
    </div>
  );
};

export default CandidateCard;
