import { useState, useCallback, useEffect, useRef } from "react";
import { X, Upload, FileText, Loader2, AlertTriangle, Users, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createSession,
  uploadAndProcessFiles,
  checkDuplicateFiles,
  checkCrossCohortCandidates,
  checkSessionUploadConflicts,
  type UploadConflict,
  type UploadFileInstruction,
} from "@/lib/api";
import {
  collectFilesFromDataTransfer,
  collectFilesFromInput,
  fallbackFromPlainFiles,
  isAllowedFile,
  type FileWithPath,
} from "@/lib/folderUpload";
import { toast } from "sonner";
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

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: (sessionId: string) => void;
  existingSessionId?: string;
  replacementTarget?: {
    candidateId: string;
    candidateName: string;
    documentId: string;
    documentType: string;
    fileName: string;
  } | null;
}

interface DuplicateInfo {
  fileName: string;
  existingUploadedAt: string;
}

interface CrossCohortMatch {
  candidateName: string;
  existingSessionName: string;
  existingSessionId: string;
}

const UploadModal = ({ open, onClose, onComplete, existingSessionId, replacementTarget }: UploadModalProps) => {
  const [sessionName, setSessionName] = useState("");
  const [sessionNameError, setSessionNameError] = useState("");
  const [files, setFiles] = useState<FileWithPath[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ processed: 0, total: 0 });
  const [duplicates, setDuplicates] = useState<DuplicateInfo[]>([]);
  const [uploadConflicts, setUploadConflicts] = useState<UploadConflict[]>([]);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<FileWithPath[]>([]);
  const [pendingInstructions, setPendingInstructions] = useState<UploadFileInstruction[]>([]);
  const [crossCohortMatches, setCrossCohortMatches] = useState<CrossCohortMatch[]>([]);
  const [showCrossCohortDialog, setShowCrossCohortDialog] = useState(false);
  const [pendingReplaceFlag, setPendingReplaceFlag] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (replacementTarget) {
      setFiles([]);
      setPendingFiles([]);
      setPendingInstructions([]);
      setDuplicates([]);
      setUploadConflicts([]);
      setShowDuplicateDialog(false);
    }
  }, [replacementTarget]);

  const reportSkipped = (originalCount: number, kept: FileWithPath[]) => {
    const skipped = originalCount - kept.length;
    if (skipped > 0) {
      toast.info(`${skipped} file${skipped !== 1 ? "s" : ""} skipped: unsupported type or hidden`);
    }
  };

  const addFiles = (incoming: FileWithPath[], originalCount: number) => {
    reportSkipped(originalCount, incoming);
    if (incoming.length === 0) return;
    setFiles((prev) => (replacementTarget ? incoming.slice(0, 1) : [...prev, ...incoming]));
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const items = e.dataTransfer.items;
    let collected: FileWithPath[] = [];
    let originalCount = 0;
    if (items && items.length && (items[0] as unknown as { webkitGetAsEntry?: () => unknown }).webkitGetAsEntry) {
      collected = await collectFilesFromDataTransfer(items);
      originalCount = e.dataTransfer.files.length || collected.length;
    } else {
      const dropped = Array.from(e.dataTransfer.files);
      originalCount = dropped.length;
      collected = fallbackFromPlainFiles(dropped);
    }
    addFiles(replacementTarget ? collected.slice(0, 1) : collected, originalCount);
  }, [replacementTarget]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const original = e.target.files.length;
    const collected = collectFilesFromInput(e.target.files);
    addFiles(collected, original);
    e.target.value = "";
  };

  const handleFolderInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const original = e.target.files.length;
    const collected = collectFilesFromInput(e.target.files);
    addFiles(collected, original);
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const buildInstructions = (filesToProcess: FileWithPath[], replaceExisting: boolean): UploadFileInstruction[] => {
    if (replacementTarget) {
      const first = filesToProcess[0];
      if (!first) return [];

      return [{
        file: first.file,
        targetCandidateId: replacementTarget.candidateId,
        replacementDocumentId: replacementTarget.documentId,
        inferredDocumentType: replacementTarget.documentType,
        matchedCandidateName: replacementTarget.candidateName,
      }];
    }

    return filesToProcess.map((entry) => {
      const conflict = uploadConflicts.find((item) => item.fileName === entry.file.name);
      // Folder hint biases grouping when AI extraction is ambiguous; conflict
      // match (an existing candidate already in the session) always wins.
      const matchedCandidateName = conflict?.candidateName || entry.folderHint || undefined;
      return {
        file: entry.file,
        targetCandidateId: conflict?.candidateId,
        replacementDocumentId: replaceExisting ? conflict?.existingDocumentId : undefined,
        inferredDocumentType: conflict?.inferredDocumentType,
        matchedCandidateName,
      };
    });
  };

  const processFiles = async (filesToProcess: File[], replaceExisting: boolean) => {
    setIsProcessing(true);
    setShowDuplicateDialog(false);
    setShowCrossCohortDialog(false);
    setProgress({ processed: 0, total: filesToProcess.length });

    try {
      let sessionId: string;
      if (existingSessionId) {
        sessionId = existingSessionId;
      } else {
        if (!sessionName.trim()) {
          setSessionNameError("Session name is required");
          setIsProcessing(false);
          return;
        }
        sessionId = await createSession(sessionName.trim());
      }

      const instructions = pendingInstructions.length > 0 ? pendingInstructions : buildInstructions(filesToProcess, replaceExisting);
      await uploadAndProcessFiles(sessionId, instructions, (processed, total) => {
        setProgress({ processed, total });
      }, replaceExisting);

      toast.success(`Successfully processed ${filesToProcess.length} documents`);
      setSessionName("");
      setSessionNameError("");
      setFiles([]);
      setPendingFiles([]);
      setPendingInstructions([]);
      setDuplicates([]);
      setUploadConflicts([]);
      setCrossCohortMatches([]);
      setIsProcessing(false);
      setProgress({ processed: 0, total: 0 });
      onComplete(sessionId);
    } catch (error) {
      console.error("Processing error:", error);
      toast.error("An error occurred while processing documents");
      setIsProcessing(false);
    }
  };

  const proceedAfterCrossCohortCheck = async (filesToProcess: File[], replaceExisting: boolean) => {
    if (replacementTarget) {
      await processFiles(filesToProcess, replaceExisting);
      return;
    }

    // Check cross-cohort candidates
    const matches = await checkCrossCohortCandidates(
      existingSessionId,
      filesToProcess.map(f => f.name)
    );

    if (matches.length > 0) {
      setCrossCohortMatches(matches);
      setPendingFiles(filesToProcess);
      setPendingInstructions(buildInstructions(filesToProcess, replaceExisting));
      setPendingReplaceFlag(replaceExisting);
      setShowCrossCohortDialog(true);
      return;
    }

    await processFiles(filesToProcess, replaceExisting);
  };

  const handleProcess = async () => {
    if (files.length === 0) return;

    // Validate session name for new sessions
    if (!existingSessionId && !sessionName.trim()) {
      setSessionNameError("Session name is required");
      return;
    }
    setSessionNameError("");

    // Check for duplicates if uploading to existing session
    if (replacementTarget) {
      if (files.length > 1) {
        toast.error("Please upload one replacement document at a time.");
        return;
      }
      setPendingInstructions(buildInstructions(files, true));
      await proceedAfterCrossCohortCheck(files, true);
      return;
    }

    if (existingSessionId) {
      const conflicts = await checkSessionUploadConflicts(existingSessionId, files);
      setUploadConflicts(conflicts);

      const fileNames = files.map(f => f.name);
      const dupes = await checkDuplicateFiles(existingSessionId, fileNames);
      const typeConflicts = conflicts
        .filter((conflict) => conflict.existingDocumentId)
        .map((conflict) => ({
          fileName: conflict.fileName,
          existingUploadedAt: conflict.existingUploadedAt || "",
        }));

      if (dupes.length > 0 || typeConflicts.length > 0) {
        setDuplicates([...dupes, ...typeConflicts.filter((conflict) => !dupes.some((dupe) => dupe.fileName === conflict.fileName))]);
        setPendingFiles(files);
        setPendingInstructions(buildInstructions(files, false));
        setShowDuplicateDialog(true);
        return;
      }
    } else {
      setUploadConflicts([]);
    }

    setPendingInstructions(buildInstructions(files, false));
    await proceedAfterCrossCohortCheck(files, false);
  };

  const handleReplace = () => {
    setShowDuplicateDialog(false);
    setPendingInstructions(buildInstructions(pendingFiles, true));
    proceedAfterCrossCohortCheck(pendingFiles, true);
  };

  const handleKeepBoth = () => {
    setShowDuplicateDialog(false);
    setPendingInstructions(buildInstructions(pendingFiles, false));
    proceedAfterCrossCohortCheck(pendingFiles, false);
  };

  const handleCrossCohortContinue = () => {
    setShowCrossCohortDialog(false);
    processFiles(pendingFiles, pendingReplaceFlag);
  };

  const handleCrossCohortCancel = () => {
    setShowCrossCohortDialog(false);
    setPendingFiles([]);
    setPendingInstructions([]);
    setCrossCohortMatches([]);
    setPendingReplaceFlag(false);
  };

  if (!open) return null;

  const progressPercent = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={!isProcessing && !showDuplicateDialog ? onClose : undefined}>
        <div className="absolute inset-0 bg-space-kadet/50 backdrop-blur-[4px]" />
        <div
          className="relative bg-card rounded-xl p-8 max-w-[700px] w-full mx-4 max-h-[90vh] overflow-y-auto"
          style={{ boxShadow: "var(--shadow-modal)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Duplicate Dialog */}
          {showDuplicateDialog && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-border">
                <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-space-kadet">Existing Documents Found</h2>
                  <p className="text-sm text-muted-foreground">{duplicates.length} file{duplicates.length !== 1 ? "s" : ""} match existing candidate documents in this session</p>
                </div>
              </div>

              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {duplicates.map((d, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border border-border">
                    <FileText className="h-5 w-5 text-warning shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-space-kadet truncate">{d.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        Already uploaded on {new Date(d.existingUploadedAt).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                      {uploadConflicts.find((conflict) => conflict.fileName === d.fileName)?.candidateName && (
                        <p className="text-xs text-muted-foreground">
                          Candidate: <span className="font-medium text-foreground">{uploadConflicts.find((conflict) => conflict.fileName === d.fileName)?.candidateName}</span>
                          {uploadConflicts.find((conflict) => conflict.fileName === d.fileName)?.inferredDocumentType ? ` • Type: ${uploadConflicts.find((conflict) => conflict.fileName === d.fileName)?.inferredDocumentType}` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-3 pt-4 border-t border-border">
                <Button variant="default" onClick={handleReplace} className="w-full">
                  Replace Matching Documents
                </Button>
                <Button variant="secondary" onClick={handleKeepBoth} className="w-full">
                  Keep Both Versions
                </Button>
                <Button variant="outline" onClick={() => { setShowDuplicateDialog(false); setPendingFiles([]); setDuplicates([]); }} className="w-full">
                  Cancel Upload
                </Button>
              </div>
            </div>
          )}

          {/* Processing State */}
          {isProcessing && !showDuplicateDialog && (
            <div className="py-8 text-center">
              <Loader2 className="h-12 w-12 text-purple mx-auto mb-4 animate-spin" />
              <h3 className="text-lg font-semibold text-space-kadet mb-2">Processing Documents...</h3>
              <p className="text-muted-foreground mb-6">
                AI is analyzing {progress.total} documents — extracting names and document types automatically.
              </p>
              <div className="max-w-md mx-auto">
                <div className="flex justify-between text-sm text-muted-foreground mb-2">
                  <span>Processing {progress.processed} of {progress.total} documents</span>
                  <span className="font-semibold text-space-kadet">{progressPercent}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-purple rounded-full transition-all duration-500 ease-in-out" style={{ width: `${progressPercent}%` }} />
                </div>
              </div>
            </div>
          )}

          {/* Normal Upload State */}
          {!isProcessing && !showDuplicateDialog && (
            <>
              <div className="flex items-center justify-between pb-6 mb-6 border-b border-border">
                <h2 className="text-2xl font-bold text-space-kadet">{replacementTarget ? "Re-upload Failed Document" : "Upload Documents"}</h2>
                <Button variant="icon" size="icon" onClick={onClose}>
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {replacementTarget && (
                <div className="mb-6 rounded-lg border border-warning/30 bg-warning/5 p-4">
                  <p className="text-sm font-semibold text-foreground">{replacementTarget.candidateName}</p>
                  <p className="text-sm text-muted-foreground">
                    Replace: {replacementTarget.documentType} ({replacementTarget.fileName})
                  </p>
                </div>
              )}

              {!existingSessionId && (
                <div className="mb-6">
                  <label className="vf-label">
                    Session / Cohort Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    className={`vf-input ${sessionNameError ? "border-destructive ring-1 ring-destructive/30" : ""}`}
                    placeholder="e.g., Graduate Program 2025 Batch 1"
                    value={sessionName}
                    onChange={(e) => { setSessionName(e.target.value); if (e.target.value.trim()) setSessionNameError(""); }}
                  />
                  {sessionNameError && (
                    <p className="text-xs text-destructive mt-1.5 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {sessionNameError}
                    </p>
                  )}
                </div>
              )}

              <div
                className={`border-2 border-dashed rounded-lg min-h-[200px] flex flex-col items-center justify-center p-8 transition-all duration-200 cursor-pointer ${
                  isDragging ? "border-salmon bg-salmon/5" : "border-purple bg-purple/[0.02] hover:bg-purple/5"
                }`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => document.getElementById("file-input")?.click()}
              >
                <Upload className="h-16 w-16 text-purple mb-4" />
                <h3 className="text-lg font-semibold text-space-kadet mb-1">{replacementTarget ? "Drop the corrected document here" : "Drop all candidate documents here"}</h3>
                <p className="text-muted-foreground text-sm mb-2">{replacementTarget ? "Or click to browse and select one replacement file" : "Or click to browse and select multiple files"}</p>
                <p className="text-muted-foreground text-[13px]">PDF, JPG, JPEG, PNG up to 10MB each</p>
                <p className="text-purple text-sm font-semibold mt-2">AI auto-detects document type and candidate name</p>
                <input id="file-input" type="file" multiple={!replacementTarget} accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileInput} />
              </div>

              {files.length > 0 && (
                <div className="mt-6">
                  <p className="vf-label">{files.length} file{files.length !== 1 ? "s" : ""} selected</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2 max-h-[200px] overflow-y-auto">
                    {files.map((file, index) => (
                      <div key={index} className="bg-card border border-border rounded-lg p-3 relative group">
                        <button
                          onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                          className="absolute -top-2 -right-2 bg-error text-accent-foreground rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <FileText className="h-8 w-8 text-purple mb-2" />
                        <p className="text-[13px] font-medium text-space-kadet truncate">{file.name}</p>
                        <p className="text-[11px] text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-border">
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button variant="default" disabled={files.length === 0} onClick={handleProcess}>
                  Process {files.length > 0 ? `${files.length} ` : ""}Documents
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Cross-Cohort Warning Dialog */}
      <AlertDialog open={showCrossCohortDialog} onOpenChange={(open) => !open && handleCrossCohortCancel()}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
                <Users className="h-5 w-5 text-warning" />
              </div>
              <AlertDialogTitle className="text-lg">Cross-Cohort Candidate Detected</AlertDialogTitle>
            </div>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  The following candidate{crossCohortMatches.length !== 1 ? "s" : ""} already exist{crossCohortMatches.length === 1 ? "s" : ""} in another cohort. Continuing will add them to this session as well.
                </p>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {crossCohortMatches.map((match, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg border border-border">
                      <Users className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{match.candidateName}</p>
                        <p className="text-xs text-muted-foreground">
                          Already in cohort: <span className="font-medium text-foreground">{match.existingSessionName}</span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCrossCohortCancel}>Cancel Upload</AlertDialogCancel>
            <AlertDialogAction onClick={handleCrossCohortContinue}>
              Continue Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default UploadModal;
