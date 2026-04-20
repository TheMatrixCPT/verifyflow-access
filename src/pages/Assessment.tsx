import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, FileSpreadsheet, Download, Award, FileText, Loader2, ArrowLeft, LogOut, X } from "lucide-react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { parseFormsWorkbook, type ParsedWorkbook, type Respondent } from "@/lib/assessmentParser";
import {
  generateCertificate,
  generateReport,
  formatAssessmentDate,
  makeFileNameSafe,
} from "@/lib/generateAssessmentPdfs";

const Assessment = () => {
  const navigate = useNavigate();
  const { admin, logout } = useAuth();
  const [parsing, setParsing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [data, setData] = useState<ParsedWorkbook | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [assessmentTitle, setAssessmentTitle] = useState<string>("");
  const [assessmentDate, setAssessmentDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [threshold, setThreshold] = useState<number>(75);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseFormsWorkbook(buf, file.name.replace(/\.(xlsx|xls)$/i, ""));
      if (parsed.respondents.length === 0) {
        toast.error("No respondents found in this file.");
        setParsing(false);
        return;
      }
      setData(parsed);
      setFileName(file.name);
      setAssessmentTitle(parsed.formTitle);
      toast.success(`Parsed ${parsed.respondents.length} respondents and ${parsed.questions.length} questions.`);
    } catch (err) {
      console.error(err);
      toast.error("Could not parse this file. Please make sure it's a Microsoft Forms .xlsx export.");
    } finally {
      setParsing(false);
    }
  };

  const stats = useMemo(() => {
    if (!data) return { total: 0, passed: 0, failed: 0, missing: 0 };
    let passed = 0;
    let failed = 0;
    let missing = 0;
    for (const r of data.respondents) {
      if (r.percent === null) missing++;
      else if (r.percent >= threshold) passed++;
      else failed++;
    }
    return { total: data.respondents.length, passed, failed, missing };
  }, [data, threshold]);

  const formattedDate = useMemo(() => formatAssessmentDate(assessmentDate), [assessmentDate]);

  const downloadCertificate = async (r: Respondent) => {
    if (r.percent === null || r.percent < threshold) {
      toast.error(`${r.name} did not meet the ${threshold}% pass threshold.`);
      return;
    }
    setDownloadingId(`cert-${r.id}`);
    try {
      const blob = await generateCertificate({
        respondent: r,
        assessmentTitle,
        assessmentDate: formattedDate,
      });
      saveAs(blob, `${makeFileNameSafe(r.name)}_Certificate.pdf`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate certificate.");
    } finally {
      setDownloadingId(null);
    }
  };

  const downloadReport = async (r: Respondent) => {
    if (!data) return;
    setDownloadingId(`report-${r.id}`);
    try {
      const blob = await generateReport({
        respondent: r,
        assessmentTitle,
        assessmentDate: formattedDate,
        passThreshold: threshold,
        questionOptions: data.questionOptions,
      });
      saveAs(blob, `${makeFileNameSafe(r.name)}_Report.pdf`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate report.");
    } finally {
      setDownloadingId(null);
    }
  };

  const downloadAllZip = async () => {
    if (!data) return;
    setGenerating(true);
    try {
      const zip = new JSZip();
      const certFolder = zip.folder("certificates");
      const reportFolder = zip.folder("reports");

      for (const r of data.respondents) {
        const reportBlob = await generateReport({
          respondent: r,
          assessmentTitle,
          assessmentDate: formattedDate,
          passThreshold: threshold,
          questionOptions: data.questionOptions,
        });
        reportFolder?.file(`${makeFileNameSafe(r.name)}_Report.pdf`, reportBlob);

        if (r.percent !== null && r.percent >= threshold) {
          const certBlob = await generateCertificate({
            respondent: r,
            assessmentTitle,
            assessmentDate: formattedDate,
          });
          certFolder?.file(`${makeFileNameSafe(r.name)}_Certificate.pdf`, certBlob);
        }
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      saveAs(zipBlob, `${makeFileNameSafe(assessmentTitle || "Assessment")}_Documents.zip`);
      toast.success(`Generated ${stats.passed} certificates and ${stats.total} reports.`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate batch ZIP.");
    } finally {
      setGenerating(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="bg-card border-b border-border">
        <div className="max-w-[1200px] mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple flex items-center justify-center">
              <Award className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-space-kadet leading-tight">Assessment Tools</h1>
              <p className="text-xs text-muted-foreground">Certificates & Results from Microsoft Forms</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {admin?.name} {admin?.surname}
            </span>
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Validation
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-1" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="vf-section space-y-6">
        {/* Hero */}
        <section
          className="relative overflow-hidden rounded-3xl p-10 text-white"
          style={{
            background: "var(--gradient-hero)",
            boxShadow: "var(--shadow-elegant)",
          }}
        >
          <div
            className="absolute -top-20 -right-20 w-64 h-64 rounded-full blur-3xl opacity-40"
            style={{ background: "hsl(var(--brand-coral))" }}
          />
          <div
            className="absolute -bottom-24 -left-16 w-72 h-72 rounded-full blur-3xl opacity-30"
            style={{ background: "hsl(var(--brand-purple))" }}
          />
          <div className="relative max-w-2xl">
            <p className="text-xs uppercase tracking-[0.25em] text-white/70 mb-3">
              CAPACITI · Microsoft Forms → PDFs
            </p>
            <h1 className="text-3xl md:text-4xl font-bold leading-tight text-white">
              Generate certificates &amp; result reports in one click.
            </h1>
            <p className="text-white/80 mt-3 text-sm md:text-base">
              Drop in a Microsoft Forms Excel export and instantly get branded certificates for passers
              and a full answer report for everyone. Everything runs in your browser — nothing is uploaded.
            </p>
          </div>
        </section>

        {/* Upload card */}
        <section className="vf-card">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-space-kadet">Upload Microsoft Forms Export</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Drop the .xlsx exported from Microsoft Forms. Names are auto-cleaned (email domains stripped, capitalised).
              </p>
            </div>
            {data && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setData(null);
                  setFileName("");
                }}
              >
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>

          <label
            htmlFor="xlsx-input"
            className="block border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-purple/50 hover:bg-muted/50 transition-colors"
          >
            <input
              id="xlsx-input"
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
            {parsing ? (
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Parsing workbook...</span>
              </div>
            ) : data ? (
              <div className="flex items-center justify-center gap-3 text-space-kadet">
                <FileSpreadsheet className="h-6 w-6 text-purple" />
                <span className="font-medium">{fileName}</span>
                <Badge variant="secondary">
                  {data.respondents.length} respondents · {data.questions.length} questions
                </Badge>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="text-sm font-medium text-space-kadet">Click to choose .xlsx / .xls</p>
                <p className="text-xs text-muted-foreground">
                  We never upload — everything runs in your browser.
                </p>
              </div>
            )}
          </label>
        </section>

        {data && (
          <>
            {/* Settings */}
            <section className="vf-card">
              <h3 className="text-base font-semibold text-space-kadet mb-4">Assessment Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="vf-label">Assessment Title</label>
                  <Input
                    value={assessmentTitle}
                    onChange={(e) => setAssessmentTitle(e.target.value)}
                    placeholder="e.g. Cloud Fundamentals"
                  />
                </div>
                <div>
                  <label className="vf-label">Assessment Date</label>
                  <Input
                    type="date"
                    value={assessmentDate}
                    onChange={(e) => setAssessmentDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="vf-label">Pass Threshold (%)</label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={threshold}
                    onChange={(e) => setThreshold(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                  />
                </div>
              </div>
            </section>

            {/* Stats + bulk action */}
            <section className="vf-card">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold text-space-kadet mt-1">{stats.total}</p>
                </div>
                <div className="bg-success/10 rounded-lg p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Passed</p>
                  <p className="text-2xl font-bold text-space-kadet mt-1">{stats.passed}</p>
                </div>
                <div className="bg-error/10 rounded-lg p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Did Not Pass</p>
                  <p className="text-2xl font-bold text-space-kadet mt-1">{stats.failed}</p>
                </div>
                <div className="bg-warning/10 rounded-lg p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">No Score</p>
                  <p className="text-2xl font-bold text-space-kadet mt-1">{stats.missing}</p>
                </div>
              </div>
              <Button
                onClick={downloadAllZip}
                disabled={generating || !assessmentTitle.trim()}
                size="lg"
                className="w-full md:w-auto"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating ZIP...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Download All as ZIP ({stats.passed} certificates + {stats.total} reports)
                  </>
                )}
              </Button>
            </section>

            {/* Respondents table */}
            <section className="vf-card overflow-hidden p-0">
              <div className="px-6 py-4 border-b border-border">
                <h3 className="text-base font-semibold text-space-kadet">Respondents</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="text-left px-6 py-3 font-semibold">Name</th>
                      <th className="text-left px-4 py-3 font-semibold">Email</th>
                      <th className="text-right px-4 py-3 font-semibold">Score</th>
                      <th className="text-center px-4 py-3 font-semibold">Result</th>
                      <th className="text-right px-6 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.respondents.map((r) => {
                      const passed = r.percent !== null && r.percent >= threshold;
                      const noScore = r.percent === null;
                      return (
                        <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                          <td className="px-6 py-3 font-medium text-space-kadet">{r.name}</td>
                          <td className="px-4 py-3 text-muted-foreground">{r.email || "—"}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-space-kadet">
                            {r.percent !== null ? `${r.percent.toFixed(1)}%` : "—"}
                            {r.rawScore !== null && r.totalPossible !== null && (
                              <span className="text-xs text-muted-foreground ml-2">
                                {r.rawScore}/{r.totalPossible}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {noScore ? (
                              <Badge variant="secondary">No score</Badge>
                            ) : passed ? (
                              <span className="vf-badge-success">Pass</span>
                            ) : (
                              <span className="vf-badge-error">Did not pass</span>
                            )}
                          </td>
                          <td className="px-6 py-3 text-right">
                            <div className="inline-flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => downloadReport(r)}
                                disabled={downloadingId === `report-${r.id}`}
                              >
                                {downloadingId === `report-${r.id}` ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <FileText className="h-3.5 w-3.5" />
                                )}
                                <span className="hidden md:inline ml-1">Report</span>
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => downloadCertificate(r)}
                                disabled={!passed || downloadingId === `cert-${r.id}`}
                              >
                                {downloadingId === `cert-${r.id}` ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Award className="h-3.5 w-3.5" />
                                )}
                                <span className="hidden md:inline ml-1">Certificate</span>
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
};

export default Assessment;
