// PARTNER API — server-side port of src/lib/slide-generation.ts
// (generateSlidesFromPresentation) plus the scripture display helpers it uses
// from src/lib/scripture-api.ts and src/lib/date-format.ts. Keep in sync: the
// editor regenerates slides with the browser copy, and a partner deck must look
// the same as one the pastor built by hand.

export interface SlideData {
  id: string;
  type: "title" | "point" | "scripture" | "blank";
  content: {
    title?: string;
    subtitle?: string;
    scripture?: string;
    reference?: string;
  };
  background: string;
  backgroundImage?: string;
  fontFamily: string;
  textColor: string;
  lineSpacing?: number;
  fontSize?: number;
}

export interface FormData {
  title: string;
  series?: string | null;
  date: string;
  translation: string;
  verseBreakdown?: string;
  proPresenterMode?: boolean;
  slideStyle?: "minimal" | "balanced" | "speaker-friendly";
  themeStyle?: "clean" | "bold" | "scripture-focused";
  points: Array<{
    id: string;
    type?: "point" | "verse";
    title: string;
    scriptures: Array<{
      reference: string;
      text?: string;
      verses?: { text: string; verse: number }[];
    }>;
  }>;
}

// ── src/lib/scripture-api.ts ────────────────────────────────────────────────

export function normalizeScriptureReference(reference: string): string {
  return reference.trim().replace(/\s+/g, " ");
}

export function formatScriptureReferenceForDisplay(reference: string): string {
  const normalizedReference = normalizeScriptureReference(reference);
  return normalizedReference.replace(/^(\d?\s*)([a-z])/, (_, prefix: string, firstLetter: string) => (
    `${prefix}${firstLetter.toUpperCase()}`
  ));
}

function parseScriptureReference(reference: string): {
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd?: number;
} | null {
  const normalizedReference = normalizeScriptureReference(reference);
  const match = normalizedReference.match(
    /^((?:\d\s*)?[A-Za-z]+(?:\s+[A-Za-z]+)*)\s+(\d+):(\d+)(?:-(\d+))?$/i
  );
  if (!match) return null;

  return {
    book: match[1].trim(),
    chapter: parseInt(match[2], 10),
    verseStart: parseInt(match[3], 10),
    verseEnd: match[4] ? parseInt(match[4], 10) : undefined,
  };
}

function splitVerseText(
  text: string,
  reference: string
): { text: string; reference: string }[] {
  const parsed = parseScriptureReference(reference);
  if (!parsed || !parsed.verseEnd) {
    return [{ text, reference }];
  }

  const { book, chapter, verseStart, verseEnd } = parsed;
  const totalVerses = verseEnd - verseStart + 1;

  const numberPattern = new RegExp(
    `(?:^|\\s)(${Array.from({ length: totalVerses }, (_, i) => verseStart + i).join("|")})\\s`,
    "g"
  );
  const markers: { verse: number; pos: number }[] = [];
  let match: RegExpExecArray | null;
  const searchText = ` ${text}`;

  while ((match = numberPattern.exec(searchText)) !== null) {
    const verseNum = parseInt(match[1], 10);
    if (verseNum >= verseStart && verseNum <= verseEnd) {
      markers.push({ verse: verseNum, pos: match.index + match[0].indexOf(match[1]) - 1 });
    }
  }

  if (markers.length >= totalVerses * 0.6) {
    const uniqueMarkers = markers
      .filter((marker, index, array) => index === 0 || marker.verse !== array[index - 1].verse)
      .sort((a, b) => a.pos - b.pos);

    const results: { text: string; reference: string }[] = [];
    for (let i = 0; i < uniqueMarkers.length; i++) {
      const start = uniqueMarkers[i].pos;
      const end = i + 1 < uniqueMarkers.length ? uniqueMarkers[i + 1].pos : text.length;
      const verseText = text.slice(start, end).replace(/^\d+\s*/, "").trim();
      if (verseText) {
        results.push({
          text: verseText,
          reference: `${book} ${chapter}:${uniqueMarkers[i].verse}`,
        });
      }
    }
    if (results.length > 0) return results;
  }

  const sentences = text.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.trim());
  if (sentences.length >= totalVerses) {
    const results: { text: string; reference: string }[] = [];
    const perVerse = Math.ceil(sentences.length / totalVerses);
    for (let i = 0; i < totalVerses; i++) {
      const chunk = sentences.slice(i * perVerse, (i + 1) * perVerse).join(" ").trim();
      if (chunk) {
        results.push({
          text: chunk,
          reference: `${book} ${chapter}:${verseStart + i}`,
        });
      }
    }
    if (results.length > 0) return results;
  }

  return [{ text, reference }];
}

// ── src/lib/date-format.ts ──────────────────────────────────────────────────

function formatDateOnlyForDisplay(
  dateString: string,
  options?: Intl.DateTimeFormatOptions,
  locale = "en-US"
): string {
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return new Date(dateString).toLocaleDateString(locale, options);
  }

  const [, year, month, day] = match;
  const localDate = new Date(Number(year), Number(month) - 1, Number(day));
  return localDate.toLocaleDateString(locale, options);
}

// ── src/lib/slide-generation.ts ─────────────────────────────────────────────

const titleSlideDateOptions: Intl.DateTimeFormatOptions = {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
};

function splitTextForSlides(text: string, maxLength: number): string[] {
  const normalizedText = text.replace(/\s+/g, " ").trim();
  if (normalizedText.length <= maxLength) return [normalizedText];

  const words = normalizedText.split(" ");
  const chunks: string[] = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength && current) {
      chunks.push(current);
      current = word;
      return;
    }

    current = next;
  });

  if (current) chunks.push(current);
  return chunks;
}

function wrapScriptureText(text: string, proPresenterMode: boolean) {
  return proPresenterMode ? text : `"${text}"`;
}

export function generateSlidesFromPresentation(presentation: { title: string; date: string; data: FormData }): SlideData[] {
  const slides: SlideData[] = [];
  const proPresenterMode = Boolean(presentation.data?.proPresenterMode);
  const slideStyle = presentation.data?.slideStyle || "balanced";
  const themeStyle = presentation.data?.themeStyle || "clean";
  const defaultBackground = "transparent";
  const defaultFont = themeStyle === "bold" ? "Arial Black" : "Georgia";
  const defaultColor = themeStyle === "scripture-focused" ? "#F8FAFC" : "#FFFFFF";
  const defaultLineSpacing = slideStyle === "minimal" || proPresenterMode ? 1.3 : slideStyle === "speaker-friendly" ? 1.65 : 1.5;
  const fullPassageMaxLength = proPresenterMode ? 280 : slideStyle === "minimal" ? 340 : slideStyle === "speaker-friendly" ? 430 : 700;

  slides.push({
    id: `title-${Date.now()}`,
    type: "title",
    content: {
      title: presentation.data?.title || presentation.title,
      subtitle: formatDateOnlyForDisplay(
        presentation.data?.date || presentation.date,
        titleSlideDateOptions
      ),
    },
    background: defaultBackground,
    fontFamily: defaultFont,
    textColor: defaultColor,
    lineSpacing: defaultLineSpacing,
  });

  if (presentation.data?.points) {
    presentation.data.points.forEach((point) => {
      const isVerseType = point.type === "verse";

      if (!isVerseType && point.title) {
        slides.push({
          id: `point-${point.id}`,
          type: "point",
          content: {
            title: point.title,
            subtitle: "",
          },
          background: defaultBackground,
          fontFamily: defaultFont,
          textColor: defaultColor,
          lineSpacing: defaultLineSpacing,
        });
      }

      if (isVerseType || point.title) {
        point.scriptures.forEach((scripture, scriptureIndex) => {
          if (!scripture.reference || !scripture.text) return;
          const displayReference = formatScriptureReferenceForDisplay(scripture.reference);

          const isVerseByVerse = presentation.data?.verseBreakdown === "verse-by-verse";

          if (isVerseByVerse) {
            const verseList =
              scripture.verses && scripture.verses.length > 0
                ? scripture.verses.map((verse) => {
                    const parsed = displayReference.match(/^(.+?\s+\d+):/);
                    const bookChapter = parsed ? parsed[1] : displayReference;
                    return { text: verse.text, reference: `${bookChapter}:${verse.verse}` };
                  })
                : splitVerseText(scripture.text, displayReference);

            verseList.forEach((verse, verseIndex) => {
              slides.push({
                id: `scripture-${point.id}-${scriptureIndex}-${verseIndex}`,
                type: "scripture",
                content: {
                  scripture: wrapScriptureText(verse.text, proPresenterMode),
                  reference: `${verse.reference} (${presentation.data?.translation || "KJV"})`,
                },
                background: defaultBackground,
                fontFamily: defaultFont,
                textColor: defaultColor,
                lineSpacing: defaultLineSpacing,
              });
            });
            return;
          }

          const passageChunks = splitTextForSlides(scripture.text, fullPassageMaxLength);
          passageChunks.forEach((chunk, chunkIndex) => {
            const hasMultipleChunks = passageChunks.length > 1;
            slides.push({
              id: hasMultipleChunks
                ? `scripture-${point.id}-${scriptureIndex}-${chunkIndex}`
                : `scripture-${point.id}-${scriptureIndex}`,
              type: "scripture",
              content: {
                scripture: wrapScriptureText(chunk, proPresenterMode),
                reference: `${displayReference} (${presentation.data?.translation || "KJV"})`,
              },
              background: defaultBackground,
              fontFamily: defaultFont,
              textColor: defaultColor,
              lineSpacing: defaultLineSpacing,
            });
          });
        });
      }
    });
  }

  return slides;
}
