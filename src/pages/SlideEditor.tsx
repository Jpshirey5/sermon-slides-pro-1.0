import { useState, useCallback, useEffect, useRef } from "react";
import { Link, useParams, useSearchParams, useLocation, useNavigate } from "react-router-dom";
import { motion, Reorder, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, ArrowLeft, Download, Play, GripVertical, Plus, Type, Palette, ChevronLeft, ChevronRight, Trash2, AlignVerticalSpaceAround, Undo2, Redo2, Copy, Check, Cloud, BookMarked, Pencil } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BackgroundPicker } from "@/components/BackgroundPicker";
import { exportToPowerPoint, SlideData } from "@/lib/export-pptx";
import { exportAsProBundle, exportAsPlainText, validateSlidesForExport } from "@/services/proPresenterExport";
import { splitVerseText } from "@/lib/scripture-api";
import { ExportOptionsModal } from "@/components/ExportOptionsModal";
import { PaymentPromptModal } from "@/components/PaymentPromptModal";
import { toast } from "sonner";
import { getPresentation, SermonPresentation, saveEditorSlides as saveEditorSlidesToDb, getEditorSlides as getEditorSlidesFromDb } from "@/lib/presentations";
import { useAuth } from "@/contexts/AuthContext";

// Microsoft Word standard fonts - alphabetically ordered
const fonts = ["Arial", "Arial Black", "Book Antiqua", "Calibri", "Cambria", "Candara", "Century Gothic", "Comic Sans MS", "Consolas", "Constantia", "Corbel", "Courier New", "Franklin Gothic Medium", "Garamond", "Georgia", "Gill Sans MT", "Impact", "Lucida Console", "Lucida Sans Unicode", "Palatino Linotype", "Segoe UI", "Tahoma", "Times New Roman", "Trebuchet MS", "Verdana"];

// Primary colors palette
const colors = [
// White/Light
"#FFFFFF",
// Black
"#000000",
// Primary colors
"#FF0000",
// Red
"#FF6600",
// Orange
"#FFCC00",
// Yellow
"#00CC00",
// Green
"#0066FF",
// Blue
"#6600CC",
// Purple
"#FF00CC",
// Magenta
"#00CCCC",
// Cyan
// Additional shades
"#990000",
// Dark Red
"#CC6600",
// Dark Orange
"#999900",
// Olive
"#006600",
// Dark Green
"#003399",
// Dark Blue
"#660099" // Dark Purple
];

// Line spacing options
const lineSpacingOptions = [{
  value: "1",
  label: "1.0 (Single)"
}, {
  value: "1.15",
  label: "1.15"
}, {
  value: "1.5",
  label: "1.5"
}, {
  value: "2",
  label: "2.0 (Double)"
}, {
  value: "2.5",
  label: "2.5"
}, {
  value: "3",
  label: "3.0 (Triple)"
}];

// Generate slides from sermon data
function generateSlidesFromData(presentation: SermonPresentation): SlideData[] {
  const slides: SlideData[] = [];
  const defaultBackground = "transparent";
  const defaultFont = "Georgia";
  const defaultColor = "#FFFFFF";
  const defaultLineSpacing = 1.5;

  // Title slide
  slides.push({
    id: `title-${Date.now()}`,
    type: 'title',
    content: {
      title: presentation.data?.title || presentation.title,
      subtitle: presentation.data?.date ? `${new Date(presentation.data.date).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })}` : new Date(presentation.date).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    },
    background: defaultBackground,
    fontFamily: defaultFont,
    textColor: defaultColor,
    lineSpacing: defaultLineSpacing
  });

  // Generate slides for each point
  if (presentation.data?.points) {
    presentation.data.points.forEach((point) => {
      const isVerseType = point.type === 'verse';
      
      if (!isVerseType && point.title) {
        // Point slide
        slides.push({
          id: `point-${point.id}`,
          type: 'point',
          content: {
            title: point.title,
            subtitle: ''
          },
          background: defaultBackground,
          fontFamily: defaultFont,
          textColor: defaultColor,
          lineSpacing: defaultLineSpacing
        });
      }

      // Scripture slides (for both point and verse types)
      if (isVerseType || point.title) {
        point.scriptures.forEach((scripture, sIndex) => {
          if (scripture.reference && scripture.text) {
            const isVerseByVerse = presentation.data?.verseBreakdown === 'verse-by-verse';
            
            if (isVerseByVerse) {
              const verseList = scripture.verses && scripture.verses.length > 0
                ? scripture.verses.map(v => {
                    const parsed = scripture.reference.match(/^(.+?\s+\d+):/);
                    const bookChapter = parsed ? parsed[1] : scripture.reference;
                    return { text: v.text, reference: `${bookChapter}:${v.verse}` };
                  })
                : splitVerseText(scripture.text, scripture.reference);
              
              verseList.forEach((verse, vIndex) => {
                slides.push({
                  id: `scripture-${point.id}-${sIndex}-${vIndex}`,
                  type: 'scripture',
                  content: {
                    scripture: `"${verse.text}"`,
                    reference: `${verse.reference} (${presentation.data?.translation || 'KJV'})`
                  },
                  background: defaultBackground,
                  fontFamily: defaultFont,
                  textColor: defaultColor,
                  lineSpacing: defaultLineSpacing
                });
              });
            } else {
              slides.push({
                id: `scripture-${point.id}-${sIndex}`,
                type: 'scripture',
                content: {
                  scripture: `"${scripture.text}"`,
                  reference: `${scripture.reference} (${presentation.data?.translation || 'KJV'})`
                },
                background: defaultBackground,
                fontFamily: defaultFont,
                textColor: defaultColor,
                lineSpacing: defaultLineSpacing
              });
            }
          }
        });
      }
    });
  }
  return slides;
}

// Default mock slides for new presentations
const defaultSlides: SlideData[] = [{
  id: "1",
  type: "title",
  content: {
    title: "New Presentation",
    subtitle: new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  },
  background: "transparent",
  fontFamily: "Georgia",
  textColor: "#FFFFFF",
  lineSpacing: 1.5
}];

const MAX_HISTORY = 50;

// These are now async wrappers using the Supabase-backed functions from presentations.ts

const SlideEditor = () => {
  const { id } = useParams();
  const location = useLocation();
  const editorNavigate = useNavigate();
  const { subscription } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [slides, setSlides] = useState<SlideData[]>(defaultSlides);
  const [selectedSlide, setSelectedSlide] = useState(0);
  const [selectedSlides, setSelectedSlides] = useState<Set<number>>(new Set([0]));
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [presentationTitle, setPresentationTitle] = useState("New Presentation");
  const [isDragging, setIsDragging] = useState(false);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Payment state
  const [isExportUnlocked, setIsExportUnlocked] = useState(() => {
    if (id && id !== "new") {
      return localStorage.getItem(`export_unlocked:${id}`) === "true";
    }
    return false;
  });
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  
  // Undo/Redo history
  const [history, setHistory] = useState<SlideData[][]>([defaultSlides]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const isUndoRedoRef = useRef(false);
  const isInitialLoadRef = useRef(true);

  // Handle payment return from Stripe embedded checkout (fallback for return_url)
  useEffect(() => {
    const paymentStatus = searchParams.get('payment');
    
    if (paymentStatus === 'success' && id && id !== "new") {
      localStorage.setItem(`export_unlocked:${id}`, "true");
      setIsExportUnlocked(true);
      searchParams.delete('payment');
      searchParams.delete('session_id');
      setSearchParams(searchParams, { replace: true });
      setShowExportModal(true);
      toast.success('Payment successful! Choose your export format.');
    }
  }, [searchParams, setSearchParams, id]);

  // Handle successful payment from embedded checkout
  const handlePaymentComplete = () => {
    if (id && id !== "new") {
      localStorage.setItem(`export_unlocked:${id}`, "true");
      setIsExportUnlocked(true);
      setShowPaymentModal(false);
      setShowExportModal(true);
      toast.success('Payment successful! Choose your export format.');
    }
  };


  // Load presentation data - check for saved editor slides first
  useEffect(() => {
    const loadData = async () => {
      if (id && id !== "new") {
        // First, try to load saved editor slides from Supabase
        const savedEditorSlides = await getEditorSlidesFromDb(id);
        if (savedEditorSlides && savedEditorSlides.length > 0 && savedEditorSlides[0]?.id) {
          setSlides(savedEditorSlides);
          setHistory([savedEditorSlides]);
          setHistoryIndex(0);
          
          // Get title from presentation
          const presentation = await getPresentation(id);
          if (presentation) {
            setPresentationTitle(presentation.title);
          }
        } else {
          // No saved editor slides, generate from presentation data
          const presentation = await getPresentation(id);
          if (presentation) {
            setPresentationTitle(presentation.title);
            const generatedSlides = generateSlidesFromData(presentation);
            if (generatedSlides.length > 0) {
              setSlides(generatedSlides);
              setHistory([generatedSlides]);
              setHistoryIndex(0);
            }
          }
        }
      }
      isInitialLoadRef.current = false;
    };
    loadData();
  }, [id]);
  const currentSlide = slides[selectedSlide];
  
  // Auto-save slides whenever they change
  useEffect(() => {
    if (id && id !== "new" && !isInitialLoadRef.current) {
      // Show saving indicator
      setSaveStatus('saving');
      
      // Clear any existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      // Debounce save
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await saveEditorSlidesToDb(id, slides);
          setSaveStatus('saved');
          
          // Reset to idle after 2 seconds
          setTimeout(() => {
            setSaveStatus('idle');
          }, 2000);
        } catch (error) {
          console.error('Failed to save:', error);
          toast.error('Failed to save changes');
          setSaveStatus('idle');
        }
      }, 500);
    }
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [slides, id]);
  
  // Update history when slides change (but not during undo/redo)
  useEffect(() => {
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      return;
    }
    
    // Don't add to history if slides are the same
    const lastHistorySlides = history[historyIndex];
    if (JSON.stringify(lastHistorySlides) === JSON.stringify(slides)) {
      return;
    }
    
    // Add new state to history, removing any future states
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(slides);
    
    // Limit history size
    if (newHistory.length > MAX_HISTORY) {
      newHistory.shift();
    }
    
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [slides]);
  
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;
  
  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    isUndoRedoRef.current = true;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    setSlides(history[newIndex]);
    toast.success("Undo");
  }, [canUndo, historyIndex, history]);
  
  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    isUndoRedoRef.current = true;
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    setSlides(history[newIndex]);
    toast.success("Redo");
  }, [canRedo, historyIndex, history]);
  
  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);
  
  const handleReorder = useCallback((newOrder: SlideData[]) => {
    // If multiple slides are selected and we're dragging, move them as a group
    if (selectedSlides.size > 1 && isDragging) {
      // Find which slide was being dragged (the primary selected)
      const draggedSlide = slides[selectedSlide];
      const draggedNewIndex = newOrder.findIndex(s => s.id === draggedSlide.id);
      
      // Get all selected slide objects in their original order
      const selectedSlideObjects = slides.filter((_, i) => selectedSlides.has(i));
      const unselectedSlides = newOrder.filter(s => !selectedSlides.has(slides.findIndex(os => os.id === s.id)));
      
      // Insert selected slides at the dragged position
      const insertIndex = unselectedSlides.findIndex(s => s.id === newOrder[draggedNewIndex]?.id);
      const finalOrder = [...unselectedSlides];
      const realInsert = insertIndex >= 0 ? insertIndex : unselectedSlides.length;
      finalOrder.splice(realInsert, 0, ...selectedSlideObjects);
      
      setSlides(finalOrder);
      
      // Update selection indices
      const newSelectedSet = new Set<number>();
      selectedSlideObjects.forEach(s => {
        const newIdx = finalOrder.findIndex(fs => fs.id === s.id);
        if (newIdx !== -1) newSelectedSet.add(newIdx);
      });
      setSelectedSlides(newSelectedSet);
      setSelectedSlide(finalOrder.findIndex(s => s.id === draggedSlide.id));
    } else {
      setSlides(newOrder);
      const currentId = currentSlide.id;
      const newIndex = newOrder.findIndex(s => s.id === currentId);
      if (newIndex !== -1) {
        setSelectedSlide(newIndex);
        setSelectedSlides(new Set([newIndex]));
      }
    }
    setIsDragging(false);
    setDragOverIndex(null);
  }, [currentSlide.id, selectedSlides, selectedSlide, slides, isDragging]);

  const handleSlideClick = useCallback((index: number, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      // Toggle individual slide in selection
      const newSet = new Set(selectedSlides);
      if (newSet.has(index)) {
        if (newSet.size > 1) {
          newSet.delete(index);
          if (selectedSlide === index) {
            setSelectedSlide([...newSet][0]);
          }
        }
      } else {
        newSet.add(index);
      }
      setSelectedSlides(newSet);
      setSelectedSlide(index);
    } else if (e.shiftKey) {
      // Range select from last selected to clicked
      const start = Math.min(selectedSlide, index);
      const end = Math.max(selectedSlide, index);
      const newSet = new Set<number>();
      for (let i = start; i <= end; i++) newSet.add(i);
      setSelectedSlides(newSet);
      setSelectedSlide(index);
    } else {
      // Single select
      setSelectedSlide(index);
      setSelectedSlides(new Set([index]));
    }
  }, [selectedSlide, selectedSlides]);

  const handleDragStart = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setDragOverIndex(null);
  }, []);
  // Handle export button click - check subscription and unlock status
  const handleExportButtonClick = () => {
    if (subscription.subscribed) {
      // Pro user — show export options immediately
      setShowExportModal(true);
      return;
    }
    
    // Check localStorage for per-sermon unlock status
    const isUnlocked = id && id !== "new" 
      ? localStorage.getItem(`export_unlocked:${id}`) === "true"
      : false;
      
    if (isUnlocked) {
      setShowExportModal(true);
    } else {
      if (!id || id === "new") {
        toast.error("Please save your presentation first");
        return;
      }
      // Show payment modal
      setShowPaymentModal(true);
    }
  };
  
  const handleExport = async (format: "pptx" | "probundle" | "txt") => {
    // Validate slides before export
    const validation = validateSlidesForExport(slides);
    if (!validation.isValid) {
      toast.error("Cannot export", {
        description: validation.errors.join(' ')
      });
      return;
    }
    
    setIsExporting(true);
    try {
      if (format === "pptx") {
        await exportToPowerPoint(slides, presentationTitle);
        toast.success("PowerPoint file exported successfully!", {
          description: `${slides.length} slides exported to ${presentationTitle}.pptx`
        });
      } else if (format === "probundle") {
        await exportAsProBundle(slides, presentationTitle);
        toast.success("ProPresenter file exported successfully!", {
          description: `${slides.length} slides exported to ${presentationTitle}.probundle`
        });
      } else if (format === "txt") {
        exportAsPlainText(slides, presentationTitle);
        toast.success("Plain text file exported successfully!", {
          description: `${slides.length} slides exported to ${presentationTitle}.txt`
        });
      }
      setShowExportModal(false);
    } catch (error) {
      console.error("Export error:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast.error("Export failed", {
        description: `Could not export presentation: ${errorMessage}. Please try again.`
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Apply to ALL slides
  const handleBackgroundChange = (background: string, backgroundImage?: string) => {
    setSlides(slides.map(slide => ({
      ...slide,
      background,
      backgroundImage
    })));
  };

  // Apply to ALL slides
  const handleFontChange = (fontFamily: string) => {
    setSlides(slides.map(slide => ({
      ...slide,
      fontFamily
    })));
  };

  // Apply to ALL slides
  const handleColorChange = (textColor: string) => {
    setSlides(slides.map(slide => ({
      ...slide,
      textColor
    })));
  };

  // Inline text editing
  const handleContentChange = (field: 'title' | 'subtitle' | 'scripture' | 'reference', value: string) => {
    setSlides(slides.map((slide, index) => index === selectedSlide ? {
      ...slide,
      content: {
        ...slide.content,
        [field]: value
      }
    } : slide));
  };

  // Apply line spacing to ALL slides
  const handleLineSpacingChange = (lineSpacing: string) => {
    const spacing = parseFloat(lineSpacing);
    setSlides(slides.map(slide => ({
      ...slide,
      lineSpacing: spacing
    })));
  };

  // Add new slide
  const handleAddSlide = (type: 'title' | 'point' | 'scripture' | 'blank') => {
    const newSlide: SlideData = {
      id: `slide-${Date.now()}`,
      type,
      content: {
        title: type === 'title' ? 'New Title' : type === 'point' ? 'New Point' : '',
        subtitle: '',
        scripture: type === 'scripture' ? 'Enter scripture text...' : '',
        reference: type === 'scripture' ? 'Book 1:1' : ''
      },
      background: currentSlide.background,
      backgroundImage: currentSlide.backgroundImage,
      fontFamily: currentSlide.fontFamily,
      textColor: currentSlide.textColor,
      lineSpacing: currentSlide.lineSpacing || 1.5
    };
    const newSlides = [...slides];
    newSlides.splice(selectedSlide + 1, 0, newSlide);
    setSlides(newSlides);
    setSelectedSlide(selectedSlide + 1);
    toast.success("Slide added");
  };

  // Delete selected slide(s)
  const handleDeleteSlide = () => {
    if (slides.length <= 1) {
      toast.error("Cannot delete the only slide");
      return;
    }
    const indicesToDelete = selectedSlides.size > 1 ? selectedSlides : new Set([selectedSlide]);
    const newSlides = slides.filter((_, index) => !indicesToDelete.has(index));
    if (newSlides.length === 0) {
      toast.error("Cannot delete all slides");
      return;
    }
    setSlides(newSlides);
    const newIndex = Math.min(Math.min(...indicesToDelete), newSlides.length - 1);
    setSelectedSlide(newIndex);
    setSelectedSlides(new Set([newIndex]));
    toast.success(indicesToDelete.size > 1 ? `${indicesToDelete.size} slides deleted` : "Slide deleted");
  };
  
  // Duplicate current slide
  const handleDuplicateSlide = () => {
    const slideToDuplicate = slides[selectedSlide];
    const duplicatedSlide: SlideData = {
      ...slideToDuplicate,
      id: `slide-${Date.now()}`,
      content: { ...slideToDuplicate.content }
    };
    const newSlides = [...slides];
    newSlides.splice(selectedSlide + 1, 0, duplicatedSlide);
    setSlides(newSlides);
    setSelectedSlide(selectedSlide + 1);
    toast.success("Slide duplicated");
  };
  
  const navigateSlide = (direction: "prev" | "next") => {
    if (direction === "prev" && selectedSlide > 0) {
      setSelectedSlide(selectedSlide - 1);
    } else if (direction === "next" && selectedSlide < slides.length - 1) {
      setSelectedSlide(selectedSlide + 1);
    }
  };
  if (isPreviewMode) {
    return <div className="fixed inset-0 z-50 flex items-center justify-center bg-cover bg-center" style={{
      background: currentSlide.backgroundImage ? `url(${currentSlide.backgroundImage})` : currentSlide.background,
      backgroundSize: 'cover',
      backgroundPosition: 'center'
    }} onClick={() => setIsPreviewMode(false)}>
        {/* Dark overlay for images */}
        {currentSlide.backgroundImage && <div className="absolute inset-0 bg-black/40" />}
        
        <div className="absolute top-4 right-4 flex gap-2 z-10">
          <Button variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={e => {
          e.stopPropagation();
          setIsPreviewMode(false);
        }}>
            Exit Preview
          </Button>
        </div>

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 z-10">
          <Button variant="outline" size="icon" className="bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={e => {
          e.stopPropagation();
          navigateSlide("prev");
        }} disabled={selectedSlide === 0}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <span className="text-white text-sm">
            {selectedSlide + 1} / {slides.length}
          </span>
          <Button variant="outline" size="icon" className="bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={e => {
          e.stopPropagation();
          navigateSlide("next");
        }} disabled={selectedSlide === slides.length - 1}>
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        <div className="text-center max-w-4xl px-8 relative z-10">
          {currentSlide.type === "title" && <>
              <h1 className="text-5xl md:text-7xl font-bold mb-6" style={{
            fontFamily: currentSlide.fontFamily,
            color: currentSlide.textColor
          }}>
                {currentSlide.content.title}
              </h1>
              <p className="text-xl md:text-2xl opacity-80" style={{
            color: currentSlide.textColor
          }}>
                {currentSlide.content.subtitle}
              </p>
            </>}
          {currentSlide.type === "point" && <>
              <h2 className="text-4xl md:text-6xl font-bold mb-6" style={{
            fontFamily: currentSlide.fontFamily,
            color: currentSlide.textColor
          }}>
                {currentSlide.content.title}
              </h2>
              <p className="text-xl md:text-2xl opacity-80" style={{
            color: currentSlide.textColor
          }}>
                {currentSlide.content.subtitle}
              </p>
            </>}
          {currentSlide.type === "scripture" && <div className="flex flex-col flex-1 w-full items-center">
              <p className="text-2xl md:text-4xl italic mb-8 leading-relaxed" style={{
            fontFamily: currentSlide.fontFamily,
            color: currentSlide.textColor
          }}>
                {currentSlide.content.scripture}
              </p>
              <p className="text-lg md:text-xl opacity-70 mt-auto w-full text-right" style={{
            color: currentSlide.textColor
          }}>
                {currentSlide.content.reference}
              </p>
            </div>}
        </div>
      </div>;
  }
  return <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Header - Fixed height */}
      <header className="h-14 border-b border-border bg-card flex-shrink-0">
        <div className="h-full px-4">
          <div className="flex items-center justify-between h-full">
            {/* Back */}
            <Link to="/dashboard" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-5 h-5" />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>

            {/* Title + Paid Badge + Save Indicator */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg gradient-hero flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-serif text-lg font-semibold text-foreground">
                {presentationTitle}
              </span>
              
              {/* Paid Badge - shows when export is unlocked */}
              {isExportUnlocked && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                  <Check className="w-3 h-3 text-primary" />
                  <span className="text-xs font-medium text-primary">Paid</span>
                </div>
              )}
              
              {/* Save Indicator */}
              <AnimatePresence mode="wait">
                {saveStatus === 'saving' && (
                  <motion.div
                    key="saving"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-full"
                  >
                    <Cloud className="w-3 h-3 animate-pulse" />
                    <span>Saving...</span>
                  </motion.div>
                )}
                {saveStatus === 'saved' && (
                  <motion.div
                    key="saved"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center gap-1.5 text-xs text-primary bg-primary/10 px-2 py-1 rounded-full"
                  >
                    <Check className="w-3 h-3" />
                    <span>Saved</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {/* Undo/Redo */}
              <div className="flex items-center gap-1 mr-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
                  <Undo2 className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
                  <Redo2 className="w-4 h-4" />
                </Button>
              </div>
              
              {id && id !== "new" && (
                <Button variant="outline" onClick={async () => {
                  const presentation = await getPresentation(id);
                  if (presentation?.data) {
                    const target = location.state?.from === "dashboard" ? '/dashboard/create' : '/create';
                    editorNavigate(target, { state: { editData: presentation.data, editId: id } });
                  } else {
                    toast.error("Original sermon form data not found.");
                  }
                }} title="Edit sermon form">
                  <Pencil className="w-4 h-4" />
                  <span className="hidden sm:inline">Edit</span>
                </Button>
              )}
              <Button variant="outline" onClick={() => setIsPreviewMode(true)}>
                <Play className="w-4 h-4" />
                <span className="hidden sm:inline">Preview</span>
              </Button>
              <Button variant="hero" disabled={isExporting} onClick={handleExportButtonClick}>
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {isExporting ? "Exporting..." : "Export"}
                </span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - Fixed layout, no page scroll */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Slide Thumbnails - ONLY scrollable area */}
        <aside className="w-52 border-r border-border bg-card hidden md:flex md:flex-col flex-shrink-0 overflow-hidden">
          <div className="p-2 border-b border-border flex-shrink-0">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground text-xs">Slides</h3>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                    <Plus className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleAddSlide('title')}>
                    Title Slide
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleAddSlide('point')}>
                    Point Slide
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleAddSlide('scripture')}>
                    Scripture Slide
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleAddSlide('blank')}>
                    Blank Slide
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          
          {/* Scrollable slide list - ONLY this scrolls */}
          <div className="flex-1 overflow-y-auto p-2">
            <Reorder.Group axis="y" values={slides} onReorder={handleReorder} className="space-y-1.5" layoutScroll>
              {slides.map((slide, index) => (
                <Reorder.Item 
                  key={slide.id} 
                  value={slide} 
                  className={`group relative cursor-grab active:cursor-grabbing rounded-md overflow-hidden border-2 transition-all ${
                    selectedSlides.has(index)
                      ? selectedSlide === index
                        ? "border-primary shadow-elevated" 
                        : "border-primary/60 shadow-sm bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`} 
                  initial={false} 
                  transition={{
                    type: "spring",
                    stiffness: 500,
                    damping: 35
                  }} 
                  whileDrag={{
                    scale: 1.05,
                    boxShadow: "0 15px 40px rgba(0,0,0,0.35)",
                    zIndex: 100,
                    cursor: "grabbing"
                  }}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  dragListener={true}
                  layout
                >
                  {/* Drop indicator - shows above the slide when dragging */}
                  {isDragging && dragOverIndex === index && (
                    <motion.div 
                      className="absolute -top-1.5 left-0 right-0 h-1 bg-primary rounded-full z-50"
                      initial={{ scaleX: 0, opacity: 0 }}
                      animate={{ scaleX: 1, opacity: 1 }}
                      exit={{ scaleX: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    />
                  )}
                  
                  <div 
                    onClick={(e) => handleSlideClick(index, e)} 
                    className="w-full"
                    onMouseEnter={() => isDragging && setDragOverIndex(index)}
                    onMouseLeave={() => isDragging && dragOverIndex === index && setDragOverIndex(null)}
                  >
                    <div className="flex items-center justify-between px-1.5 py-1 bg-muted/50">
                      <div className="flex items-center gap-1">
                        <GripVertical className="w-2.5 h-2.5 text-muted-foreground cursor-grab active:cursor-grabbing" />
                        <span className="text-[10px] text-muted-foreground font-medium">
                          {index + 1}
                        </span>
                      </div>
                      {selectedSlides.has(index) && slides.length > 1 && (
                        <button 
                          onClick={e => {
                            e.stopPropagation();
                            handleDeleteSlide();
                          }} 
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-destructive/20 rounded"
                        >
                          <Trash2 className="w-2.5 h-2.5 text-destructive" />
                        </button>
                      )}
                    </div>
                    <div 
                      className="aspect-video flex items-center justify-center p-1.5 bg-cover bg-center relative" 
                      style={{
                        backgroundSize: 'cover'
                      }}
                    >
                      {/* Checkerboard pattern for transparent backgrounds */}
                      {slide.background === 'transparent' && !slide.backgroundImage && (
                        <div 
                          className="absolute inset-0"
                          style={{
                            backgroundImage: 'repeating-conic-gradient(#374151 0% 25%, #1f2937 0% 50%)',
                            backgroundSize: '8px 8px'
                          }}
                        />
                      )}
                      {/* Actual background */}
                      {(slide.background !== 'transparent' || slide.backgroundImage) && (
                        <div 
                          className="absolute inset-0"
                          style={{
                            background: slide.backgroundImage ? `url(${slide.backgroundImage})` : slide.background,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center'
                          }}
                        />
                      )}
                      <p 
                        className="text-[8px] text-center line-clamp-2 relative z-10" 
                        style={{
                          color: slide.textColor,
                          fontFamily: slide.fontFamily
                        }}
                      >
                        {slide.content.title || slide.content.scripture}
                      </p>
                    </div>
                  </div>
                </Reorder.Item>
              ))}
            </Reorder.Group>
            
            {/* Drop indicator at the bottom when dragging past last slide */}
            {isDragging && dragOverIndex === slides.length && (
              <motion.div 
                className="mt-1.5 h-1 bg-primary rounded-full"
                initial={{ scaleX: 0, opacity: 0 }}
                animate={{ scaleX: 1, opacity: 1 }}
                exit={{ scaleX: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
              />
            )}
          </div>
        </aside>

        {/* Main Editor Area - Fixed, never scrolls */}
        <main className="flex-1 flex flex-col overflow-hidden min-h-0">
          {/* Slide Preview - Fixed region, centered */}
          <div className="flex-1 flex items-center justify-center p-4 bg-muted/30 min-h-0 overflow-hidden">
            <motion.div key={selectedSlide} initial={{
            opacity: 0,
            scale: 0.95
          }} animate={{
            opacity: 1,
            scale: 1
          }} transition={{
            duration: 0.3
          }} className="w-full max-w-2xl aspect-video rounded-lg overflow-hidden shadow-elevated flex items-center justify-center relative" style={{
            maxHeight: 'calc(100% - 1rem)'
          }}>
              {/* Checkerboard pattern for transparent backgrounds */}
              {currentSlide.background === 'transparent' && !currentSlide.backgroundImage && (
                <div 
                  className="absolute inset-0"
                  style={{
                    backgroundImage: 'repeating-conic-gradient(#374151 0% 25%, #1f2937 0% 50%)',
                    backgroundSize: '16px 16px'
                  }}
                />
              )}
              
              {/* Actual background layer */}
              {(currentSlide.background !== 'transparent' || currentSlide.backgroundImage) && (
                <div 
                  className="absolute inset-0 bg-cover bg-center"
                  style={{
                    background: currentSlide.backgroundImage ? `url(${currentSlide.backgroundImage})` : currentSlide.background,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                  }}
                />
              )}
              
              {/* Dark overlay for images */}
              {currentSlide.backgroundImage && <div className="absolute inset-0 bg-black/30" />}
              
              <div className="text-center max-w-2xl px-6 relative z-10 w-full flex flex-col items-center justify-center" style={{
              lineHeight: currentSlide.lineSpacing || 1.5
            }}>
                {currentSlide.type === "title" && <>
                    <input type="text" value={currentSlide.content.title || ""} onChange={e => handleContentChange('title', e.target.value)} className="text-2xl md:text-4xl font-bold bg-transparent border-none outline-none text-center w-full focus:ring-2 focus:ring-white/30 rounded-lg px-2 py-1" style={{
                  fontFamily: currentSlide.fontFamily,
                  color: currentSlide.textColor,
                  marginBottom: `${(currentSlide.lineSpacing || 1.5) * 0.5}rem`
                }} placeholder="Enter title..." />
                    <input type="text" value={currentSlide.content.subtitle || ""} onChange={e => handleContentChange('subtitle', e.target.value)} className="text-base md:text-lg opacity-80 bg-transparent border-none outline-none text-center w-full focus:ring-2 focus:ring-white/30 rounded-lg px-2 py-1" style={{
                  color: currentSlide.textColor
                }} placeholder="Enter subtitle..." />
                  </>}
                {currentSlide.type === "point" && <>
                    <input type="text" value={currentSlide.content.title || ""} onChange={e => handleContentChange('title', e.target.value)} className="text-xl md:text-3xl font-bold bg-transparent border-none outline-none text-center w-full focus:ring-2 focus:ring-white/30 rounded-lg px-2 py-1" style={{
                  fontFamily: currentSlide.fontFamily,
                  color: currentSlide.textColor,
                  marginBottom: `${(currentSlide.lineSpacing || 1.5) * 0.5}rem`
                }} placeholder="Enter point..." />
                    <input type="text" value={currentSlide.content.subtitle || ""} onChange={e => handleContentChange('subtitle', e.target.value)} className="text-base md:text-lg opacity-80 bg-transparent border-none outline-none text-center w-full focus:ring-2 focus:ring-white/30 rounded-lg px-2 py-1" style={{
                  color: currentSlide.textColor
                }} placeholder="Enter subtitle..." />
                  </>}
                {currentSlide.type === "scripture" && <>
                    <textarea value={currentSlide.content.scripture || ""} onChange={e => handleContentChange('scripture', e.target.value)} className="text-base md:text-xl italic bg-transparent border-none outline-none text-center w-full resize-none focus:ring-2 focus:ring-white/30 rounded-lg px-2 py-1 min-h-[80px]" style={{
                  fontFamily: currentSlide.fontFamily,
                  color: currentSlide.textColor,
                  lineHeight: currentSlide.lineSpacing || 1.5,
                  marginBottom: `${(currentSlide.lineSpacing || 1.5) * 0.5}rem`
                }} placeholder="Enter scripture text..." />
                    <input type="text" value={currentSlide.content.reference || ""} onChange={e => handleContentChange('reference', e.target.value)} className="text-xs md:text-sm opacity-70 bg-transparent border-none outline-none text-right w-full focus:ring-2 focus:ring-white/30 rounded-lg px-2 py-1" style={{
                  color: currentSlide.textColor
                }} placeholder="Reference" />
                  </>}
                {currentSlide.type === "blank" && <p className="text-muted-foreground text-sm">Blank Slide</p>}
              </div>
            </motion.div>
          </div>

          {/* Toolbar - Fixed at bottom, always visible */}
          <div className="h-16 border-t border-border bg-card flex-shrink-0 flex items-center justify-center px-4">
            <div className="flex items-center justify-center gap-4 flex-wrap">
              {/* Font */}
              <div className="flex items-center gap-1.5">
                <Type className="w-3.5 h-3.5 text-muted-foreground" />
                <Select value={currentSlide.fontFamily} onValueChange={handleFontChange}>
                  <SelectTrigger className="w-32 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {fonts.map(font => <SelectItem key={font} value={font} className="text-xs">
                        {font}
                      </SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Text Color */}
              <div className="flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-muted-foreground" />
                <Select value={currentSlide.textColor} onValueChange={handleColorChange}>
                  <SelectTrigger className="w-24 h-8">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3.5 h-3.5 rounded-full border border-border" style={{
                      background: currentSlide.textColor
                    }} />
                      <span className="text-[10px] truncate">
                        {currentSlide.textColor}
                      </span>
                    </div>
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    <div className="grid grid-cols-4 gap-1 p-2">
                      {colors.map(color => <button key={color} onClick={() => handleColorChange(color)} className={`w-7 h-7 rounded-md border-2 transition-all ${currentSlide.textColor === color ? 'border-primary ring-2 ring-primary/30 scale-110' : 'border-border hover:border-primary hover:scale-105'}`} style={{
                      background: color
                    }} title={color} />)}
                    </div>
                  </SelectContent>
                </Select>
              </div>

              {/* Line Spacing */}
              <div className="flex items-center gap-1.5">
                <AlignVerticalSpaceAround className="w-3.5 h-3.5 text-muted-foreground" />
                <Select value={String(currentSlide.lineSpacing || 1.5)} onValueChange={handleLineSpacingChange}>
                  <SelectTrigger className="w-24 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {lineSpacingOptions.map(option => <SelectItem key={option.value} value={option.value} className="text-xs">
                        {option.label}
                      </SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Background */}
              <BackgroundPicker currentBackground={currentSlide.background} currentBackgroundImage={currentSlide.backgroundImage} onBackgroundChange={handleBackgroundChange} />

              {/* Navigation */}
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigateSlide("prev")} disabled={selectedSlide === 0}>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <span className="text-xs text-muted-foreground min-w-[50px] text-center">
                  {selectedSlide + 1} / {slides.length}
                </span>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigateSlide("next")} disabled={selectedSlide === slides.length - 1}>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* Duplicate Slide */}
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleDuplicateSlide}>
                <Copy className="w-3.5 h-3.5 mr-1" />
                Duplicate
              </Button>
              
              {/* Delete Slide */}
              <Button variant="outline" size="sm" className="h-8 text-xs text-destructive hover:bg-destructive/10" onClick={handleDeleteSlide} disabled={slides.length <= 1}>
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Delete
              </Button>
            </div>
          </div>
        </main>
      </div>
      
      {/* Payment Prompt Modal */}
      <PaymentPromptModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        sermonId={id || ""}
        onPaymentComplete={handlePaymentComplete}
      />
      
      {/* Export Options Modal */}
      <ExportOptionsModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={handleExport}
        isExporting={isExporting}
      />
    </div>;
};
export default SlideEditor;