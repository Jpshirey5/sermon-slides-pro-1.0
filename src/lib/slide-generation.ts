import type { SermonPresentation } from "@/lib/presentations";
import type { SlideData } from "@/lib/export-pptx";
import { splitVerseText } from "@/lib/scripture-api";
import { formatDateOnlyForDisplay } from "@/lib/date-format";

const titleSlideDateOptions: Intl.DateTimeFormatOptions = {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
};

export function generateSlidesFromPresentation(presentation: SermonPresentation): SlideData[] {
  const slides: SlideData[] = [];
  const defaultBackground = "transparent";
  const defaultFont = "Georgia";
  const defaultColor = "#FFFFFF";
  const defaultLineSpacing = 1.5;

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

          const isVerseByVerse = presentation.data?.verseBreakdown === "verse-by-verse";

          if (isVerseByVerse) {
            const verseList =
              scripture.verses && scripture.verses.length > 0
                ? scripture.verses.map((verse) => {
                    const parsed = scripture.reference.match(/^(.+?\s+\d+):/);
                    const bookChapter = parsed ? parsed[1] : scripture.reference;
                    return { text: verse.text, reference: `${bookChapter}:${verse.verse}` };
                  })
                : splitVerseText(scripture.text, scripture.reference);

            verseList.forEach((verse, verseIndex) => {
              slides.push({
                id: `scripture-${point.id}-${scriptureIndex}-${verseIndex}`,
                type: "scripture",
                content: {
                  scripture: `"${verse.text}"`,
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

          slides.push({
            id: `scripture-${point.id}-${scriptureIndex}`,
            type: "scripture",
            content: {
              scripture: `"${scripture.text}"`,
              reference: `${scripture.reference} (${presentation.data?.translation || "KJV"})`,
            },
            background: defaultBackground,
            fontFamily: defaultFont,
            textColor: defaultColor,
            lineSpacing: defaultLineSpacing,
          });
        });
      }
    });
  }

  return slides;
}
