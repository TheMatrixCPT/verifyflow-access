import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Upload, Download, Search, Users, CheckCircle, AlertTriangle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import CandidateCard from "@/components/CandidateCard";
import { useQuery } from "@tanstack/react-query";
import { getSession, getCandidates, getDocuments } from "@/lib/api";
import { format } from "date-fns";
import type { DocumentData } from "@/components/CandidateCard";

type FilterType = "all" | "pass" | "warning" | "fail";

const SessionDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");

  const { data: session } = useQuery({
    queryKey: ["session", id],
    queryFn: () => getSession(id!),
    enabled: !!id,
  });

  const { data: candidates = [] } = useQuery({
    queryKey: ["candidates", id],
    queryFn: () => getCandidates(id!),
    enabled: !!id,
  });

  const { data: documents = [] } = useQuery({
    queryKey: ["documents", id],
    queryFn: () => getDocuments(id!),
    enabled: !!id,
  });

  const candidatesWithDocs = candidates.map((c) => {
    const candidateDocs = documents.filter((d) => d.candidate_id === c.id);
    const docData: DocumentData[] = candidateDocs.map((d) => ({
      type: d.document_type || "Unknown",
      status: (d.validation_status as "pass" | "warning" | "fail") || "pass",
      fileName: d.file_name,
      confidence: Number(d.confidence_score) || 0,
      summary: (d.validation_details as any)?.summary || undefined,
      issues: d.issues && d.issues.length > 0 ? d.issues : undefined,
    }));

    return {
      id: c.id,
      name: c.name,
      idNumber: c.id_number || "N/A",
      score: c.score || 0,
      status: (c.status as "pass" | "warning" | "fail") || "pass",
      documents: docData,
      summary: c.summary || "No summary available",
      issues: candidateDocs.flatMap((d) => d.issues || []).filter(Boolean),
    };
  });

  const filtered = candidatesWithDocs.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.idNumber.includes(searchQuery);
    const matchesFilter = filter === "all" || c.status === filter;
    return matchesSearch && matchesFilter;
  });

  const stats = {
    total: candidates.length,
    validated: candidates.filter((c) => c.status !== "fail").length,
    complete: candidates.length > 0 ? Math.round((candidates.filter((c) => c.status === "pass").length / candidates.length) * 100) : 0,
    issues: candidates.filter((c) => c.status !== "pass").length,
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="bg-space-kadet px-8 py-6">
        <div className="max-w-[1400px] mx-auto">
          <Link to="/" className="inline-flex items-center gap-1.5 text-primary-foreground/70 text-sm mb-3 hover:text-primary-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-primary-foreground">{session?.name || "Loading..."}</h1>
              <p className="text-primary-foreground/70 text-sm mt-1">
                {session ? format(new Date(session.created_at), "MMM d, yyyy 'at' HH:mm") : ""}
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground">
                <Upload className="h-4 w-4" /> Upload More
              </Button>
              <Button variant="hero">
                <Download className="h-4 w-4" /> Download Report
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-pink/30 border-b border-border">
        <div className="max-w-[1400px] mx-auto px-8 py-4 flex gap-8 flex-wrap">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-purple" />
            <span className="text-sm"><strong className="text-space-kadet">{stats.total}</strong> <span className="text-muted-foreground">Candidates</span></span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-success" />
            <span className="text-sm"><strong className="text-space-kadet">{stats.validated}</strong> <span className="text-muted-foreground">Validated</span></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm"><strong className="text-purple">{stats.complete}%</strong> <span className="text-muted-foreground">Pass Rate</span></span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <span className="text-sm"><strong className="text-space-kadet">{stats.issues}</strong> <span className="text-muted-foreground">Issues</span></span>
          </div>
        </div>
      </div>

      <div className="bg-card border-b border-border">
        <div className="max-w-[1400px] mx-auto px-8 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="relative w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input type="text" className="vf-input pl-10" placeholder="Search by name or ID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            {(["all", "pass", "warning", "fail"] as FilterType[]).map((f) => (
              <Button key={f} variant={filter === f ? "outline" : "secondary"} size="sm" onClick={() => setFilter(f)} className={filter === f ? "border-purple text-purple" : ""}>
                {f === "all" ? "All" : f === "pass" ? "Validated" : f === "warning" ? "Has Issues" : "Failed"}
              </Button>
            ))}
            <span className="text-sm text-muted-foreground ml-2">Showing {filtered.length} candidates</span>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-8 py-8">
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((candidate) => (
              <CandidateCard key={candidate.id} candidate={candidate} />
            ))}
          </div>
        ) : candidates.length === 0 ? (
          <div className="text-center py-16">
            <Users className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-space-kadet mb-2">No candidates found</h3>
            <p className="text-muted-foreground">Documents are still being processed or no candidates were detected</p>
          </div>
        ) : (
          <div className="text-center py-16">
            <Search className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-space-kadet mb-2">No matches found</h3>
            <p className="text-muted-foreground">Try adjusting your search or filter criteria</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionDetail;
