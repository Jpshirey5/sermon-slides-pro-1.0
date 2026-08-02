import { describe, it, expect } from "vitest";
import {
  BIBLE_BOOKS,
  buildReference,
  findBookByName,
  getChapterCount,
  getVerseCount,
} from "./bible-books";
import { parseScriptureReference } from "./scripture-api";

const bookNamed = (name: string) => {
  const book = BIBLE_BOOKS.find((candidate) => candidate.name === name);
  if (!book) throw new Error(`Missing book: ${name}`);
  return book;
};

describe("BIBLE_BOOKS canon", () => {
  it("has 66 books, 39 OT then 27 NT", () => {
    expect(BIBLE_BOOKS).toHaveLength(66);
    expect(BIBLE_BOOKS.filter((b) => b.testament === "OT")).toHaveLength(39);
    expect(BIBLE_BOOKS.filter((b) => b.testament === "NT")).toHaveLength(27);
    // Canonical order: no NT book may precede an OT book.
    expect(BIBLE_BOOKS.findIndex((b) => b.testament === "NT")).toBe(39);
  });

  it("starts at Genesis and ends at Revelation", () => {
    expect(BIBLE_BOOKS[0].name).toBe("Genesis");
    expect(BIBLE_BOOKS[65].name).toBe("Revelation");
    expect(BIBLE_BOOKS[39].name).toBe("Matthew");
  });

  it("has no duplicate book names", () => {
    expect(new Set(BIBLE_BOOKS.map((b) => b.name)).size).toBe(66);
  });

  it("has only positive verse counts in every chapter", () => {
    for (const book of BIBLE_BOOKS) {
      expect(book.chapterVerseCounts.length).toBeGreaterThan(0);
      for (const [index, count] of book.chapterVerseCounts.entries()) {
        expect(
          count,
          `${book.name} chapter ${index + 1} has a non-positive verse count`,
        ).toBeGreaterThan(0);
      }
    }
  });
});

describe("versification spot checks", () => {
  it("matches known chapter counts", () => {
    expect(getChapterCount(bookNamed("Genesis"))).toBe(50);
    expect(getChapterCount(bookNamed("Psalms"))).toBe(150);
    expect(getChapterCount(bookNamed("Isaiah"))).toBe(66);
    expect(getChapterCount(bookNamed("John"))).toBe(21);
    expect(getChapterCount(bookNamed("Revelation"))).toBe(22);
  });

  it("gives single-chapter books exactly one chapter", () => {
    for (const name of ["Obadiah", "Philemon", "2 John", "3 John", "Jude"]) {
      expect(getChapterCount(bookNamed(name)), name).toBe(1);
    }
  });

  it("matches known verse counts", () => {
    expect(getVerseCount(bookNamed("Genesis"), 1)).toBe(31);
    expect(getVerseCount(bookNamed("John"), 3)).toBe(36);
    expect(getVerseCount(bookNamed("Psalms"), 23)).toBe(6);
    expect(getVerseCount(bookNamed("Psalms"), 119)).toBe(176); // longest chapter
    expect(getVerseCount(bookNamed("Psalms"), 117)).toBe(2); // shortest chapter
    expect(getVerseCount(bookNamed("Obadiah"), 1)).toBe(21);
    expect(getVerseCount(bookNamed("Revelation"), 22)).toBe(21);
  });

  it("returns 0 for chapters outside a book", () => {
    expect(getVerseCount(bookNamed("Obadiah"), 2)).toBe(0);
    expect(getVerseCount(bookNamed("Genesis"), 51)).toBe(0);
  });
});

describe("parseScriptureReference round-trip", () => {
  // The picker emits `${book.name} ${chapter}:${verse}`. If the parser cannot read a name
  // back out, the lookup fails for that book — this is what caught "Song of Solomon".
  it("parses a reference built from every book name", () => {
    for (const book of BIBLE_BOOKS) {
      const reference = buildReference(book.name, 1, 1);
      const parsed = parseScriptureReference(reference);
      expect(parsed, `${book.name} failed to parse from "${reference}"`).not.toBeNull();
      expect(parsed?.book).toBe(book.name);
      expect(parsed?.chapter).toBe(1);
      expect(parsed?.verseStart).toBe(1);
    }
  });

  it("still parses the previously working single-word and numbered forms", () => {
    expect(parseScriptureReference("John 3:16")).toEqual({
      book: "John",
      chapter: 3,
      verseStart: 16,
      verseEnd: undefined,
    });
    expect(parseScriptureReference("1 John 1:5")).toEqual({
      book: "1 John",
      chapter: 1,
      verseStart: 5,
      verseEnd: undefined,
    });
    expect(parseScriptureReference("Genesis 1:1-5")).toEqual({
      book: "Genesis",
      chapter: 1,
      verseStart: 1,
      verseEnd: 5,
    });
  });

  it("parses multi-word book names", () => {
    expect(parseScriptureReference("Song of Solomon 2:1")).toEqual({
      book: "Song of Solomon",
      chapter: 2,
      verseStart: 1,
      verseEnd: undefined,
    });
  });

  it("still rejects malformed references", () => {
    expect(parseScriptureReference("John")).toBeNull();
    expect(parseScriptureReference("John 3")).toBeNull();
    expect(parseScriptureReference("")).toBeNull();
  });
});

describe("findBookByName", () => {
  it("is case- and whitespace-insensitive", () => {
    expect(findBookByName("john")?.name).toBe("John");
    expect(findBookByName("  1   Corinthians ")?.name).toBe("1 Corinthians");
  });

  it("resolves common alternate spellings", () => {
    expect(findBookByName("Psalm")?.name).toBe("Psalms");
    expect(findBookByName("psalms")?.name).toBe("Psalms");
    expect(findBookByName("Song of Songs")?.name).toBe("Song of Solomon");
    expect(findBookByName("Revelations")?.name).toBe("Revelation");
  });

  it("returns undefined for unknown books", () => {
    expect(findBookByName("Hezekiah")).toBeUndefined();
    expect(findBookByName("")).toBeUndefined();
  });
});

describe("buildReference", () => {
  it("formats single verses and ranges", () => {
    expect(buildReference("John", 3, 16)).toBe("John 3:16");
    expect(buildReference("John", 3, 16, 17)).toBe("John 3:16-17");
  });

  it("omits an end verse that is not after the start", () => {
    expect(buildReference("John", 3, 16, 16)).toBe("John 3:16");
    expect(buildReference("John", 3, 16, null)).toBe("John 3:16");
  });
});
