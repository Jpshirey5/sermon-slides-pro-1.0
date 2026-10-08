// deno test -A supabase/functions/_shared/scripture/tests/apiBible_test.ts

import { assert, assertEquals } from "./assert.ts";
import { ApiBibleError, cleanText, createApiBibleClient, splitVerses } from "../apiBible.ts";

const KEY = "secret-api-bible-key";

const fakeFetch = (status: number, body: unknown, seen: { url?: string; headers?: Headers } = {}) =>
  (async (input: string | URL | Request, init?: RequestInit) => {
    seen.url = String(input);
    seen.headers = new Headers(init?.headers);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as typeof fetch;

Deno.test("splitVerses reads verse markers", () => {
  assertEquals(splitVerses("  [16] For God so loved. [17] For God sent. ", 16), [
    { verse: 16, text: "For God so loved." },
    { verse: 17, text: "For God sent." },
  ]);
});

Deno.test("splitVerses without markers is one verse; empty is none", () => {
  assertEquals(splitVerses("Jesus wept.", 35), [{ verse: 35, text: "Jesus wept." }]);
  assertEquals(splitVerses("   ", 1), []);
});

Deno.test("splitVerses keeps text that comes before the first marker", () => {
  assertEquals(splitVerses("Then he said, [2] Go.", 1), [{ verse: 2, text: "Then he said, Go." }]);
});

Deno.test("cleanText strips tags, entities, and pilcrows", () => {
  assertEquals(cleanText("<p>A&nbsp;&amp; B ¶ <b>C</b></p>"), "A & B C");
});

Deno.test("fetchPassage sends the key only as a header and asks for FUMS v3", async () => {
  const seen: { url?: string; headers?: Headers } = {};
  const client = createApiBibleClient({
    apiKey: KEY,
    fetch: fakeFetch(200, {
      data: { content: "[16] For God so loved.", copyright: "<p>Copyright line</p>" },
      meta: { fumsToken: "tok-123" },
    }, seen),
  });
  const result = await client.fetchPassage("bible-1", "JHN.3.16", 16);
  assertEquals(result, { verses: [{ verse: 16, text: "For God so loved." }], fumsToken: "tok-123", copyright: "Copyright line" });
  assertEquals(seen.headers?.get("api-key"), KEY);
  assert(!seen.url?.includes(KEY), "key must not be in the URL");
  assert(seen.url?.startsWith("https://rest.api.bible/v1/bibles/bible-1/passages/JHN.3.16?"), seen.url ?? "");
  assert(seen.url?.includes("fums-version=3"), "asks for FUMS v3");
});

Deno.test("fetchPassage falls back to meta.fumsId and tolerates no token", async () => {
  const withId = createApiBibleClient({ apiKey: KEY, fetch: fakeFetch(200, { data: { content: "[1] x" }, meta: { fumsId: "id-9" } }) });
  assertEquals((await withId.fetchPassage("b", "GEN.1.1", 1)).fumsToken, "id-9");
  const none = createApiBibleClient({ apiKey: KEY, fetch: fakeFetch(200, { data: { content: "[1] x" } }) });
  assertEquals((await none.fetchPassage("b", "GEN.1.1", 1)).fumsToken, null);
});

Deno.test("errors are classified and never contain the key", async () => {
  const cases: [number, string][] = [[404, "not_found"], [401, "unauthorized"], [429, "rate_limited"], [500, "upstream"]];
  for (const [status, kind] of cases) {
    const client = createApiBibleClient({ apiKey: KEY, fetch: fakeFetch(status, `bad key ${KEY}`) });
    try {
      await client.fetchPassage("b", "GEN.1.1", 1);
      throw new Error("should have thrown");
    } catch (error) {
      assert(error instanceof ApiBibleError, "ApiBibleError");
      assertEquals((error as ApiBibleError).kind, kind);
      assert(!(error as Error).message.includes(KEY), "message must not leak the key");
    }
  }
});

Deno.test("an empty passage is an error, not an empty slide", async () => {
  const client = createApiBibleClient({ apiKey: KEY, fetch: fakeFetch(200, { data: { content: "" } }) });
  try {
    await client.fetchPassage("b", "GEN.1.1", 1);
    throw new Error("should have thrown");
  } catch (error) {
    assertEquals((error as ApiBibleError).kind, "empty");
  }
});

Deno.test("network failure is classified", async () => {
  const client = createApiBibleClient({
    apiKey: KEY,
    fetch: (async () => {
      throw new TypeError("offline");
    }) as typeof fetch,
  });
  try {
    await client.fetchCopyright("b");
    throw new Error("should have thrown");
  } catch (error) {
    assertEquals((error as ApiBibleError).kind, "network");
  }
});

Deno.test("fetchCopyright returns cleaned text or null", async () => {
  const yes = createApiBibleClient({ apiKey: KEY, fetch: fakeFetch(200, { data: { copyright: " <b>Notice</b> " } }) });
  assertEquals(await yes.fetchCopyright("b"), "Notice");
  const no = createApiBibleClient({ apiKey: KEY, fetch: fakeFetch(200, { data: {} }) });
  assertEquals(await no.fetchCopyright("b"), null);
});
