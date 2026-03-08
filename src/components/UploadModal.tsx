import { useState, useCallback } from "react";
import { X, Upload, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSession, uploadAndProcessFiles } from "@/lib/api";
import { toast } from "sonner";

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: (sessionId: string) => void;
  existingSessionId?: string;
}

const UploadModal = ({ open, onClose, onComplete }: UploadModalProps) => {
  const [sessionName, setSessionName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ processed: 0, total: 0 });

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...droppedFiles]);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleProcess = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setProgress({ processed: 0, total: files.length });

    try {
      const name = sessionName || `Session ${new Date().toLocaleDateString()}`;
      const sessionId = await createSession(name);

      await uploadAndProcessFiles(sessionId, files, (processed, total) => {
        setProgress({ processed, total });
      });

      toast.success(`Successfully processed ${files.length} documents`);
      setSessionName("");
      setFiles([]);
      setIsProcessing(false);
      setProgress({ processed: 0, total: 0 });
      onComplete(sessionId);
    } catch (error) {
      console.error("Processing error:", error);
      toast.error("An error occurred while processing documents");
      setIsProcessing(false);
    }
  };

  if (!open) return null;

  const progressPercent = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={!isProcessing ? onClose : undefined}>
      <div className="absolute inset-0 bg-space-kadet/50 backdrop-blur-[4px]" />
      <div
        className="relative bg-card rounded-xl p-8 max-w-[700px] w-full mx-4 max-h-[90vh] overflow-y-auto"
        style={{ boxShadow: "var(--shadow-modal)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-6 mb-6 border-b border-border">
          <h2 className="text-2xl font-bold text-space-kadet">Upload Documents</h2>
          {!isProcessing && (
            <Button variant="icon" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>

        {isProcessing ? (
          <div className="py-8 text-center">
            <Loader2 className="h-12 w-12 text-purple mx-auto mb-4 animate-spin" />
            <h3 className="text-lg font-semibold text-space-kadet mb-2">
              Processing Documents...
            </h3>
            <p className="text-muted-foreground mb-6">
              AI is analyzing {progress.total} documents — extracting names and document types automatically.
            </p>
            <div className="max-w-md mx-auto">
              <div className="flex justify-between text-sm text-muted-foreground mb-2">
                <span>Processing {progress.processed} of {progress.total} documents</span>
                <span className="font-semibold text-space-kadet">{progressPercent}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple rounded-full transition-all duration-500 ease-in-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Session Name */}
            <div className="mb-6">
              <label className="vf-label">Session Name (Optional)</label>
              <input
                type="text"
                className="vf-input"
                placeholder="e.g., Graduate Program 2025 Batch 1"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
              />
            </div>

            {/* Drop Zone */}
            <div
              className={`border-2 border-dashed rounded-lg min-h-[200px] flex flex-col items-center justify-center p-8 transition-all duration-200 cursor-pointer ${
                isDragging
                  ? "border-salmon bg-salmon/5"
                  : "border-purple bg-purple/[0.02] hover:bg-purple/5"
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById("file-input")?.click()}
            >
              <Upload className="h-16 w-16 text-purple mb-4" />
              <h3 className="text-lg font-semibold text-space-kadet mb-1">Drop all candidate documents here</h3>
              <p className="text-muted-foreground text-sm mb-2">Or click to browse and select multiple files</p>
              <p className="text-muted-foreground text-[13px]">PDF, JPG, JPEG, PNG up to 10MB each</p>
              <p className="text-purple text-sm font-semibold mt-2">AI auto-detects document type and candidate name</p>
              <input
                id="file-input"
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={handleFileInput}
              />
            </div>

            {/* File Preview Grid */}
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

            {/* Footer */}
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
  );
};

export default UploadModal;
