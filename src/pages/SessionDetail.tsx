import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Upload, Download, Search, Users, CheckCircle, AlertTriangle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import CandidateCard, { type CandidateData } from "@/components/CandidateCard";

const demoCandidates: CandidateData[] = [
  {
    id: "1",
    name: "Sarah Johnson",
    idNumber: "8501015009083",
    score: 98,
    status: "pass",
    documents: [
      { type: "ID Document", status: "pass" },
      { type: "Qualification", status: "pass" },
      { type: "Proof of Address", status: "pass" },
      { type: "Tax Certificate", status: "pass" },
      { type: "Police Clearance", status: "pass" },
    ],
    summary: "All documents validated successfully. Candidate meets all compliance requirements.",
  },
  {
    id: "2",
    name: "Michael Chen",
    idNumber: "9203125018081",
    score: 72,
    status: "warning",
    documents: [
      { type: "ID Document", status: "pass" },
      { type: "Qualification", status: "pass" },
      { type: "Proof of Address", status: "warning" },
      { type: "Tax Certificate", status: "pass" },
      { type: "Police Clearance", status: "pass" },
    ],
    summary: "Proof of address document may be outdated. Recommend verification.",
    issues: ["Proof of address dated more than 3 months ago", "Address format does not match standard template"],
  },
  {
    id: "3",
    name: "Priya Patel",
    idNumber: "9506280135087",
    score: 45,
    status: "fail",
    documents: [
      { type: "ID Document", status: "pass" },
      { type: "Qualification", status: "fail" },
      { type: "Proof of Address", status: "pass" },
      { type: "Tax Certificate", status: "fail" },
      { type: "Police Clearance", status: "warning" },
    ],
    summary: "Multiple documents failed validation. Qualification certificate appears invalid.",
    issues: [
      "Qualification certificate institution not recognized",
      "Tax certificate number format invalid",
      "Police clearance expiring within 30 days",
    ],
  },
  {
    id: "4",
    name: "James Williams",
    idNumber: "8812045028086",
    score: 95,
    status: "pass",
    documents: [
      { type: "ID Document", status: "pass" },
      { type: "Qualification", status: "pass" },
      { type: "Proof of Address", status: "pass" },
      { type: "Tax Certificate", status: "pass" },
    ],
    summary: "All submitted documents validated. One optional document not provided but not required.",
  },
  {
    id: "5",
    name: "Fatima Al-Hassan",
    idNumber: "9107190044082",
    score: 88,
    status: "pass",
    documents: [
      { type: "ID Document", status: "pass" },
      { type: "Qualification", status: "pass" },
      { type: "Proof of Address", status: "pass" },
      { type: "Tax Certificate", status: "pass" },
      { type: "Police Clearance", status: "pass" },
    ],
    summary: "All documents validated. Minor formatting inconsistency in qualification but content verified.",
  },
  {
    id: "6",
    name: "David Nkosi",
    idNumber: "9405015037089",
    score: 62,
    status: "warning",
    documents: [
      { type: "ID Document", status: "pass" },
      { type: "Qualification", status: "warning" },
      { type: "Proof of Address", status: "pass" },
      { type: "Tax Certificate", status: "warning" },
    ],
    summary: "Some documents have low confidence scores. Manual review recommended.",
    issues: ["Qualification image quality too low for reliable OCR", "Tax certificate partially obscured"],
  },
];

type FilterType = "all" | "pass" | "warning" | "fail";

const SessionDetail = () => {
  const { id } = useParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");

  const filtered = demoCandidates.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.idNumber.includes(searchQuery);
    const matchesFilter = filter === "all" || c.status === filter;
    return matchesSearch && matchesFilter;
  });

  const stats = {
    total: demoCandidates.length,
    validated: demoCandidates.filter((c) => c.status !== "fail").length,
    complete: Math.round((demoCandidates.filter((c) => c.status === "pass").length / demoCandidates.length) * 100),
    issues: demoCandidates.filter((c) => c.status !== "pass").length,
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Page Header */}
      <div className="bg-space-kadet px-8 py-6">
        <div className="max-w-[1400px] mx-auto">
          <Link to="/" className="inline-flex items-center gap-1.5 text-primary-foreground/70 text-sm mb-3 hover:text-primary-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-primary-foreground">Graduate Program 2025 Batch 1</h1>
              <p className="text-primary-foreground/70 text-sm mt-1">Mar 7, 2026 at 14:32</p>
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

      {/* Stats Bar */}
      <div className="bg-pink/30 border-b border-border">
        <div className="max-w-[1400px] mx-auto px-8 py-4 flex gap-8">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-purple" />
            <span className="text-sm"><strong className="text-space-kadet">{stats.total}</strong> <span className="text-muted-foreground">Candidates</span></span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-success" />
            <span className="text-sm"><strong className="text-space-kadet">{stats.validated}</strong> <span className="text-muted-foreground">Validated</span></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm"><strong className="text-purple">{stats.complete}%</strong> <span className="text-muted-foreground">Complete</span></span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <span className="text-sm"><strong className="text-space-kadet">{stats.issues}</strong> <span className="text-muted-foreground">Issues</span></span>
          </div>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="bg-card border-b border-border">
        <div className="max-w-[1400px] mx-auto px-8 py-4 flex items-center justify-between gap-4">
          <div className="relative w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              className="vf-input pl-10"
              placeholder="Search by name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            {(["all", "pass", "warning", "fail"] as FilterType[]).map((f) => (
              <Button
                key={f}
                variant={filter === f ? "outline" : "secondary"}
                size="sm"
                onClick={() => setFilter(f)}
                className={filter === f ? "border-purple text-purple" : ""}
              >
                {f === "all" ? "All" : f === "pass" ? "Validated" : f === "warning" ? "Has Issues" : "Failed"}
              </Button>
            ))}
            <span className="text-sm text-muted-foreground ml-2">Showing {filtered.length} candidates</span>
          </div>
        </div>
      </div>

      {/* Candidates Grid */}
      <div className="max-w-[1400px] mx-auto px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((candidate) => (
            <CandidateCard key={candidate.id} candidate={candidate} />
          ))}
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-16">
            <Search className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-space-kadet mb-2">No candidates found</h3>
            <p className="text-muted-foreground">Try adjusting your search or filter criteria</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionDetail;
