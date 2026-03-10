import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, FileSearch, Trash2, FileText, CheckCircle, Clock, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import SessionCard from "@/components/SessionCard";
import UploadModal from "@/components/UploadModal";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSessions, deleteSession } from "@/lib/api";
import { toast } from "sonner";
import { format } from "date-fns";

const Index = () => {
  const [uploadOpen, setUploadOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: getSessions,
  });

  const handleSessionClick = (id: string) => {
    navigate(`/session/${id}`);
  };

  const handleComplete = (sessionId: string) => {
    setUploadOpen(false);
    queryClient.invalidateQueries({ queryKey: ["sessions"] });
    navigate(`/session/${sessionId}`);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this session and all its data?")) return;
    try {
      await deleteSession(id);
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Session deleted");
    } catch {
      toast.error("Failed to delete session");
    }
  };

  // Compute dashboard stats
  const totalDocs = sessions.reduce((sum, s) => sum + s.total_documents, 0);
  const processedDocs = sessions.reduce((sum, s) => sum + s.processed_documents, 0);
  const pendingDocs = totalDocs - processedDocs;
  const successRate = totalDocs > 0 ? ((processedDocs / totalDocs) * 100).toFixed(1) : "0";

  const statCards = [
    { label: "Total Documents", value: totalDocs, icon: FileText, color: "text-purple", bgColor: "bg-purple/10" },
    { label: "Verified", value: processedDocs, icon: CheckCircle, color: "text-success", bgColor: "bg-success/10" },
    { label: "Pending", value: pendingDocs, icon: Clock, color: "text-warning", bgColor: "bg-warning/10" },
    { label: "Success Rate", value: `${successRate}%`, icon: TrendingUp, color: "text-info", bgColor: "bg-info/10" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="vf-section">
        {/* Dashboard Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-[28px] font-bold text-foreground">Dashboard Overview</h1>
            <p className="text-muted-foreground mt-1">Monitor your document verification activities</p>
          </div>
          <Button variant="default" onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4" />
            Upload Documents
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {statCards.map((stat) => (
            <div key={stat.label} className="vf-card flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="text-[28px] font-bold text-foreground mt-1">{stat.value}</p>
              </div>
              <div className={`w-10 h-10 rounded-xl ${stat.bgColor} flex items-center justify-center`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
            </div>
          ))}
        </div>

        {/* Recent Sessions */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[20px] font-semibold text-foreground">Recent Validation Sessions</h2>
          {sessions.length > 0 && (
            <button className="text-sm font-medium text-purple hover:underline">View All</button>
          )}
        </div>

        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading sessions...</div>
        ) : sessions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {sessions.map((session) => (
              <div key={session.id} className="relative group">
                <SessionCard
                  id={session.id}
                  name={session.name}
                  timestamp={format(new Date(session.created_at), "MMM d, yyyy 'at' HH:mm")}
                  status={(session.status as "complete" | "in-progress" | "has-issues") || "in-progress"}
                  totalCandidates={session.total_documents}
                  validatedCandidates={session.processed_documents}
                  progress={session.total_documents > 0 ? Math.round((session.processed_documents / session.total_documents) * 100) : 0}
                  onClick={handleSessionClick}
                />
                <button
                  onClick={(e) => handleDelete(session.id, e)}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity bg-card border border-border rounded-lg p-1.5 hover:bg-error/10 hover:border-error/30"
                  title="Delete session"
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-error" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="vf-card text-center py-16 max-w-[400px] mx-auto">
            <FileSearch className="h-14 w-14 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No validation sessions yet</h3>
            <p className="text-muted-foreground mb-6 text-sm">Upload documents to get started</p>
            <Button variant="default" onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4" />
              Upload Documents
            </Button>
          </div>
        )}
      </div>

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onComplete={handleComplete} />
    </div>
  );
};

export default Index;
