import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileArchive,
  FileText,
  Upload,
  Download,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  ArrowRight,
  ChevronDown,
  Wand2,
} from "lucide-react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  buildOutputZip,
  processStagedFiles,
  renamedFiles,
  stageFiles,
  stageZip,
  triggerDownload,
} from "@/lib/processor/pipeline";
import { downloadCandidateGroupedZip } from "@/lib/processor/grouping";
import { buildNewFileName, statusForMetadata } from "@/lib/processor/naming";
import ResolveDocumentDialog, { type ResolveResult } from "@/components/processor/ResolveDocumentDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { evaluateCertifiedId, type CertifiedIdCheckStatus } from "@/lib/processor/certifiedId";
import { STATUS_LABELS, type ProcessedFileRecord, type ProcessorMode, type ProcessorStatus } from "@/lib/processor/types";
import { createSession, uploadAndProcessFiles } from "@/lib/api";

const CHECK_STATUS_STYLES: Record<CertifiedIdCheckStatus, string> = {
  pass: "text-success bg-success/10",
  warning: "text-warning bg-warning/10",
  fail: "text-destructive bg-destructive/10",
  pending: "text-muted-foreground bg-muted",
};

const CHECK_STATUS_LABELS: Record<CertifiedIdCheckStatus, string> = {
  pass: "Passed",
  warning: "Review",
  fail: "Failed",
  pending: "Pending validation",
};


const STATUS_STYLES: Record<ProcessorStatus, { className: string; Icon: typeof CheckCircle2 }> = {
  queued: { className: "text-muted-foreground bg-muted", Icon: Loader2 },
  processing: { className: "text-info bg-info/10", Icon: Loader2 },
  renamed: { className: "text-success bg-success/10", Icon: CheckCircle2 },
  "partial-missing-id": { className: "text-warning bg-warning/10", Icon: AlertTriangle },
  "partial-missing-name": { className: "text-warning bg-warning/10", Icon: AlertTriangle },
  "extraction-failed": { className: "text-destructive bg-destructive/10", Icon: XCircle },
  "skipped-unsupported": { className: "text-muted-foreground bg-muted", Icon: XCircle },
};


const DocumentProcessor = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<ProcessorMode>("individual");
  const [records, setRecords] = useState<ProcessedFileRecord[]>([]);
  const [skipped, setSkipped] = useState<{ name: string; reason: string }[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [isSending, setIsSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [resolveId, setResolveId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);


  const summary = useMemo(() => {
    const renamed = records.filter((record) => record.status === "renamed").length;
    const partial = records.filter(
      (record) => record.status === "partial-missing-id" || record.status === "partial-missing-name",
    ).length;
    const failed = records.filter((record) => record.status === "extraction-failed").length;
    return { renamed, partial, failed, total: records.length };
  }, [records]);

  const run = async (files: File[]) => {
    if (files.length === 0) return;
    setIsRunning(true);
    setRecords([]);
    setSkipped([]);
    setProgress({ done: 0, total: 0 });

    try {
      let staged;
      let skippedEntries: { name: string; reason: string }[] = [];

      if (mode === "zip") {
        const archive = files.find((file) => file.name.toLowerCase().endsWith(".zip"));
        if (!archive) {
          toast.error("Please select a .zip archive for Folder mode.");
          return;
        }
        const result = await stageZip(archive);
        staged = result.staged;
        skippedEntries = result.skipped;
      } else {
        const result = stageFiles(files);
        staged = result.staged;
        skippedEntries = result.rejected;
      }

      setSkipped(skippedEntries);
      if (staged.length === 0) {
        toast.error("No supported documents were found in that selection.");
        return;
      }

      setProgress({ done: 0, total: staged.length });
      await processStagedFiles(staged, (record, done, total) => {
        setRecords((previous) => [...previous, record]);
        setProgress({ done, total });
      });
      toast.success(`Processed ${staged.length} document${staged.length === 1 ? "" : "s"}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Processing failed.");
    } finally {
      setIsRunning(false);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (isRunning) return;
    run(Array.from(event.dataTransfer.files));
  };

  const handleDownloadAll = async () => {
    try {
      await buildOutputZip(records, "renamed-documents.zip");
    } catch {
      toast.error("Could not build the download archive.");
    }
  };

  const handleDownloadGrouped = async () => {
    try {
      const result = await downloadCandidateGroupedZip(records, `Processed batch ${new Date().toLocaleDateString()}`);
      toast.success(`Exported ${result.files} document${result.files === 1 ? "" : "s"} across ${result.candidates} candidate folder${result.candidates === 1 ? "" : "s"}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not build the candidate archive.");
    }
  };

  const handleDownloadCsv = () => {
    const rows = [
      ["Original Name", "New Name", "Candidate Name", "ID Number", "Document Type", "Status"],
      ...records.map((record) => [
        record.originalName,
        record.newName || "",
        record.metadata?.candidateName || "",
        record.metadata?.idNumber || "",
        record.metadata?.documentType || "",
        STATUS_LABELS[record.status],
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), "processing-report.csv");
  };

  const knownCandidates = useMemo(() => {
    const map = new Map<string, { name: string; idNumber: string | null }>();
    for (const record of records) {
      const name = record.metadata?.candidateName?.trim();
      if (!name) continue;
      const idNumber = record.metadata?.idNumber?.trim() || null;
      map.set(`${name.toLowerCase()}|${idNumber || ""}`, { name, idNumber });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [records]);

  const resolveRecord = useMemo(() => records.find((record) => record.id === resolveId) ?? null, [records, resolveId]);

  const handleResolveSave = (recordId: string, result: ResolveResult) => {
    setRecords((previous) => {
      const usedNames = new Set(
        previous.filter((record) => record.id !== recordId && record.newName).map((record) => (record.newName as string).toLowerCase()),
      );
      return previous.map((record) => {
        if (record.id !== recordId) return record;
        const metadata = {
          candidateName: result.candidateName || null,
          candidateNameSource: "manual" as const,
          idNumber: result.idNumber || null,
          idNumberSource: "manual" as const,
          documentType: result.documentType,
          documentTypeSource: "manual" as const,
          matchBasis: ["resolved manually by staff"],
        };
        return {
          ...record,
          metadata,
          newName: buildNewFileName(record.originalName, metadata, usedNames),
          status: statusForMetadata(metadata),
          errorMessage: undefined,
        };
      });
    });
    setResolveId(null);
    toast.success("Document resolved and renamed.");
  };



  const handleSendToSession = async () => {
    const files = renamedFiles(records);
    if (files.length === 0) {
      toast.error("There are no renamed documents to send.");
      return;
    }
    setIsSending(true);
    try {
      const sessionName = `Processed batch — ${new Date().toLocaleString()}`;
      const sessionId = await createSession(sessionName);
      await uploadAndProcessFiles(
        sessionId,
        files.map((file) => ({ file })),
        () => {},
      );
      toast.success("Validation session created.");
      navigate(`/session/${sessionId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the validation session.");
    } finally {
      setIsSending(false);
    }
  };

  const reset = () => {
    setRecords([]);
    setSkipped([]);
    setProgress({ done: 0, total: 0 });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="vf-section">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-[28px] font-bold text-foreground">Document Processor</h1>
            <p className="text-muted-foreground mt-1">
              Read, identify and rename documents to the standard <span className="font-medium">Name_ID_Type</span> format
              before validation.
            </p>
          </div>
          {records.length > 0 && (
            <Button variant="outline" onClick={reset} disabled={isRunning}>
              <RotateCcw className="h-4 w-4" />
              Start over
            </Button>
          )}
        </div>

        {/* Mode selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {([
            { value: "individual", label: "Individual Files", hint: "Select one or more PDF, Word or image files", Icon: FileText },
            { value: "zip", label: "Folder (ZIP)", hint: "Upload a .zip archive of documents", Icon: FileArchive },
          ] as const).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setMode(option.value)}
              disabled={isRunning}
              className={`vf-card text-left flex items-start gap-3 transition-colors ${
                mode === option.value ? "border-purple ring-1 ring-purple" : "hover:border-purple/40"
              }`}
            >
              <option.Icon className={`h-5 w-5 mt-0.5 ${mode === option.value ? "text-purple" : "text-muted-foreground"}`} />
              <div>
                <p className="font-semibold text-foreground">{option.label}</p>
                <p className="text-sm text-muted-foreground">{option.hint}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Dropzone */}
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`vf-card border-dashed border-2 text-center py-12 mb-8 transition-colors ${
            dragging ? "border-purple bg-purple/5" : "border-border"
          }`}
        >
          <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-foreground font-medium">
            {mode === "zip" ? "Drop a .zip archive here" : "Drop documents here"}
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            {mode === "zip" ? "ZIP archives only" : "PDF, DOCX, JPG, PNG or TIF"}
          </p>
          <Button variant="default" onClick={() => fileInputRef.current?.click()} disabled={isRunning}>
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {isRunning ? `Processing ${progress.done}/${progress.total}…` : "Choose files"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple={mode === "individual"}
            accept={mode === "zip" ? ".zip" : ".pdf,.docx,.jpg,.jpeg,.png,.tif,.tiff"}
            onChange={(event) => {
              const files = Array.from(event.target.files || []);
              event.target.value = "";
              run(files);
            }}
          />
        </div>

        {/* Results */}
        {records.length > 0 && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {[
                { label: "Total files", value: summary.total },
                { label: "Renamed", value: summary.renamed },
                { label: "Partial matches", value: summary.partial },
                { label: "Failed", value: summary.failed },
              ].map((stat) => (
                <div key={stat.label} className="vf-card">
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-[28px] font-bold text-foreground mt-1">{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="vf-card p-0 overflow-hidden mb-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="text-left font-medium px-4 py-3">Original name</th>
                      <th className="text-left font-medium px-4 py-3">New name</th>
                      <th className="text-left font-medium px-4 py-3">Detected</th>
                      <th className="text-left font-medium px-4 py-3">Status</th>
                      <th className="text-right font-medium px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record) => {
                      const style = STATUS_STYLES[record.status];
                      return (
                        <tr key={record.id} className="border-t border-border align-top">
                          <td className="px-4 py-3 text-foreground break-all">{record.originalName}</td>
                          <td className="px-4 py-3 text-foreground break-all">
                            {record.newName || <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {record.metadata ? (
                              <div className="space-y-0.5">
                                <div>{record.metadata.candidateName || "Name not found"}</div>
                                <div>{record.metadata.idNumber || "ID not found"}</div>
                                <div>{record.metadata.documentType}</div>
                              </div>
                            ) : (
                              record.errorMessage || "—"
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${style.className}`}
                            >
                              <style.Icon className="h-3.5 w-3.5" />
                              {STATUS_LABELS[record.status]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button variant="ghost" size="sm" onClick={() => setResolveId(record.id)} disabled={isRunning}>
                              <Wand2 className="h-4 w-4" />
                              Resolve
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2" disabled={isRunning}>
                    <Download className="h-4 w-4" />
                    <span>Reports &amp; downloads</span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" sideOffset={4} className="w-[280px]">
                  <DropdownMenuItem onSelect={handleDownloadAll}>Download renamed files (ZIP)</DropdownMenuItem>
                  <DropdownMenuItem onSelect={handleDownloadGrouped}>Download all candidate documents (ZIP)</DropdownMenuItem>
                  <DropdownMenuItem onSelect={handleDownloadCsv}>Download processing report (CSV)</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="default" onClick={handleSendToSession} disabled={isRunning || isSending}>
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Send to validation session
              </Button>
            </div>

          </>
        )}

        {skipped.length > 0 && (
          <div className="vf-card mt-6">
            <p className="font-semibold text-foreground mb-2">Skipped files</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              {skipped.map((item) => (
                <li key={item.name}>
                  <span className="text-foreground break-all">{item.name}</span> — {item.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <ResolveDocumentDialog
        record={resolveRecord}
        knownCandidates={knownCandidates}
        onClose={() => setResolveId(null)}
        onSave={handleResolveSave}
      />
    </div>

  );
};

export default DocumentProcessor;
