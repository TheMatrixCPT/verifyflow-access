import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { Upload, Download, ChevronDown, Search, Users, CheckCircle, AlertTriangle, ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import CandidateCard from "@/components/CandidateCard";
import CandidateModal from "@/components/CandidateModal";
import UploadModal from "@/components/UploadModal";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSession, getCandidates, getDocuments, deleteCandidate } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import { generateReport, generateReportCsv } from "@/lib/generateReport";
import { calculateValidationScore } from "@/lib/validationScore";
import type { DocumentData, CandidateData } from "@/components/CandidateCard";

type FilterType = "all" | "pass" | "fail";

function effectiveStatus(doc: DocumentData): "pass" | "warning" | "fail" {
  return doc.overridden ? "pass" : doc.status;
}

function getDocumentsForFilter(documents: DocumentData[], filter: FilterType): DocumentData[] {
  if (filter === "all") return documents;
  if (filter === "pass") return documents.filter((d) => effectiveStatus(d) === "pass");
  // "fail" tab includes both fail and warning (non-overridden)
  return documents.filter((d) => {
    const s = effectiveStatus(d);
    return s === "fail" || s === "warning";
  });
}

function buildDocumentTypeLabel(documents: DocumentData[]): string {
  const uniqueDocumentTypes = Array.from(
    new Set(
      documents
        .map((doc) => doc.type?.trim())
        .filter((type): type is string => Boolean(type && type.length > 0 && type !== "Unknown"))
    )
  );

  return uniqueDocumentTypes.length > 0
    ? `Document Types: ${uniqueDocumentTypes.join(", ")}`
    : "Document Type: Unknown";
}

const SessionDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [replacementTarget, setReplacementTarget] = useState<{
    candidateId: string;
    candidateName: string;
    documentId: string;
    documentType: string;
    fileName: string;
  } | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateData | null>(null);
  const queryClient = useQueryClient();

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

  const candidatesWithDocs = useMemo(() => candidates.map((c) => {
    const candidateDocs = documents.filter((d) => d.candidate_id === c.id);
    const docData: DocumentData[] = candidateDocs.map((d) => ({
      id: d.id,
      candidateId: d.candidate_id || undefined,
      type: d.document_type || "Unknown",
      status: (d.validation_status as "pass" | "warning" | "fail") || "pass",
      fileName: d.file_name,
      filePath: d.file_path,
      confidence: Number(d.confidence_score) || 0,
      summary: (d.validation_details as any)?.summary || undefined,
      issues: d.issues && d.issues.length > 0 ? d.issues : undefined,
      checks: (d.validation_details as any)?.checks || undefined,
      extractedIdNumber: (d.validation_details as any)?.extracted_id_number || undefined,
      uploadedAt: d.created_at,
      stampDate: (d.validation_details as any)?.stamp_date || undefined,
      stampDateValid: (d.validation_details as any)?.stamp_date_valid ?? null,
      policeStation: (d.validation_details as any)?.police_station || undefined,
      certificationAuthority: (d.validation_details as any)?.certification_authority || undefined,
      extractedInfo: (d.validation_details as any)?.extracted_info || undefined,
      handwriting: (d.validation_details as any)?.handwriting || null,
      overridden: (d as any).overridden ?? false,
    }));

    // Calculate score dynamically from checks: passed / total * 100
    const allChecks = docData.flatMap((d) => d.checks || []);
    const dynamicScore = allChecks.length > 0 ? calculateValidationScore(allChecks) : (c.score || 0);
    return {
      id: c.id,
      name: c.name,
      idNumber: c.id_number || "N/A",
      primaryDocumentLabel: buildDocumentTypeLabel(docData),
      score: dynamicScore,
      status: (c.status as "pass" | "warning" | "fail") || "pass",
      documents: docData,
      summary: c.summary || "No summary available",
      issues: candidateDocs.flatMap((d) => d.issues || []).filter(Boolean),
    };
  }), [candidates, documents]);

  const filtered = useMemo(() => candidatesWithDocs
    .map((candidate) => {
      const visibleDocuments = getDocumentsForFilter(candidate.documents, filter);

      if (visibleDocuments.length === 0) return null;

      const visibleChecks = visibleDocuments.flatMap((document) => document.checks || []);
      const visibleIssues = visibleDocuments.flatMap((document) => document.issues || []).filter(Boolean);
      const hasFailure = visibleDocuments.some((document) => effectiveStatus(document) === "fail");
      const hasWarning = visibleDocuments.some((document) => effectiveStatus(document) === "warning");
      const visibleStatus = hasFailure ? "fail" : hasWarning ? "warning" : "pass";

      const result: CandidateData = {
        ...candidate,
        documents: visibleDocuments,
        primaryDocumentLabel: buildDocumentTypeLabel(visibleDocuments),
        score: visibleChecks.length > 0 ? calculateValidationScore(visibleChecks) : candidate.score,
        status: visibleStatus,
        issues: visibleIssues,
      };
      return result;
    })
    .filter((candidate): candidate is CandidateData => candidate !== null)
    .filter((candidate) => {
      const query = searchQuery.toLowerCase();
      return candidate.name.toLowerCase().includes(query) || candidate.idNumber.includes(searchQuery);
    }), [candidatesWithDocs, filter, searchQuery]);

  // Document-level counts (used by the "Documents X/Y" stat card)
  const allDocs = candidatesWithDocs.flatMap((c) => c.documents);
  const passedDocs = allDocs.filter((d) => effectiveStatus(d) === "pass").length;
  const failedDocs = allDocs.filter((d) => {
    const s = effectiveStatus(d);
    return s === "fail" || s === "warning";
  }).length;
  const totalDocs = allDocs.length;

  const sessionChecks = documents.flatMap((d) => ((d.validation_details as any)?.checks || []));
  const stats = {
    total: candidates.length,
    validated: candidates.filter((c) => c.status !== "fail").length,
    complete: calculateValidationScore(sessionChecks),
    issues: candidates.filter((c) => c.status !== "pass").length,
    docsPassed: passedDocs,
    docsFailed: failedDocs,
    docsTotal: totalDocs,
  };

  const handleDownloadReport = () => {
    if (candidatesWithDocs.length === 0) {
      toast.error("No data to download");
      return;
    }
    generateReport({
      sessionName: session?.name || "Report",
      sessionDate: session ? format(new Date(session.created_at), "dd MMM yyyy, HH:mm") : "",
      stats,
      candidates: candidatesWithDocs,
    });
    toast.success("PDF report downloaded");
  };

  const handleDownloadCsv = () => {
    if (candidatesWithDocs.length === 0) {
      toast.error("No data to download");
      return;
    }
    generateReportCsv({
      sessionName: session?.name || "Report",
      sessionDate: session ? format(new Date(session.created_at), "dd MMM yyyy, HH:mm") : "",
      stats,
      candidates: candidatesWithDocs,
    });
    toast.success("CSV report downloaded");
  };

  const handleDeleteCandidate = async (candidateId: string) => {
    try {
      await deleteCandidate(candidateId);
      queryClient.invalidateQueries({ queryKey: ["candidates", id] });
      queryClient.invalidateQueries({ queryKey: ["documents", id] });
      queryClient.invalidateQueries({ queryKey: ["session", id] });
      toast.success("Candidate deleted successfully");
    } catch (e) {
      toast.error("Failed to delete candidate");
    }
  };

  const handleUploadComplete = (sessionId: string) => {
    setUploadOpen(false);
    setReplacementTarget(null);
    queryClient.invalidateQueries({ queryKey: ["session", id] });
    queryClient.invalidateQueries({ queryKey: ["candidates", id] });
    queryClient.invalidateQueries({ queryKey: ["documents", id] });
  };

  const handleReplaceDocument = (candidate: CandidateData, doc: DocumentData) => {
    if (!doc.id || !candidate.id) {
      toast.error("This document cannot be replaced yet.");
      return;
    }

    setSelectedCandidate(null);
    setReplacementTarget({
      candidateId: candidate.id,
      candidateName: candidate.name,
      documentId: doc.id,
      documentType: doc.type,
      fileName: doc.fileName,
    });
    setUploadOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="vf-section">
        <Link to="/" className="inline-flex items-center gap-1.5 text-muted-foreground text-sm mb-4 hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </Link>

        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-[28px] font-bold text-foreground">{session?.name || "Loading..."}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {session ? format(new Date(session.created_at), "MMM d, yyyy 'at' HH:mm") : ""}
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4" /> Upload More
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="default" className="gap-2">
                  <Download className="h-4 w-4" />
                  <span>Download Report</span>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={4} className="w-[220px]">
                <DropdownMenuItem onSelect={handleDownloadReport}>Download as PDF</DropdownMenuItem>
                <DropdownMenuItem onSelect={handleDownloadCsv}>Download as CSV</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="vf-card flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple/10 flex items-center justify-center">
              <Users className="h-4 w-4 text-purple" />
            </div>
            <div>
              <p className="text-[22px] font-bold text-foreground leading-none">{stats.total}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Candidates</p>
            </div>
          </div>
          <div className="vf-card flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-success/10 flex items-center justify-center">
              <CheckCircle className="h-4 w-4 text-success" />
            </div>
            <div>
              <p className="text-[22px] font-bold text-foreground leading-none">{stats.validated}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Validated</p>
            </div>
          </div>
          <div className="vf-card flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple/10 flex items-center justify-center">
              <FileText className="h-4 w-4 text-purple" />
            </div>
            <div>
              {(() => {
                // Numerator/denominator + colors depend on the active filter
                const numerator =
                  filter === "pass" ? stats.docsPassed :
                  filter === "fail" ? stats.docsFailed :
                  stats.docsPassed;
                const denominator = stats.docsTotal;
                const numColor =
                  filter === "fail"
                    ? "text-error"
                    : numerator > 0
                      ? "text-success"
                      : "text-foreground";
                const denomColor =
                  filter === "all"
                    ? (stats.docsFailed > 0 ? "text-error" : "text-success")
                    : "text-muted-foreground";
                return (
                  <p className="text-[22px] font-bold leading-none">
                    <span className={numColor}>{numerator}</span>
                    <span className="text-muted-foreground"> / </span>
                    <span className={denomColor}>{denominator}</span>
                  </p>
                );
              })()}
              <p className="text-xs text-muted-foreground mt-0.5">
                {filter === "pass" ? "Documents validated" : filter === "fail" ? "Documents failed" : "Documents passed"}
              </p>
            </div>
          </div>
          <div className="vf-card flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-warning/10 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-warning" />
            </div>
            <div>
              <p className="text-[22px] font-bold text-foreground leading-none">{stats.issues}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Issues</p>
            </div>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="vf-card mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div className="relative w-[280px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input type="text" className="vf-input pl-10 h-10" placeholder="Search by name or ID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            {(["all", "pass", "fail"] as FilterType[]).map((f) => (
              <Button key={f} variant={filter === f ? "default" : "secondary"} size="sm" onClick={() => setFilter(f)}>
                {f === "all" ? "All" : f === "pass" ? "Validated" : "Failed"}
              </Button>
            ))}
            <span className="text-sm text-muted-foreground ml-2">Showing {filtered.length} candidates</span>
          </div>
        </div>

        {/* Candidates Grid */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-start">
            {filtered.map((candidate) => (
              <CandidateCard key={candidate.id} candidate={candidate} onClick={() => setSelectedCandidate(candidate)} onDelete={handleDeleteCandidate} />
            ))}
          </div>
        ) : candidates.length === 0 ? (
          <div className="text-center py-16">
            <Users className="h-14 w-14 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No candidates found</h3>
            <p className="text-muted-foreground text-sm">Documents are still being processed or no candidates were detected</p>
          </div>
        ) : (
          <div className="text-center py-16">
            <Search className="h-14 w-14 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No matches found</h3>
            <p className="text-muted-foreground text-sm">Try adjusting your search or filter criteria</p>
          </div>
        )}
      </div>

      <UploadModal
        open={uploadOpen}
        onClose={() => { setUploadOpen(false); setReplacementTarget(null); }}
        onComplete={handleUploadComplete}
        existingSessionId={id}
        replacementTarget={replacementTarget}
      />
      <CandidateModal
        candidate={selectedCandidate}
        open={!!selectedCandidate}
        onClose={() => setSelectedCandidate(null)}
        onReplaceDocument={handleReplaceDocument}
      />
    </div>
  );
};

export default SessionDetail;
