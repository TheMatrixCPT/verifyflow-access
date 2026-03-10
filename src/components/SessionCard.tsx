import { FileText, Users, CheckCircle, Clock, AlertTriangle } from "lucide-react";

interface SessionCardProps {
  id: string;
  name: string;
  timestamp: string;
  status: "complete" | "in-progress" | "has-issues";
  totalCandidates: number;
  validatedCandidates: number;
  progress: number;
  onClick: (id: string) => void;
}

const statusConfig = {
  complete: { label: "Verified", className: "vf-badge-success", icon: CheckCircle },
  "in-progress": { label: "Pending", className: "vf-badge-info", icon: Clock },
  "has-issues": { label: "Rejected", className: "vf-badge-error", icon: AlertTriangle },
};

const SessionCard = ({ id, name, timestamp, status, totalCandidates, validatedCandidates, progress, onClick }: SessionCardProps) => {
  const statusCfg = statusConfig[status];
  const StatusIcon = statusCfg.icon;

  return (
    <div className="vf-card vf-card-hover" onClick={() => onClick(id)}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple/10 flex items-center justify-center shrink-0">
            <FileText className="h-5 w-5 text-purple" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground leading-tight">{name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{timestamp}</p>
          </div>
        </div>
        <span className={statusCfg.className}>
          <StatusIcon className="h-3 w-3 mr-1" />
          {statusCfg.label}
        </span>
      </div>

      <div className="flex gap-6 text-sm">
        <div>
          <span className="text-muted-foreground">Documents: </span>
          <span className="font-semibold text-foreground">{totalCandidates}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Validated: </span>
          <span className="font-semibold text-purple">{validatedCandidates}</span>
        </div>
      </div>

      <div className="mt-4">
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-purple rounded-full transition-all duration-400 ease-in-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default SessionCard;
