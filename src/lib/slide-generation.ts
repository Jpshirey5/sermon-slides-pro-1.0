import type { SermonPresentation } from "@/lib/presentations";
import type { SlideData } from "@/lib/export-pptx";
import { formatScriptureReferenceForDisplay, splitVerseText } from "@/lib/scripture-api";
import { formatDateOnlyForDisplay } from "@/lib/date-format";

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

export function generateSlidesFromPresentation(presentation: SermonPresentation): SlideData[] {
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
