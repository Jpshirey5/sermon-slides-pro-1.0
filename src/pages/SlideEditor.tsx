import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
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
  Download,
  Share2,
  Play,
  GripVertical,
  Plus,
  Type,
  Palette,
  ChevronLeft,
  ChevronRight,
  FileText,
  Presentation,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { BackgroundPicker } from "@/components/BackgroundPicker";
import { exportToPowerPoint, SlideData } from "@/lib/export-pptx";
import { exportToProPresenter, exportToProPresenter6 } from "@/lib/export-propresenter";
import { toast } from "sonner";

const mockSlides: SlideData[] = [
  {
    id: "1",
    type: "title",
    content: {
      title: "The Power of Faith",
      subtitle: "Sunday Service • January 28, 2024",
    },
    background: "linear-gradient(135deg, #5c1e2b 0%, #3d1219 100%)",
    fontFamily: "Playfair Display",
    textColor: "#ffffff",
  },
  {
    id: "2",
    type: "point",
    content: {
      title: "1. Faith Moves Mountains",
      subtitle: "When we trust God completely, the impossible becomes possible",
    },
    background: "linear-gradient(135deg, #5c1e2b 0%, #3d1219 100%)",
    fontFamily: "Playfair Display",
    textColor: "#ffffff",
  },
  {
    id: "3",
    type: "scripture",
    content: {
      scripture:
        '"For truly I tell you, if you have faith the size of a mustard seed, you will say to this mountain, \'Move from here to there,\' and it will move."',
      reference: "Matthew 17:20 (NIV)",
    },
    background: "linear-gradient(135deg, #5c1e2b 0%, #3d1219 100%)",
    fontFamily: "Playfair Display",
    textColor: "#ffffff",
  },
  {
    id: "4",
    type: "point",
    content: {
      title: "2. Faith Overcomes Fear",
      subtitle: "Perfect love casts out fear through unwavering faith",
    },
    background: "linear-gradient(135deg, #5c1e2b 0%, #3d1219 100%)",
    fontFamily: "Playfair Display",
    textColor: "#ffffff",
  },
  {
    id: "5",
    type: "scripture",
    content: {
      scripture:
        '"There is no fear in love. But perfect love drives out fear, because fear has to do with punishment."',
      reference: "1 John 4:18 (NIV)",
    },
    background: "linear-gradient(135deg, #5c1e2b 0%, #3d1219 100%)",
    fontFamily: "Playfair Display",
    textColor: "#ffffff",
  },
];

const fonts = [
  "Playfair Display",
  "Inter",
  "Georgia",
  "Merriweather",
  "Lora",
  "Roboto Slab",
  "Open Sans",
  "Montserrat",
  "Raleway",
  "PT Serif",
];

const colors = [
  "#ffffff",
  "#f5f5f5",
  "#e5e5e5",
  "#d4af37",
  "#c9a227",
  "#ffd700",
  "#ffb347",
  "#ff6b6b",
  "#4ecdc4",
  "#45b7d1",
];

const SlideEditor = () => {
  const { id } = useParams();
  const [slides, setSlides] = useState<SlideData[]>(mockSlides);
  const [selectedSlide, setSelectedSlide] = useState(0);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const currentSlide = slides[selectedSlide];
  const presentationTitle = id === "new" ? "New Presentation" : "The Power of Faith";

  const handleExport = async (format: "pptx" | "pro" | "pro6") => {
    setIsExporting(true);
    try {
      if (format === "pptx") {
        await exportToPowerPoint(slides, presentationTitle);
        toast.success("PowerPoint file exported successfully!");
      } else if (format === "pro") {
        exportToProPresenter(slides, presentationTitle);
        toast.success("ProPresenter 7 file exported successfully!");
      } else if (format === "pro6") {
        exportToProPresenter6(slides, presentationTitle);
        toast.success("ProPresenter 6 file exported successfully!");
      }
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export presentation. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleBackgroundChange = (background: string, backgroundImage?: string) => {
    setSlides(slides.map((slide, index) =>
      index === selectedSlide
        ? { ...slide, background, backgroundImage }
        : slide
    ));
  };

  const handleFontChange = (fontFamily: string) => {
    setSlides(slides.map((slide, index) =>
      index === selectedSlide
        ? { ...slide, fontFamily }
        : slide
    ));
  };

  const handleColorChange = (textColor: string) => {
    setSlides(slides.map((slide, index) =>
      index === selectedSlide
        ? { ...slide, textColor }
        : slide
    ));
  };

  const navigateSlide = (direction: "prev" | "next") => {
    if (direction === "prev" && selectedSlide > 0) {
      setSelectedSlide(selectedSlide - 1);
    } else if (direction === "next" && selectedSlide < slides.length - 1) {
      setSelectedSlide(selectedSlide + 1);
    }
  };

  const getSlideBackground = (slide: SlideData) => {
    if (slide.backgroundImage) {
      return `url(${slide.backgroundImage})`;
    }
    return slide.background;
  };

  if (isPreviewMode) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-cover bg-center"
        style={{ 
          background: currentSlide.backgroundImage 
            ? `url(${currentSlide.backgroundImage})` 
            : currentSlide.background,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
        onClick={() => setIsPreviewMode(false)}
      >
        {/* Dark overlay for images */}
        {currentSlide.backgroundImage && (
          <div className="absolute inset-0 bg-black/40" />
        )}
        
        <div className="absolute top-4 right-4 flex gap-2 z-10">
          <Button
            variant="outline"
            className="bg-white/10 border-white/20 text-white hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              setIsPreviewMode(false);
            }}
          >
            Exit Preview
          </Button>
        </div>

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 z-10">
          <Button
            variant="outline"
            size="icon"
            className="bg-white/10 border-white/20 text-white hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              navigateSlide("prev");
            }}
            disabled={selectedSlide === 0}
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <span className="text-white text-sm">
            {selectedSlide + 1} / {slides.length}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="bg-white/10 border-white/20 text-white hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              navigateSlide("next");
            }}
            disabled={selectedSlide === slides.length - 1}
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        <div className="text-center max-w-4xl px-8 relative z-10">
          {currentSlide.type === "title" && (
            <>
              <h1
                className="text-5xl md:text-7xl font-bold mb-6"
                style={{
                  fontFamily: currentSlide.fontFamily,
                  color: currentSlide.textColor,
                }}
              >
                {currentSlide.content.title}
              </h1>
              <p
                className="text-xl md:text-2xl opacity-80"
                style={{ color: currentSlide.textColor }}
              >
                {currentSlide.content.subtitle}
              </p>
            </>
          )}
          {currentSlide.type === "point" && (
            <>
              <h2
                className="text-4xl md:text-6xl font-bold mb-6"
                style={{
                  fontFamily: currentSlide.fontFamily,
                  color: currentSlide.textColor,
                }}
              >
                {currentSlide.content.title}
              </h2>
              <p
                className="text-xl md:text-2xl opacity-80"
                style={{ color: currentSlide.textColor }}
              >
                {currentSlide.content.subtitle}
              </p>
            </>
          )}
          {currentSlide.type === "scripture" && (
            <>
              <p
                className="text-2xl md:text-4xl italic mb-8 leading-relaxed"
                style={{
                  fontFamily: currentSlide.fontFamily,
                  color: currentSlide.textColor,
                }}
              >
                {currentSlide.content.scripture}
              </p>
              <p
                className="text-lg md:text-xl opacity-70"
                style={{ color: currentSlide.textColor }}
              >
                — {currentSlide.content.reference}
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
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
              <span className="hidden sm:inline">Dashboard</span>
            </Link>

            {/* Title */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg gradient-hero flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-serif text-lg font-semibold text-foreground">
                {presentationTitle}
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setIsPreviewMode(true)}
              >
                <Play className="w-4 h-4" />
                <span className="hidden sm:inline">Preview</span>
              </Button>
              <Button variant="outline">
                <Share2 className="w-4 h-4" />
                <span className="hidden sm:inline">Share</span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="hero" disabled={isExporting}>
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">
                      {isExporting ? "Exporting..." : "Export"}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleExport("pptx")}>
                    <FileText className="w-4 h-4 mr-2" />
                    PowerPoint (.pptx)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleExport("pro")}>
                    <Presentation className="w-4 h-4 mr-2" />
                    ProPresenter 7 (.pro)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("pro6")}>
                    <Presentation className="w-4 h-4 mr-2" />
                    ProPresenter 6 (.rtf)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Slide Thumbnails */}
        <aside className="w-64 border-r border-border bg-card overflow-y-auto hidden md:block">
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground text-sm">Slides</h3>
              <Button variant="ghost" size="sm">
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            {slides.map((slide, index) => (
              <motion.div
                key={slide.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`group relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                  selectedSlide === index
                    ? "border-primary shadow-elevated"
                    : "border-border hover:border-primary/50"
                }`}
                onClick={() => setSelectedSlide(index)}
              >
                <div className="flex items-center gap-2 p-2 bg-muted/50">
                  <GripVertical className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {index + 1}
                  </span>
                </div>
                <div
                  className="aspect-video flex items-center justify-center p-3 bg-cover bg-center"
                  style={{ 
                    background: slide.backgroundImage 
                      ? `url(${slide.backgroundImage})` 
                      : slide.background,
                    backgroundSize: 'cover',
                  }}
                >
                  <p
                    className="text-xs text-center line-clamp-2"
                    style={{ color: slide.textColor }}
                  >
                    {slide.content.title || slide.content.scripture}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </aside>

        {/* Preview */}
        <main className="flex-1 flex flex-col">
          {/* Slide Preview */}
          <div className="flex-1 flex items-center justify-center p-8 bg-muted/30">
            <motion.div
              key={selectedSlide}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-4xl aspect-video rounded-2xl overflow-hidden shadow-elevated flex items-center justify-center bg-cover bg-center relative"
              style={{ 
                background: currentSlide.backgroundImage 
                  ? `url(${currentSlide.backgroundImage})` 
                  : currentSlide.background,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              {/* Dark overlay for images */}
              {currentSlide.backgroundImage && (
                <div className="absolute inset-0 bg-black/30" />
              )}
              
              <div className="text-center max-w-3xl px-8 relative z-10">
                {currentSlide.type === "title" && (
                  <>
                    <h1
                      className="text-3xl md:text-5xl font-bold mb-4"
                      style={{
                        fontFamily: currentSlide.fontFamily,
                        color: currentSlide.textColor,
                      }}
                    >
                      {currentSlide.content.title}
                    </h1>
                    <p
                      className="text-lg md:text-xl opacity-80"
                      style={{ color: currentSlide.textColor }}
                    >
                      {currentSlide.content.subtitle}
                    </p>
                  </>
                )}
                {currentSlide.type === "point" && (
                  <>
                    <h2
                      className="text-2xl md:text-4xl font-bold mb-4"
                      style={{
                        fontFamily: currentSlide.fontFamily,
                        color: currentSlide.textColor,
                      }}
                    >
                      {currentSlide.content.title}
                    </h2>
                    <p
                      className="text-lg md:text-xl opacity-80"
                      style={{ color: currentSlide.textColor }}
                    >
                      {currentSlide.content.subtitle}
                    </p>
                  </>
                )}
                {currentSlide.type === "scripture" && (
                  <>
                    <p
                      className="text-lg md:text-2xl italic mb-6 leading-relaxed"
                      style={{
                        fontFamily: currentSlide.fontFamily,
                        color: currentSlide.textColor,
                      }}
                    >
                      {currentSlide.content.scripture}
                    </p>
                    <p
                      className="text-sm md:text-base opacity-70"
                      style={{ color: currentSlide.textColor }}
                    >
                      — {currentSlide.content.reference}
                    </p>
                  </>
                )}
              </div>
            </motion.div>
          </div>

          {/* Toolbar */}
          <div className="border-t border-border bg-card p-4">
            <div className="flex items-center justify-center gap-6 flex-wrap">
              {/* Font */}
              <div className="flex items-center gap-2">
                <Type className="w-4 h-4 text-muted-foreground" />
                <Select 
                  value={currentSlide.fontFamily}
                  onValueChange={handleFontChange}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {fonts.map((font) => (
                      <SelectItem key={font} value={font}>
                        {font}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Text Color */}
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-muted-foreground" />
                <div className="flex gap-1">
                  {colors.slice(0, 6).map((color) => (
                    <button
                      key={color}
                      onClick={() => handleColorChange(color)}
                      className={`w-6 h-6 rounded-full border-2 transition-colors ${
                        currentSlide.textColor === color 
                          ? 'border-primary ring-2 ring-primary/30' 
                          : 'border-border hover:border-primary'
                      }`}
                      style={{ background: color }}
                    />
                  ))}
                </div>
              </div>

              {/* Background */}
              <BackgroundPicker
                currentBackground={currentSlide.background}
                currentBackgroundImage={currentSlide.backgroundImage}
                onBackgroundChange={handleBackgroundChange}
              />

              {/* Navigation */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => navigateSlide("prev")}
                  disabled={selectedSlide === 0}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-muted-foreground min-w-[60px] text-center">
                  {selectedSlide + 1} / {slides.length}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => navigateSlide("next")}
                  disabled={selectedSlide === slides.length - 1}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default SlideEditor;
