// ESV comes from Crossway's API (api.esv.org), under Crossway's own license,
// not API.Bible's. It is only served to churches with an ESV grant, and the
// text is never cached or stored. Crossway's terms still need their own
// review before ESV is used in the presenter (flagged in the plan).

export interface EsvPassage {
  text: string;
  reference: string;
  verses: { text: string; verse: number }[];
}

export type EsvFetcher = (reference: string) => Promise<EsvPassage | null>;

export function createEsvFetcher(apiKey: string, doFetch: typeof fetch = fetch): EsvFetcher {
  return async (reference) => {
    const params = new URLSearchParams({
      q: reference,
      "include-passage-references": "false",
      "include-verse-numbers": "true",
      "include-footnotes": "false",
      "include-headings": "false",
      "include-short-copyright": "false",
      "indent-paragraphs": "0",
      "indent-poetry": "false",
      "indent-declares": "0",
      "indent-psalm-doxology": "0",
    });
    let response: Response;
    try {
      response = await doFetch(`https://api.esv.org/v3/passage/text/?${params}`, {
        headers: { Authorization: `Token ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      return null;
    }
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    const data = await response.json();
    const raw = ((data.passages || []) as string[]).join("\n\n").trim();
    const verses: { text: string; verse: number }[] = [];
    const parts = raw.split(/\[(\d+)\]\s*/);
    for (let i = 1; i < parts.length; i += 2) {
      const text = (parts[i + 1] || "").trim();
      if (text) verses.push({ text, verse: parseInt(parts[i], 10) });
    }
    const text = raw.replace(/\[(\d+)\]\s*/g, "").replace(/\s+/g, " ").trim();
    return text ? { text, verses, reference: data.canonical || reference } : null;
  };
}

export function esvFromEnv(): EsvFetcher | null {
  const key = Deno.env.get("ESV_API_KEY");
  return key ? createEsvFetcher(key) : null;
}
