import { useEffect, useMemo, useRef, useState } from "react";
import { Book, Check, X } from "lucide-react";
import {
  BIBLE_BOOKS,
  buildReference,
  findBookByName,
  getChapterCount,
  getVerseCount,
  type BibleBook,
} from "@/lib/bible-books";
import { blockDragFromNode } from "@/lib/block-drag";
import { parseScriptureReference } from "@/lib/scripture-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface ScripturePickerProps {
  /** Current reference text; used to hydrate the picker when it opens. */
  value: string;
  /** Fires with the assembled reference, e.g. "John 3:16-17". */
  onSelect: (reference: string) => void;
}

const COLUMN_CLASS = "max-h-[320px] overflow-y-auto overscroll-contain py-1";

const rowClass = (isSelected: boolean, isInRange = false) =>
  cn(
    "w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors",
    "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    isSelected && "bg-primary text-primary-foreground hover:bg-primary",
    !isSelected && isInRange && "bg-primary/20",
  );

const ScripturePicker = ({ value, onSelect }: ScripturePickerProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [book, setBook] = useState<BibleBook | null>(null);
  const [chapter, setChapter] = useState<number | null>(null);
  const [verseStart, setVerseStart] = useState<number | null>(null);
  const [verseEnd, setVerseEnd] = useState<number | null>(null);
  const [rangeArmed, setRangeArmed] = useState(false);

  const selectedBookRef = useRef<HTMLButtonElement | null>(null);
  const selectedChapterRef = useRef<HTMLButtonElement | null>(null);
  const selectedVerseRef = useRef<HTMLButtonElement | null>(null);

  // Hydrate from the existing reference each time the picker opens.
  useEffect(() => {
    if (!open) return;

    setSearch("");
    setRangeArmed(false);

    const parsed = parseScriptureReference(value);
    const matchedBook = parsed ? findBookByName(parsed.book) : undefined;

    if (!parsed || !matchedBook) {
      setBook(null);
      setChapter(null);
      setVerseStart(null);
      setVerseEnd(null);
      return;
    }

    const validChapter = parsed.chapter <= getChapterCount(matchedBook) ? parsed.chapter : null;
    const verseCount = validChapter ? getVerseCount(matchedBook, validChapter) : 0;

    setBook(matchedBook);
    setChapter(validChapter);
    setVerseStart(parsed.verseStart <= verseCount ? parsed.verseStart : null);
    setVerseEnd(parsed.verseEnd && parsed.verseEnd <= verseCount ? parsed.verseEnd : null);
  }, [open, value]);

  // Scroll each column to its selection once the popover has painted.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      selectedBookRef.current?.scrollIntoView({ block: "nearest" });
      selectedChapterRef.current?.scrollIntoView({ block: "nearest" });
      selectedVerseRef.current?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const filteredBooks = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return BIBLE_BOOKS;
    return BIBLE_BOOKS.filter((candidate) => candidate.name.toLowerCase().includes(query));
  }, [search]);

  const chapters = useMemo(
    () => (book ? Array.from({ length: getChapterCount(book) }, (_, i) => i + 1) : []),
    [book],
  );

  const verses = useMemo(
    () => (book && chapter ? Array.from({ length: getVerseCount(book, chapter) }, (_, i) => i + 1) : []),
    [book, chapter],
  );

  const handleBookClick = (nextBook: BibleBook) => {
    setBook(nextBook);
    setChapter(null);
    setVerseStart(null);
    setVerseEnd(null);
    setRangeArmed(false);
  };

  const handleChapterClick = (nextChapter: number) => {
    setChapter(nextChapter);
    setVerseStart(null);
    setVerseEnd(null);
    setRangeArmed(false);
  };

  const handleVerseClick = (verse: number, shiftKey: boolean) => {
    // Shift-click (desktop) or the armed "end verse" button (touch) completes a range.
    if ((shiftKey || rangeArmed) && verseStart !== null && verse > verseStart) {
      setVerseEnd(verse);
      setRangeArmed(false);
      return;
    }
    setVerseStart(verse);
    setVerseEnd(null);
    setRangeArmed(false);
  };

  const preview =
    book && chapter && verseStart ? buildReference(book.name, chapter, verseStart, verseEnd) : null;

  const handleInsert = () => {
    if (!preview) return;
    onSelect(preview);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={blockDragFromNode}
          type="button"
          aria-label="Browse books, chapters, and verses"
          onClick={() => setOpen((current) => !current)}
          className="shrink-0 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-all hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=open]:bg-secondary data-[state=open]:text-foreground"
        >
          <Book className="w-4 h-4" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-auto p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="p-2 border-b border-border">
          <Input
            type="text"
            placeholder="Search books…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9"
          />
        </div>

        <div className="flex divide-x divide-border">
          {/* Books */}
          <div className={cn(COLUMN_CLASS, "w-40 px-1")}>
            {filteredBooks.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">No books found</p>
            ) : (
              filteredBooks.map((candidate) => {
                const isSelected = book?.name === candidate.name;
                return (
                  <button
                    key={candidate.name}
                    ref={isSelected ? selectedBookRef : undefined}
                    type="button"
                    onClick={() => handleBookClick(candidate)}
                    className={rowClass(isSelected)}
                  >
                    {candidate.name}
                  </button>
                );
              })
            )}
          </div>

          {/* Chapters */}
          <div className={cn(COLUMN_CLASS, "w-[4.5rem] px-1")}>
            {chapters.length === 0 ? (
              <p className="px-2 py-2 text-xs text-muted-foreground">Book</p>
            ) : (
              chapters.map((candidate) => {
                const isSelected = chapter === candidate;
                return (
                  <button
                    key={candidate}
                    ref={isSelected ? selectedChapterRef : undefined}
                    type="button"
                    onClick={() => handleChapterClick(candidate)}
                    className={rowClass(isSelected)}
                  >
                    {candidate}
                  </button>
                );
              })
            )}
          </div>

          {/* Verses */}
          <div className={cn(COLUMN_CLASS, "w-[4.5rem] px-1")}>
            {verses.length === 0 ? (
              <p className="px-2 py-2 text-xs text-muted-foreground">Chapter</p>
            ) : (
              verses.map((candidate) => {
                const isEndpoint = verseStart === candidate || verseEnd === candidate;
                const isInRange =
                  verseStart !== null &&
                  verseEnd !== null &&
                  candidate > verseStart &&
                  candidate < verseEnd;
                return (
                  <button
                    key={candidate}
                    ref={verseStart === candidate ? selectedVerseRef : undefined}
                    type="button"
                    onClick={(e) => handleVerseClick(candidate, e.shiftKey)}
                    className={rowClass(isEndpoint, isInRange)}
                  >
                    {candidate}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 p-2 border-t border-border">
          <span className={cn("text-sm font-medium", !preview && "text-muted-foreground font-normal")}>
            {preview ?? "Pick a book, chapter, and verse"}
          </span>

          <div className="flex items-center gap-1">
            {verseStart !== null && verseEnd === null && (
              <Button
                type="button"
                variant={rangeArmed ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setRangeArmed((current) => !current)}
              >
                {rangeArmed ? "Tap last verse" : "Add end verse"}
              </Button>
            )}
            {verseEnd !== null && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Clear verse range"
                onClick={() => setVerseEnd(null)}
              >
                <X className="w-4 h-4" />
              </Button>
            )}
            <Button type="button" size="sm" disabled={!preview} onClick={handleInsert}>
              <Check className="w-4 h-4" />
              Insert
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ScripturePicker;
