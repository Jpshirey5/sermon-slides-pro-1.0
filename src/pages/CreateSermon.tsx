import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BookOpen,
  ArrowLeft,
  Plus,
  Trash2,
  GripVertical,
  Wand2,
  ChevronDown,
  ChevronUp,
  Search,
  Loader2,
} from "lucide-react";
import { lookupScripture } from "@/lib/scripture-api";
import { toast } from "sonner";

interface Scripture {
  reference: string;
  translation: string;
  text?: string;
  isLoading?: boolean;
}

interface SermonPoint {
  id: string;
  title: string;
  scriptures: Scripture[];
}

const translations = [
  { code: "NIV", name: "New International Version", language: "English" },
  { code: "ESV", name: "English Standard Version", language: "English" },
  { code: "KJV", name: "King James Version", language: "English" },
  { code: "NKJV", name: "New King James Version", language: "English" },
  { code: "NASB", name: "New American Standard Bible", language: "English" },
  { code: "NLT", name: "New Living Translation", language: "English" },
  { code: "CSB", name: "Christian Standard Bible", language: "English" },
  { code: "MSG", name: "The Message", language: "English" },
  { code: "AMP", name: "Amplified Bible", language: "English" },
  { code: "RVR1960", name: "Reina-Valera 1960", language: "Spanish" },
  { code: "NVI", name: "Nueva Versión Internacional", language: "Spanish" },
  { code: "LSG", name: "Louis Segond", language: "French" },
  { code: "LUT", name: "Luther Bible", language: "German" },
  { code: "ALMEIDA", name: "Almeida Revisada", language: "Portuguese" },
];

const CreateSermon = () => {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [points, setPoints] = useState<SermonPoint[]>([
    { id: "1", title: "", scriptures: [] },
  ]);
  const [expandedPoints, setExpandedPoints] = useState<string[]>(["1"]);

  const addPoint = () => {
    const newId = String(Date.now());
    setPoints([...points, { id: newId, title: "", scriptures: [] }]);
    setExpandedPoints([...expandedPoints, newId]);
  };

  const removePoint = (id: string) => {
    if (points.length > 1) {
      setPoints(points.filter((p) => p.id !== id));
      setExpandedPoints(expandedPoints.filter((e) => e !== id));
    }
  };

  const updatePoint = (id: string, title: string) => {
    setPoints(points.map((p) => (p.id === id ? { ...p, title } : p)));
  };

  const addScripture = (pointId: string) => {
    setPoints(
      points.map((p) =>
        p.id === pointId
          ? {
              ...p,
              scriptures: [
                ...p.scriptures,
                { reference: "", translation: "NIV" },
              ],
            }
          : p
      )
    );
  };

  const updateScripture = (
    pointId: string,
    index: number,
    field: keyof Scripture,
    value: string
  ) => {
    setPoints(
      points.map((p) =>
        p.id === pointId
          ? {
              ...p,
              scriptures: p.scriptures.map((s, i) =>
                i === index ? { ...s, [field]: value } : s
              ),
            }
          : p
      )
    );
  };

  const removeScripture = (pointId: string, index: number) => {
    setPoints(
      points.map((p) =>
        p.id === pointId
          ? {
              ...p,
              scriptures: p.scriptures.filter((_, i) => i !== index),
            }
          : p
      )
    );
  };

  const handleScriptureLookup = async (pointId: string, index: number) => {
    const point = points.find((p) => p.id === pointId);
    if (!point) return;
    
    const scripture = point.scriptures[index];
    if (!scripture.reference.trim()) {
      toast.error("Please enter a scripture reference first");
      return;
    }

    // Set loading state
    setPoints(
      points.map((p) =>
        p.id === pointId
          ? {
              ...p,
              scriptures: p.scriptures.map((s, i) =>
                i === index ? { ...s, isLoading: true } : s
              ),
            }
          : p
      )
    );

    try {
      const result = await lookupScripture(scripture.reference, scripture.translation);
      if (result) {
        setPoints(
          points.map((p) =>
            p.id === pointId
              ? {
                  ...p,
                  scriptures: p.scriptures.map((s, i) =>
                    i === index ? { ...s, text: result.text, isLoading: false } : s
                  ),
                }
              : p
          )
        );
        toast.success("Scripture found!");
      } else {
        toast.error("Could not find scripture. Check the reference format.");
        setPoints(
          points.map((p) =>
            p.id === pointId
              ? {
                  ...p,
                  scriptures: p.scriptures.map((s, i) =>
                    i === index ? { ...s, isLoading: false } : s
                  ),
                }
              : p
          )
        );
      }
    } catch (error) {
      toast.error("Error looking up scripture");
      setPoints(
        points.map((p) =>
          p.id === pointId
            ? {
                ...p,
                scriptures: p.scriptures.map((s, i) =>
                  i === index ? { ...s, isLoading: false } : s
                ),
              }
            : p
        )
      );
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedPoints((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Navigate to editor with the sermon data
    navigate("/editor/new");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Back */}
            <Link
              to="/dashboard"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="hidden sm:inline">Back to Dashboard</span>
            </Link>

            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg gradient-hero flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-serif text-lg font-semibold text-foreground">
                SermonSlides
              </span>
            </div>

            {/* Generate */}
            <Button
              variant="hero"
              onClick={handleSubmit}
              disabled={!title || points.every((p) => !p.title)}
            >
              <Wand2 className="w-4 h-4" />
              <span className="hidden sm:inline">Generate Slides</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Form */}
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="font-serif text-3xl font-bold text-foreground mb-2">
            Create New Presentation
          </h1>
          <p className="text-muted-foreground mb-8">
            Enter your sermon details and we'll generate beautiful slides for
            you.
          </p>

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Basic Info */}
            <div className="p-6 rounded-2xl bg-card border border-border space-y-6">
              <h2 className="font-serif text-xl font-semibold text-foreground">
                Sermon Details
              </h2>

              <div className="grid sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="title">Sermon Title</Label>
                  <Input
                    id="title"
                    type="text"
                    placeholder="e.g., The Power of Faith"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    className="h-12"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="date">Sermon Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="h-12"
                  />
                </div>
              </div>
            </div>

            {/* Sermon Points */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-xl font-semibold text-foreground">
                  Sermon Points
                </h2>
                <Button type="button" variant="outline" onClick={addPoint}>
                  <Plus className="w-4 h-4" />
                  Add Point
                </Button>
              </div>

              {points.map((point, pointIndex) => (
                <motion.div
                  key={point.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-6 rounded-2xl bg-card border border-border"
                >
                  {/* Point Header */}
                  <div className="flex items-start gap-4">
                    <div className="flex items-center gap-2 text-muted-foreground cursor-grab">
                      <GripVertical className="w-5 h-5" />
                      <span className="font-semibold text-foreground">
                        {pointIndex + 1}.
                      </span>
                    </div>

                    <div className="flex-1 space-y-4">
                      <div className="flex items-center gap-4">
                        <Input
                          type="text"
                          placeholder="Enter sermon point title..."
                          value={point.title}
                          onChange={(e) => updatePoint(point.id, e.target.value)}
                          className="h-12 flex-1"
                        />
                        <button
                          type="button"
                          onClick={() => toggleExpanded(point.id)}
                          className="p-2 text-muted-foreground hover:text-foreground"
                        >
                          {expandedPoints.includes(point.id) ? (
                            <ChevronUp className="w-5 h-5" />
                          ) : (
                            <ChevronDown className="w-5 h-5" />
                          )}
                        </button>
                        {points.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removePoint(point.id)}
                            className="p-2 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        )}
                      </div>

                      {/* Scriptures */}
                      {expandedPoints.includes(point.id) && (
                        <div className="pl-4 border-l-2 border-border space-y-4">
                          <p className="text-sm text-muted-foreground">
                            Supporting Scriptures (optional)
                          </p>

                          {point.scriptures.map((scripture, scriptureIndex) => (
                            <div
                              key={scriptureIndex}
                              className="space-y-2"
                            >
                              <div className="flex items-center gap-3">
                                <Input
                                  type="text"
                                  placeholder="e.g., John 3:16"
                                  value={scripture.reference}
                                  onChange={(e) =>
                                    updateScripture(
                                      point.id,
                                      scriptureIndex,
                                      "reference",
                                      e.target.value
                                    )
                                  }
                                  className="flex-1"
                                />
                                <Select
                                  value={scripture.translation}
                                  onValueChange={(value) =>
                                    updateScripture(
                                      point.id,
                                      scriptureIndex,
                                      "translation",
                                      value
                                    )
                                  }
                                >
                                  <SelectTrigger className="w-32">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {translations.map((t) => (
                                      <SelectItem key={t.code} value={t.code}>
                                        {t.code}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  onClick={() => handleScriptureLookup(point.id, scriptureIndex)}
                                  disabled={scripture.isLoading || !scripture.reference.trim()}
                                  title="Lookup Scripture"
                                >
                                  {scripture.isLoading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Search className="w-4 h-4" />
                                  )}
                                </Button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    removeScripture(point.id, scriptureIndex)
                                  }
                                  className="p-2 text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                              {scripture.text && (
                                <div className="p-3 rounded-lg bg-muted/50 border border-border">
                                  <p className="text-sm text-muted-foreground italic">
                                    "{scripture.text}"
                                  </p>
                                </div>
                              )}
                            </div>
                          ))}

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => addScripture(point.id)}
                          >
                            <Plus className="w-4 h-4" />
                            Add Scripture
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-4 pt-4">
              <Link to="/dashboard">
                <Button type="button" variant="outline" size="lg">
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                variant="hero"
                size="lg"
                disabled={!title || points.every((p) => !p.title)}
              >
                <Wand2 className="w-5 h-5" />
                Generate Slides
              </Button>
            </div>
          </form>
        </motion.div>
      </main>
    </div>
  );
};

export default CreateSermon;
