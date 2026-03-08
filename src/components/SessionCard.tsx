import { FileText, Users } from "lucide-react";

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
  complete: { label: "Complete", className: "vf-badge-success" },
  "in-progress": { label: "In Progress", className: "vf-badge-info" },
  "has-issues": { label: "Has Issues", className: "vf-badge-warning" },
};

const SessionCard = ({ id, name, timestamp, status, totalCandidates, validatedCandidates, progress, onClick }: SessionCardProps) => {
  const statusCfg = statusConfig[status];

  return (
    <div className="vf-card vf-card-hover" onClick={() => onClick(id)}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-space-kadet">{name}</h3>
          <p className="text-[13px] text-muted-foreground mt-1">{timestamp}</p>
        </div>
        <span className={statusCfg.className}>{statusCfg.label}</span>
      </div>

      <div className="flex gap-4 mb-4">
        <div className="flex-1 bg-muted rounded-md p-3">
          <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground mb-1">
            <Users className="h-3.5 w-3.5" />
            Candidates
          </div>
          <div className="text-[28px] font-bold text-space-kadet leading-tight">{totalCandidates}</div>
        </div>
        <div className="flex-1 bg-muted rounded-md p-3">
          <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground mb-1">
            <FileText className="h-3.5 w-3.5" />
            Validated
          </div>
          <div className="text-[28px] font-bold text-purple leading-tight">{validatedCandidates}</div>
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between text-[13px] text-muted-foreground mb-2">
          <span>Progress</span>
          <span className="font-semibold text-space-kadet">{progress}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
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
