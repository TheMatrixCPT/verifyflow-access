import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, FileSearch, Trash2 } from "lucide-react";
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

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero Section */}
      <section className="bg-pink">
        <div className="max-w-[800px] mx-auto px-8 py-16 text-center">
          <h1 className="text-[40px] font-bold text-space-kadet leading-[1.2] mb-4">
            Validate HR Documents in Seconds
          </h1>
          <p className="text-lg text-muted-foreground mb-8 max-w-[600px] mx-auto">
            Upload candidate documents, get instant AI validation, download reports. No login required.
          </p>
          <Button variant="hero" size="xl" onClick={() => setUploadOpen(true)}>
            <Upload className="h-5 w-5" />
            Start Validating Documents
          </Button>
          <p className="text-[13px] text-muted-foreground mt-4">
            Your data is retained until you choose to delete it
          </p>
        </div>
      </section>

      {/* Recent Sessions */}
      <section className="vf-section">
        <h2 className="text-2xl font-semibold text-space-kadet mb-8">Recent Validation Sessions</h2>

        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading sessions...</div>
        ) : sessions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity bg-card border border-border rounded-md p-1.5 hover:bg-error/10 hover:border-error/30"
                  title="Delete session"
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-error" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 max-w-[400px] mx-auto">
            <FileSearch className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-space-kadet mb-2">No validation sessions yet</h3>
            <p className="text-muted-foreground mb-6">Upload documents to get started</p>
            <Button variant="default" onClick={() => setUploadOpen(true)}>
              <Upload className="h-5 w-5" />
              Upload Documents
            </Button>
          </div>
        )}
      </section>

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onComplete={handleComplete} />
    </div>
  );
};

export default Index;
