import { useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { BookOpen, ArrowLeft, Upload, FileText, Loader2 } from "lucide-react";
import { parseOutlineFile } from "@/lib/outline-parser";
import { toast } from "sonner";

const ACCEPTED_TYPES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/pdf",
  "text/plain",
];
const ACCEPTED_EXTENSIONS = [".docx", ".pdf", ".txt"];

const OutlineUpload = () => {
  const navigate = useNavigate();
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const processFile = useCallback(async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["docx", "pdf", "txt"].includes(ext)) {
      toast.error("Unsupported file type. Please upload a .docx, .txt, or .pdf file.");
      return;
    }

    setIsProcessing(true);
    setFileName(file.name);

    try {
      const presentation = await parseOutlineFile(file);
      toast.success(`Created "${presentation.title}" with ${presentation.slides} slides`);
      navigate(`/editor/${presentation.id}`, { state: { from: "dashboard" } });
    } catch (err: any) {
      console.error("Outline parse error:", err);
      toast.error(err.message || "Failed to parse document");
    } finally {
      setIsProcessing(false);
    }
  }, [navigate]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link to="/dashboard">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4" />
                  Dashboard
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg gradient-hero flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-primary-foreground" />
                </div>
                <span className="font-serif text-lg font-semibold text-foreground">
                  SermonSlides
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center mb-8"
        >
          <h1 className="font-serif text-3xl font-bold text-foreground mb-2">
            Upload Sermon Outline
          </h1>
          <p className="text-muted-foreground">
            Upload a document and we'll generate slides from your sermon outline.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          {isProcessing ? (
            <div className="rounded-2xl border border-border bg-card p-16 flex flex-col items-center text-center gap-4">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
              <p className="text-foreground font-medium">Processing {fileName}…</p>
              <p className="text-muted-foreground text-sm">
                Detecting title, slides, scripture references and formatting
              </p>
            </div>
          ) : (
            <label
              className={`rounded-2xl border-2 border-dashed bg-card p-16 flex flex-col items-center text-center gap-4 cursor-pointer transition-colors ${
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
                <Upload className="w-7 h-7 text-primary" />
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">
                  Drag & drop your sermon outline here
                </p>
                <p className="text-muted-foreground text-sm">
                  or click to browse — supports .docx, .txt, .pdf
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FileText className="w-3 h-3" /> DOCX
                <FileText className="w-3 h-3 ml-2" /> TXT
                <FileText className="w-3 h-3 ml-2" /> PDF
              </div>
              <input
                type="file"
                className="hidden"
                accept={ACCEPTED_EXTENSIONS.join(",")}
                onChange={handleFileInput}
              />
            </label>
          )}
        </motion.div>
      </main>
    </div>
  );
};

export default OutlineUpload;
