import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, FileSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import SessionCard from "@/components/SessionCard";
import UploadModal from "@/components/UploadModal";

const Index = () => {
  const [uploadOpen, setUploadOpen] = useState(false);
  const navigate = useNavigate();

  const handleSessionClick = (id: string) => {
    navigate(`/session/${id}`);
  };

  const handleProcess = (name: string, files: File[]) => {
    console.log("Processing:", name, files.length, "files");
    navigate("/session/new");
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

        <div className="text-center py-16 max-w-[400px] mx-auto">
          <FileSearch className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-space-kadet mb-2">No validation sessions yet</h3>
          <p className="text-muted-foreground mb-6">Upload documents to get started</p>
          <Button variant="default" onClick={() => setUploadOpen(true)}>
            <Upload className="h-5 w-5" />
            Upload Documents
          </Button>
        </div>
      </section>

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onProcess={handleProcess} />
    </div>
  );
};

export default Index;
