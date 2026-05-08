import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";


serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const corsHeaders = {
    "Access-Control-Allow-Origin": ["https://sermonslidepro.com", "http://localhost:8080", "http://localhost:5173"].includes(origin) ? origin : "https://sermonslidepro.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ESV_API_KEY = Deno.env.get("ESV_API_KEY");
    if (!ESV_API_KEY) {
      throw new Error("ESV_API_KEY not configured");
    }

    const { q } = await req.json();
    if (!q) {
      return new Response(
        JSON.stringify({ error: "Missing query parameter 'q'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const params = new URLSearchParams({
      q,
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

    const response = await fetch(
      `https://api.esv.org/v3/passage/text/?${params.toString()}`,
      {
        headers: {
          Authorization: `Token ${ESV_API_KEY}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ESV API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: `ESV API returned ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();

    // Extract passages and parsed verses from the response
    const passages = data.passages || [];
    const text = passages.join("\n\n").trim();

    // Parse verse numbers from the text: [1] text [2] text ...
    const verses: { text: string; verse: number }[] = [];
    const versePattern = /\[(\d+)\]\s*/g;
    const parts = text.split(versePattern);

    // parts alternates: [before_first_marker, verse_num, verse_text, verse_num, verse_text, ...]
    for (let i = 1; i < parts.length; i += 2) {
      const verseNum = parseInt(parts[i]);
      const verseText = (parts[i + 1] || "").trim();
      if (verseText) {
        verses.push({ text: verseText, verse: verseNum });
      }
    }

    // Clean text without verse markers
    const cleanText = text.replace(/\[(\d+)\]\s*/g, "").replace(/\s+/g, " ").trim();

    return new Response(
      JSON.stringify({
        text: cleanText,
        verses,
        canonical: data.canonical || q,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("ESV lookup error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
