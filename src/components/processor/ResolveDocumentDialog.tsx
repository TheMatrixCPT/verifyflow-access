// Phase 7a — manual resolution of documents whose candidate or type was not identified.
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DOCUMENT_TYPE_OPTIONS } from "@/lib/processor/classify";
import type { ProcessedFileRecord } from "@/lib/processor/types";
import { getExtension } from "@/lib/processor/types";

export interface ResolveResult {
  candidateName: string;
  idNumber: string;
  documentType: string;
}

interface KnownCandidate {
  name: string;
  idNumber: string | null;
}

interface Props {
  record: ProcessedFileRecord | null;
  knownCandidates: KnownCandidate[];
  onClose: () => void;
  onSave: (recordId: string, result: ResolveResult) => void;
}

const NEW_CANDIDATE = "__new__";

const ResolveDocumentDialog = ({ record, knownCandidates, onClose, onSave }: Props) => {
  const [selected, setSelected] = useState<string>(NEW_CANDIDATE);
  const [name, setName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [documentType, setDocumentType] = useState("Document");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const extension = record ? getExtension(record.originalName) : "";

  useEffect(() => {
    if (!record) return;
    setSelected(NEW_CANDIDATE);
    setName(record.metadata?.candidateName || "");
    setIdNumber(record.metadata?.idNumber || "");
    setDocumentType(record.metadata?.documentType || "Document");
  }, [record]);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setPreviewUrl(null);
    setPreviewError(null);

    if (!record) return;

    const render = async () => {
      try {
        if (["jpg", "jpeg", "png", "tif", "tiff"].includes(extension)) {
          objectUrl = URL.createObjectURL(record.file);
          if (!cancelled) setPreviewUrl(objectUrl);
          return;
        }
        if (extension === "pdf") {
          setPreviewLoading(true);
          const pdfjs = await import("pdfjs-dist");
          const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
          pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
          const doc = await pdfjs.getDocument({ data: await record.file.arrayBuffer() }).promise;
          const page = await doc.getPage(1);
          const viewport = page.getViewport({ scale: 1.2 });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("This browser could not render the PDF preview.");
          await page.render({ canvas, canvasContext: context, viewport }).promise;
          if (!cancelled) setPreviewUrl(canvas.toDataURL("image/jpeg", 0.85));
        }
      } catch (error) {
        if (!cancelled) setPreviewError(error instanceof Error ? error.message : "Preview unavailable for this file.");
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    };

    render();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [record, extension]);

  const extractedText = useMemo(() => (record?.extraction?.text || "").slice(0, 2000), [record]);

  const handleSelect = (value: string) => {
    setSelected(value);
    if (value === NEW_CANDIDATE) return;
    const candidate = knownCandidates.find((item) => `${item.name}|${item.idNumber || ""}` === value);
    if (candidate) {
      setName(candidate.name);
      setIdNumber(candidate.idNumber || "");
    }
  };

  const save = () => {
    if (!record) return;
    onSave(record.id, {
      candidateName: name.trim(),
      idNumber: idNumber.trim(),
      documentType: documentType.trim() || "Document",
    });
  };

  return (
    <Dialog open={!!record} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Resolve document</DialogTitle>
          <DialogDescription className="break-all">{record?.originalName}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-xl border border-border bg-muted/30 p-3 min-h-[240px] flex items-center justify-center overflow-hidden">
            {previewLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : previewUrl ? (
              <img src={previewUrl} alt={`Preview of ${record?.originalName}`} className="max-h-[420px] w-auto rounded-lg" />
            ) : extractedText ? (
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap max-h-[420px] overflow-y-auto w-full">
                {extractedText}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground text-center">
                {previewError || "No preview or readable text is available for this file."}
              </p>
            )}
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Candidate</Label>
              <Select value={selected} onValueChange={handleSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a candidate" />
                </SelectTrigger>
                <SelectContent>
                  {knownCandidates.map((candidate) => (
                    <SelectItem key={`${candidate.name}|${candidate.idNumber || ""}`} value={`${candidate.name}|${candidate.idNumber || ""}`}>
                      {candidate.name}
                      {candidate.idNumber ? ` — ${candidate.idNumber}` : ""}
                    </SelectItem>
                  ))}
                  <SelectItem value={NEW_CANDIDATE}>Enter a new candidate…</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="resolve-name">Name and surname</Label>
              <Input id="resolve-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Thabo Mokoena" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="resolve-id">ID number</Label>
              <Input id="resolve-id" value={idNumber} onChange={(event) => setIdNumber(event.target.value)} placeholder="13-digit ID number" />
            </div>

            <div className="space-y-2">
              <Label>Document type</Label>
              <Select value={documentType} onValueChange={setDocumentType}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a document type" />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPE_OPTIONS.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!name.trim()}>
            Save and rename
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ResolveDocumentDialog;
