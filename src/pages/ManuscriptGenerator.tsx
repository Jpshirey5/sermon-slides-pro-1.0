import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  BookOpen,
  ArrowLeft,
  Upload,
  FileText,
  Users,
  BookMarked,
  Copy,
  Download,
  Save,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { getPresentation } from "@/lib/presentations";
import { saveStudyGuide, type StudyGuide } from "@/lib/study-guides";
import {
  generateStudyGuideContent,
  generateConferenceContent,
} from "@/lib/manuscript-parser";

type Step = "input" | "mode" | "configure" | "preview";

const ManuscriptGenerator = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step
  const [step, setStep] = useState<Step>("input");

  // Input
  const [manuscriptText, setManuscriptText] = useState("");
  const [guideTitle, setGuideTitle] = useState("");

  // Mode
  const [outputType, setOutputType] = useState<"study-guide" | "conference" | null>(null);

  // Configure – study guide
  const [weeks, setWeeks] = useState(4);

  // Configure – conference
  const [sessionCount, setSessionCount] = useState(3);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [sessionDuration, setSessionDuration] = useState(60);

  // Preview
  const [generatedGuide, setGeneratedGuide] = useState<StudyGuide | null>(null);
  const [copied, setCopied] = useState(false);

  // Pre-load from presentation
  useEffect(() => {
    const fromId = searchParams.get("fromPresentation");
    if (fromId) {
      const pres = getPresentation(fromId);
      if (pres) {
        setGuideTitle(pres.title + " – Study Guide");
        // Build text from presentation data
        const parts: string[] = [];
        if (pres.data?.title) parts.push(pres.data.title);
        pres.data?.points.forEach((pt) => {
          if (pt.title) parts.push(`\n${pt.title}`);
          pt.scriptures.forEach((s) => {
            if (s.text) parts.push(`${s.reference}: ${s.text}`);
          });
        });
        setManuscriptText(parts.join("\n\n"));
      }
    }
  }, [searchParams]);

  // Handle file upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".txt")) {
      toast.error("Only .txt files are supported for now.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setManuscriptText(text);
      if (!guideTitle) {
        setGuideTitle(file.name.replace(/\.txt$/, ""));
      }
      toast.success("File loaded!");
    };
    reader.readAsText(file);
  };

  const canProceedFromInput = manuscriptText.trim().length > 20 && guideTitle.trim().length > 0;

  const handleGenerate = () => {
    if (!outputType) return;

    const id = String(Date.now());
    const now = new Date().toISOString();

    if (outputType === "study-guide") {
      const content = generateStudyGuideContent(manuscriptText, guideTitle, weeks);
      const guide: StudyGuide = {
        id,
        title: guideTitle,
        sourceType: searchParams.get("fromPresentation") ? "presentation" : "manuscript",
        sourceId: searchParams.get("fromPresentation") || undefined,
        outputType: "study-guide",
        weeks,
        content,
        createdAt: now,
        lastModified: now,
      };
      setGeneratedGuide(guide);
    } else {
      const sessions = generateConferenceContent(
        manuscriptText,
        eventTitle || guideTitle,
        sessionCount,
        sessionDuration
      );
      const guide: StudyGuide = {
        id,
        title: guideTitle,
        sourceType: searchParams.get("fromPresentation") ? "presentation" : "manuscript",
        sourceId: searchParams.get("fromPresentation") || undefined,
        outputType: "conference",
        eventTitle: eventTitle || guideTitle,
        eventDescription,
        sessionDuration,
        sessions,
        createdAt: now,
        lastModified: now,
      };
      setGeneratedGuide(guide);
    }
    setStep("preview");
  };

  const handleSave = () => {
    if (!generatedGuide) return;
    generatedGuide.lastModified = new Date().toISOString();
    saveStudyGuide(generatedGuide);
    toast.success("Saved to dashboard!");
    navigate("/dashboard");
  };

  const handleCopy = () => {
    if (!generatedGuide) return;
    let text = `# ${generatedGuide.title}\n\n`;
    if (generatedGuide.outputType === "study-guide" && generatedGuide.content) {
      generatedGuide.content.forEach((w) => {
        text += `## Week ${w.week}: ${w.title}\n\n`;
        text += `### Key Points\n${w.keyPoints.map((p) => `- ${p}`).join("\n")}\n\n`;
        text += `### Discussion Questions\n${w.discussionQuestions.map((q) => `- ${q}`).join("\n")}\n\n`;
        if (w.scriptureReferences.length > 0)
          text += `### Scripture References\n${w.scriptureReferences.join(", ")}\n\n`;
        text += `---\n\n`;
      });
    } else if (generatedGuide.sessions) {
      if (generatedGuide.eventDescription)
        text += `${generatedGuide.eventDescription}\n\n`;
      generatedGuide.sessions.forEach((s) => {
        text += `## Session ${s.session}: ${s.title} (${s.typeLabel})\n\n`;
        text += `### Teaching Outline\n${s.teachingOutline.map((p) => `- ${p}`).join("\n")}\n\n`;
        text += `### Key Takeaways\n${s.keyTakeaways.map((t) => `- ${t}`).join("\n")}\n\n`;
        text += `### Discussion Prompts\n${s.discussionPrompts.map((p) => `- ${p}`).join("\n")}\n\n`;
        text += `### Facilitator Notes\n${s.facilitatorNotes}\n\n`;
        if (s.scriptureReferences.length > 0)
          text += `### Scripture References\n${s.scriptureReferences.join(", ")}\n\n`;
        text += `---\n\n`;
      });
    }
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied to clipboard!");
  };

  const handleDownload = () => {
    if (!generatedGuide) return;
    // Reuse the copy text builder
    let text = `# ${generatedGuide.title}\n\n`;
    if (generatedGuide.outputType === "study-guide" && generatedGuide.content) {
      generatedGuide.content.forEach((w) => {
        text += `## Week ${w.week}: ${w.title}\n\nKey Points:\n${w.keyPoints.map((p) => `- ${p}`).join("\n")}\n\nDiscussion Questions:\n${w.discussionQuestions.map((q) => `- ${q}`).join("\n")}\n\n---\n\n`;
      });
    } else if (generatedGuide.sessions) {
      generatedGuide.sessions.forEach((s) => {
        text += `## Session ${s.session}: ${s.title} (${s.typeLabel})\n\nTeaching Outline:\n${s.teachingOutline.map((p) => `- ${p}`).join("\n")}\n\nKey Takeaways:\n${s.keyTakeaways.map((t) => `- ${t}`).join("\n")}\n\nFacilitator Notes:\n${s.facilitatorNotes}\n\n---\n\n`;
      });
    }
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${generatedGuide.title}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isFromDashboard = localStorage.getItem("logged_in") === "true";
  const backTo = isFromDashboard ? "/dashboard" : "/";
  const backLabel = isFromDashboard ? "Back to Dashboard" : "Back to Home";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link
              to={backTo}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="hidden sm:inline">{backLabel}</span>
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg gradient-hero flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-serif text-lg font-semibold text-foreground">
                Manuscript Generator
              </span>
            </div>
            <div className="w-20" />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <AnimatePresence mode="wait">
          {/* ──── STEP 1: INPUT ──── */}
          {step === "input" && (
            <motion.div
              key="input"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div>
                <h1 className="font-serif text-3xl font-bold text-foreground mb-2">
                  Upload Your Manuscript
                </h1>
                <p className="text-muted-foreground">
                  Paste your sermon text or upload a .txt file to get started.
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="guideTitle">Title</Label>
                  <Input
                    id="guideTitle"
                    placeholder="e.g., Walking in Faith"
                    value={guideTitle}
                    onChange={(e) => setGuideTitle(e.target.value)}
                    className="h-12"
                  />
                </div>

                {/* Upload area */}
                <div
                  className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/40 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">
                    Click to upload a <strong>.txt</strong> file or drag & drop
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>

                <div className="relative">
                  <div className="absolute inset-x-0 top-1/2 border-t border-border" />
                  <p className="relative text-center text-xs text-muted-foreground bg-card px-3 w-fit mx-auto">
                    or paste text below
                  </p>
                </div>

                <Textarea
                  placeholder="Paste your sermon manuscript here..."
                  value={manuscriptText}
                  onChange={(e) => setManuscriptText(e.target.value)}
                  className="min-h-[200px]"
                />
              </div>

              <div className="flex justify-end">
                <Button
                  variant="hero"
                  size="lg"
                  disabled={!canProceedFromInput}
                  onClick={() => setStep("mode")}
                >
                  Continue
                </Button>
              </div>
            </motion.div>
          )}

          {/* ──── STEP 2: MODE SELECT ──── */}
          {step === "mode" && (
            <motion.div
              key="mode"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div>
                <h1 className="font-serif text-3xl font-bold text-foreground mb-2">
                  Choose Output Type
                </h1>
                <p className="text-muted-foreground">
                  What would you like to create from your manuscript?
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-6">
                {/* Study Guide */}
                <button
                  type="button"
                  onClick={() => {
                    setOutputType("study-guide");
                    setStep("configure");
                  }}
                  className={`rounded-2xl border-2 bg-card p-8 text-left transition-all hover:shadow-soft ${
                    outputType === "study-guide"
                      ? "border-primary"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  <BookMarked className="w-10 h-10 text-primary mb-4" />
                  <h3 className="font-serif text-xl font-semibold text-foreground mb-2">
                    Study Guide
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Break the manuscript into a multi-week study guide with
                    discussion questions, key points, and scripture references.
                    Ideal for small groups, Bible studies, and Sunday school.
                  </p>
                </button>

                {/* Conference */}
                <button
                  type="button"
                  onClick={() => {
                    setOutputType("conference");
                    setStep("configure");
                  }}
                  className={`rounded-2xl border-2 bg-card p-8 text-left transition-all hover:shadow-soft ${
                    outputType === "conference"
                      ? "border-primary"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  <Users className="w-10 h-10 text-accent mb-4" />
                  <h3 className="font-serif text-xl font-semibold text-foreground mb-2">
                    Conference / Training Event
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Turn the manuscript into a multi-session conference or
                    training event with breakout sessions, teaching outlines, and
                    facilitator notes. Ideal for leadership retreats and
                    workshops.
                  </p>
                </button>
              </div>

              <div className="flex justify-start">
                <Button variant="ghost" onClick={() => setStep("input")}>
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </Button>
              </div>
            </motion.div>
          )}

          {/* ──── STEP 3: CONFIGURE ──── */}
          {step === "configure" && (
            <motion.div
              key="configure"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div>
                <h1 className="font-serif text-3xl font-bold text-foreground mb-2">
                  {outputType === "study-guide"
                    ? "Configure Study Guide"
                    : "Configure Conference"}
                </h1>
                <p className="text-muted-foreground">
                  Set the details for your{" "}
                  {outputType === "study-guide" ? "study guide" : "conference"}.
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
                {outputType === "study-guide" ? (
                  <div className="space-y-2">
                    <Label>Number of Weeks (1–12)</Label>
                    <Select
                      value={String(weeks)}
                      onValueChange={(v) => setWeeks(Number(v))}
                    >
                      <SelectTrigger className="h-12">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(
                          (n) => (
                            <SelectItem key={n} value={String(n)}>
                              {n} {n === 1 ? "week" : "weeks"}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>Event Title</Label>
                      <Input
                        placeholder="e.g., Leadership Summit 2026"
                        value={eventTitle}
                        onChange={(e) => setEventTitle(e.target.value)}
                        className="h-12"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Event Description (optional)</Label>
                      <Textarea
                        placeholder="Brief overview of the event..."
                        value={eventDescription}
                        onChange={(e) => setEventDescription(e.target.value)}
                      />
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Number of Sessions (1–12)</Label>
                        <Select
                          value={String(sessionCount)}
                          onValueChange={(v) => setSessionCount(Number(v))}
                        >
                          <SelectTrigger className="h-12">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(
                              (n) => (
                                <SelectItem key={n} value={String(n)}>
                                  {n} {n === 1 ? "session" : "sessions"}
                                </SelectItem>
                              )
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Session Duration</Label>
                        <Select
                          value={String(sessionDuration)}
                          onValueChange={(v) =>
                            setSessionDuration(Number(v))
                          }
                        >
                          <SelectTrigger className="h-12">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[30, 45, 60, 90].map((d) => (
                              <SelectItem key={d} value={String(d)}>
                                {d} minutes
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep("mode")}>
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </Button>
                <Button variant="hero" size="lg" onClick={handleGenerate}>
                  Generate
                </Button>
              </div>
            </motion.div>
          )}

          {/* ──── STEP 4: PREVIEW ──── */}
          {step === "preview" && generatedGuide && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="font-serif text-3xl font-bold text-foreground mb-1">
                    {generatedGuide.title}
                  </h1>
                  <p className="text-muted-foreground text-sm">
                    {generatedGuide.outputType === "conference"
                      ? `${generatedGuide.sessions?.length} sessions • ${generatedGuide.sessionDuration} min each`
                      : `${generatedGuide.content?.length} weeks`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleCopy}>
                    {copied ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    Copy
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDownload}>
                    <Download className="w-4 h-4" />
                    Download
                  </Button>
                  {isFromDashboard && (
                    <Button variant="hero" size="sm" onClick={handleSave}>
                      <Save className="w-4 h-4" />
                      Save to Dashboard
                    </Button>
                  )}
                </div>
              </div>

              {/* Conference event overview */}
              {generatedGuide.outputType === "conference" &&
                generatedGuide.eventDescription && (
                  <div className="rounded-xl border border-border bg-card p-5">
                    <h3 className="font-serif font-semibold text-foreground mb-1">
                      Event Overview
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {generatedGuide.eventDescription}
                    </p>
                  </div>
                )}

              {/* Study Guide Weeks */}
              {generatedGuide.outputType === "study-guide" &&
                generatedGuide.content && (
                  <Accordion type="multiple" className="space-y-3">
                    {generatedGuide.content.map((w) => (
                      <AccordionItem
                        key={w.week}
                        value={`week-${w.week}`}
                        className="rounded-xl border border-border bg-card px-5"
                      >
                        <AccordionTrigger className="hover:no-underline py-4">
                          <span className="font-serif font-semibold text-foreground">
                            Week {w.week}: {w.title}
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="pb-5 space-y-4">
                          <div>
                            <h4 className="text-sm font-semibold text-foreground mb-1">
                              Key Points
                            </h4>
                            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                              {w.keyPoints.map((p, i) => (
                                <li key={i}>{p}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-foreground mb-1">
                              Discussion Questions
                            </h4>
                            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                              {w.discussionQuestions.map((q, i) => (
                                <li key={i}>{q}</li>
                              ))}
                            </ul>
                          </div>
                          {w.scriptureReferences.length > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold text-foreground mb-1">
                                Scripture References
                              </h4>
                              <p className="text-sm text-muted-foreground">
                                {w.scriptureReferences.join(", ")}
                              </p>
                            </div>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}

              {/* Conference Sessions */}
              {generatedGuide.outputType === "conference" &&
                generatedGuide.sessions && (
                  <Accordion type="multiple" className="space-y-3">
                    {generatedGuide.sessions.map((s) => (
                      <AccordionItem
                        key={s.session}
                        value={`session-${s.session}`}
                        className="rounded-xl border border-border bg-card px-5"
                      >
                        <AccordionTrigger className="hover:no-underline py-4">
                          <div className="flex items-center gap-3 text-left">
                            <span className="font-serif font-semibold text-foreground">
                              Session {s.session}: {s.title}
                            </span>
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-accent/10 text-accent-foreground">
                              {s.typeLabel}
                            </span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-5 space-y-4">
                          <div>
                            <h4 className="text-sm font-semibold text-foreground mb-1">
                              Teaching Outline
                            </h4>
                            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                              {s.teachingOutline.map((p, i) => (
                                <li key={i}>{p}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-foreground mb-1">
                              Key Takeaways
                            </h4>
                            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                              {s.keyTakeaways.map((t, i) => (
                                <li key={i}>{t}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-foreground mb-1">
                              Discussion Prompts
                            </h4>
                            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                              {s.discussionPrompts.map((p, i) => (
                                <li key={i}>{p}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-foreground mb-1">
                              Facilitator Notes
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              {s.facilitatorNotes}
                            </p>
                          </div>
                          {s.scriptureReferences.length > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold text-foreground mb-1">
                                Scripture References
                              </h4>
                              <p className="text-sm text-muted-foreground">
                                {s.scriptureReferences.join(", ")}
                              </p>
                            </div>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}

              <div className="flex justify-start pt-4">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setGeneratedGuide(null);
                    setStep("configure");
                  }}
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Configuration
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default ManuscriptGenerator;
