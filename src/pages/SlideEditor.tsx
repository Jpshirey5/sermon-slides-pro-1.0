import { useState, useCallback, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { motion, Reorder } from "framer-motion";
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
import { getPresentation, savePresentation, SermonPresentation } from "@/pages/Dashboard";

// Microsoft Word standard fonts - alphabetically ordered
const fonts = [
  "Arial",
  "Arial Black",
  "Book Antiqua",
  "Calibri",
  "Cambria",
  "Candara",
  "Century Gothic",
  "Comic Sans MS",
  "Consolas",
  "Constantia",
  "Corbel",
  "Courier New",
  "Franklin Gothic Medium",
  "Garamond",
  "Georgia",
  "Gill Sans MT",
  "Impact",
  "Lucida Console",
  "Lucida Sans Unicode",
  "Palatino Linotype",
  "Segoe UI",
  "Tahoma",
  "Times New Roman",
  "Trebuchet MS",
  "Verdana",
];

// Primary colors palette
const colors = [
  // White/Light
  "#FFFFFF",
  // Black
  "#000000",
  // Primary colors
  "#FF0000", // Red
  "#FF6600", // Orange
  "#FFCC00", // Yellow
  "#00CC00", // Green
  "#0066FF", // Blue
  "#6600CC", // Purple
  "#FF00CC", // Magenta
  "#00CCCC", // Cyan
  // Additional shades
  "#990000", // Dark Red
  "#CC6600", // Dark Orange
  "#999900", // Olive
  "#006600", // Dark Green
  "#003399", // Dark Blue
  "#660099", // Dark Purple
];

// Generate slides from sermon data
function generateSlidesFromData(presentation: SermonPresentation): SlideData[] {
  const slides: SlideData[] = [];
  const defaultBackground = "linear-gradient(135deg, #5c1e2b 0%, #3d1219 100%)";
  const defaultFont = "Georgia";
  const defaultColor = "#FFFFFF";
  
  // Title slide
  slides.push({
    id: `title-${Date.now()}`,
    type: 'title',
    content: {
      title: presentation.data?.title || presentation.title,
      subtitle: presentation.data?.date 
        ? `${new Date(presentation.data.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
        : new Date(presentation.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    },
    background: defaultBackground,
    fontFamily: defaultFont,
    textColor: defaultColor,
  });
  
  // Generate slides for each point
  if (presentation.data?.points) {
    presentation.data.points.forEach((point, index) => {
      if (point.title) {
        // Point slide
        slides.push({
          id: `point-${point.id}`,
          type: 'point',
          content: {
            title: `${index + 1}. ${point.title}`,
            subtitle: '',
          },
          background: defaultBackground,
          fontFamily: defaultFont,
          textColor: defaultColor,
        });
        
        // Scripture slides for this point
        point.scriptures.forEach((scripture, sIndex) => {
          if (scripture.reference && scripture.text) {
            slides.push({
              id: `scripture-${point.id}-${sIndex}`,
              type: 'scripture',
              content: {
                scripture: `"${scripture.text}"`,
                reference: `${scripture.reference} (${presentation.data?.translation || 'KJV'})`,
              },
              background: defaultBackground,
              fontFamily: defaultFont,
              textColor: defaultColor,
            });
          }
        });
      }
    });
  }
  
  return slides;
}

// Default mock slides for new presentations
const defaultSlides: SlideData[] = [
  {
    id: "1",
    type: "title",
    content: {
      title: "New Presentation",
      subtitle: new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    },
    background: "linear-gradient(135deg, #5c1e2b 0%, #3d1219 100%)",
    fontFamily: "Georgia",
    textColor: "#FFFFFF",
  },
];

const SlideEditor = () => {
  const { id } = useParams();
  const [slides, setSlides] = useState<SlideData[]>(defaultSlides);
  const [selectedSlide, setSelectedSlide] = useState(0);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [presentationTitle, setPresentationTitle] = useState("New Presentation");

  // Load presentation data
  useEffect(() => {
    if (id && id !== "new") {
      const presentation = getPresentation(id);
      if (presentation) {
        setPresentationTitle(presentation.title);
        const generatedSlides = generateSlidesFromData(presentation);
        if (generatedSlides.length > 0) {
          setSlides(generatedSlides);
        }
      }
    }
  }, [id]);

  const currentSlide = slides[selectedSlide];

  const handleReorder = useCallback((newOrder: SlideData[]) => {
    setSlides(newOrder);
    // Update selected slide index if needed
    const currentId = currentSlide.id;
    const newIndex = newOrder.findIndex(s => s.id === currentId);
    if (newIndex !== -1) {
      setSelectedSlide(newIndex);
    }
  }, [currentSlide.id]);

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

  // Apply to ALL slides
  const handleBackgroundChange = (background: string, backgroundImage?: string) => {
    setSlides(slides.map((slide) => ({ ...slide, background, backgroundImage })));
  };

  // Apply to ALL slides
  const handleFontChange = (fontFamily: string) => {
    setSlides(slides.map((slide) => ({ ...slide, fontFamily })));
  };

  // Apply to ALL slides
  const handleColorChange = (textColor: string) => {
    setSlides(slides.map((slide) => ({ ...slide, textColor })));
  };

  // Inline text editing
  const handleContentChange = (field: 'title' | 'subtitle' | 'scripture' | 'reference', value: string) => {
    setSlides(slides.map((slide, index) =>
      index === selectedSlide
        ? { ...slide, content: { ...slide.content, [field]: value } }
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

      {/* Main Content - Fixed height to prevent scrolling */}
      <div className="flex-1 flex overflow-hidden" style={{ height: 'calc(100vh - 64px)' }}>
        {/* Slide Thumbnails with Drag-and-Drop - Scrollable */}
        <aside className="w-56 border-r border-border bg-card hidden md:flex md:flex-col">
          <div className="p-3 border-b border-border">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground text-sm">Slides</h3>
              <Button variant="ghost" size="sm">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3">
            <Reorder.Group
              axis="y"
              values={slides}
              onReorder={handleReorder}
              className="space-y-2"
              layoutScroll
            >
              {slides.map((slide, index) => (
                <Reorder.Item
                  key={slide.id}
                  value={slide}
                  className={`group relative cursor-grab active:cursor-grabbing rounded-lg overflow-hidden border-2 ${
                    selectedSlide === index
                      ? "border-primary shadow-elevated"
                      : "border-border hover:border-primary/50"
                  }`}
                  initial={false}
                  transition={{
                    type: "spring",
                    stiffness: 400,
                    damping: 30,
                  }}
                  whileDrag={{ 
                    scale: 1.03, 
                    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
                    zIndex: 50,
                  }}
                  dragListener={true}
                  dragConstraints={{ top: 0, bottom: 0 }}
                >
                  <div
                    onClick={() => setSelectedSlide(index)}
                    className="w-full"
                  >
                    <div className="flex items-center gap-2 p-1.5 bg-muted/50">
                      <GripVertical className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {index + 1}
                      </span>
                    </div>
                    <div
                      className="aspect-video flex items-center justify-center p-2 bg-cover bg-center"
                      style={{ 
                        background: slide.backgroundImage 
                          ? `url(${slide.backgroundImage})` 
                          : slide.background,
                        backgroundSize: 'cover',
                      }}
                    >
                      <p
                        className="text-[10px] text-center line-clamp-2"
                        style={{ 
                          color: slide.textColor,
                          fontFamily: slide.fontFamily,
                        }}
                      >
                        {slide.content.title || slide.content.scripture}
                      </p>
                    </div>
                  </div>
                </Reorder.Item>
              ))}
            </Reorder.Group>
          </div>
        </aside>

        {/* Preview - Compact to fit without scroll */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Slide Preview */}
          <div className="flex-1 flex items-center justify-center p-4 bg-muted/30 min-h-0">
            <motion.div
              key={selectedSlide}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-3xl aspect-video rounded-xl overflow-hidden shadow-elevated flex items-center justify-center bg-cover bg-center relative"
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
              
              <div className="text-center max-w-3xl px-8 relative z-10 w-full">
                {currentSlide.type === "title" && (
                  <>
                    <input
                      type="text"
                      value={currentSlide.content.title || ""}
                      onChange={(e) => handleContentChange('title', e.target.value)}
                      className="text-3xl md:text-5xl font-bold mb-4 bg-transparent border-none outline-none text-center w-full focus:ring-2 focus:ring-white/30 rounded-lg px-2 py-1"
                      style={{
                        fontFamily: currentSlide.fontFamily,
                        color: currentSlide.textColor,
                      }}
                      placeholder="Enter title..."
                    />
                    <input
                      type="text"
                      value={currentSlide.content.subtitle || ""}
                      onChange={(e) => handleContentChange('subtitle', e.target.value)}
                      className="text-lg md:text-xl opacity-80 bg-transparent border-none outline-none text-center w-full focus:ring-2 focus:ring-white/30 rounded-lg px-2 py-1"
                      style={{ color: currentSlide.textColor }}
                      placeholder="Enter subtitle..."
                    />
                  </>
                )}
                {currentSlide.type === "point" && (
                  <>
                    <input
                      type="text"
                      value={currentSlide.content.title || ""}
                      onChange={(e) => handleContentChange('title', e.target.value)}
                      className="text-2xl md:text-4xl font-bold mb-4 bg-transparent border-none outline-none text-center w-full focus:ring-2 focus:ring-white/30 rounded-lg px-2 py-1"
                      style={{
                        fontFamily: currentSlide.fontFamily,
                        color: currentSlide.textColor,
                      }}
                      placeholder="Enter point..."
                    />
                    <input
                      type="text"
                      value={currentSlide.content.subtitle || ""}
                      onChange={(e) => handleContentChange('subtitle', e.target.value)}
                      className="text-lg md:text-xl opacity-80 bg-transparent border-none outline-none text-center w-full focus:ring-2 focus:ring-white/30 rounded-lg px-2 py-1"
                      style={{ color: currentSlide.textColor }}
                      placeholder="Enter subtitle..."
                    />
                  </>
                )}
                {currentSlide.type === "scripture" && (
                  <>
                    <textarea
                      value={currentSlide.content.scripture || ""}
                      onChange={(e) => handleContentChange('scripture', e.target.value)}
                      className="text-lg md:text-2xl italic mb-6 leading-relaxed bg-transparent border-none outline-none text-center w-full resize-none focus:ring-2 focus:ring-white/30 rounded-lg px-2 py-1 min-h-[120px]"
                      style={{
                        fontFamily: currentSlide.fontFamily,
                        color: currentSlide.textColor,
                      }}
                      placeholder="Enter scripture text..."
                    />
                    <input
                      type="text"
                      value={currentSlide.content.reference || ""}
                      onChange={(e) => handleContentChange('reference', e.target.value)}
                      className="text-sm md:text-base opacity-70 bg-transparent border-none outline-none text-center w-full focus:ring-2 focus:ring-white/30 rounded-lg px-2 py-1"
                      style={{ color: currentSlide.textColor }}
                      placeholder="— Reference"
                    />
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
                <Select 
                  value={currentSlide.textColor}
                  onValueChange={handleColorChange}
                >
                  <SelectTrigger className="w-32">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-4 h-4 rounded-full border border-border" 
                        style={{ background: currentSlide.textColor }}
                      />
                      <span className="text-xs truncate">
                        {currentSlide.textColor}
                      </span>
                    </div>
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    <div className="grid grid-cols-4 gap-1 p-2">
                      {colors.map((color) => (
                        <button
                          key={color}
                          onClick={() => handleColorChange(color)}
                          className={`w-8 h-8 rounded-md border-2 transition-all ${
                            currentSlide.textColor === color 
                              ? 'border-primary ring-2 ring-primary/30 scale-110' 
                              : 'border-border hover:border-primary hover:scale-105'
                          }`}
                          style={{ background: color }}
                          title={color}
                        />
                      ))}
                    </div>
                  </SelectContent>
                </Select>
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