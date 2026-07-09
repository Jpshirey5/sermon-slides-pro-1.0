// Quick Build parser eval harness. Calls the real parser (Bedrock) against the
// fixture suite and scores extraction accuracy, writing a scorecard tagged with
// the prompt version so prompt iterations are comparable.
//
// Usage (needs AWS creds with Bedrock access — same ones the edge function uses):
//   AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=us-east-1 \
//     deno run --allow-net --allow-env --allow-read --allow-write scripts/quick-build-eval/run.ts
//
// Options:
//   --only <fixture-name>       run a single fixture
//   QUICK_BUILD_MODEL_ID=...    A/B a different Bedrock model
//   PARSER_MODULE=<path/url>    score an alternate claudeParser.ts (e.g. from a
//                               git worktree of an older commit, for baselines)

import { FIXTURES, type Fixture } from "./fixtures.ts";
import { titleSimilarity } from "../../supabase/functions/finalize-quick-build-parse/diff.ts";

const MATCH_THRESHOLD = 0.6;

const parserModule =
  Deno.env.get("PARSER_MODULE") ??
  new URL("../../supabase/functions/parse-sermon-manuscript/claudeParser.ts", import.meta.url)
    .href;
const parser = await import(parserModule);

interface FixtureScore {
  name: string;
  titleOk: boolean;
  seriesOk: boolean;
  pointRecall: number;
  pointPrecision: number;
  falsePoints: string[];
  missedPoints: string[];
  refRecall: number;
  refPlacementAccuracy: number;
  missedRefs: string[];
  /** Refs the parser produced that the fixture does not expect — hallucinations. */
  falseRefs: string[];
  analysis: unknown;
  error?: string;
}

const norm = (v: string) => v.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

function scoreFixture(fixture: Fixture, data: {
  title: string;
  series: string | null;
  points: { title: string; subpoints: { title: string }[] }[];
  scripture_references: {
    book: string;
    chapter: number;
    start_verse: number;
    point_index: number | null;
  }[];
}, analysis: unknown): FixtureScore {
  const expected = fixture.expected;

  // Flatten model output the way the review screen renders it: points + subpoints.
  const gotPoints: string[] = [];
  for (const point of data.points) {
    gotPoints.push(point.title);
    for (const sub of point.subpoints || []) gotPoints.push(sub.title);
  }

  const expectedMatched = new Array<boolean>(expected.points.length).fill(false);
  const gotMatched = new Array<boolean>(gotPoints.length).fill(false);
  expected.points.forEach((expTitle, expIndex) => {
    let best = -1;
    let bestScore = 0;
    gotPoints.forEach((gotTitle, gotIndex) => {
      if (gotMatched[gotIndex]) return;
      const score = titleSimilarity(expTitle, gotTitle);
      if (score > bestScore) {
        bestScore = score;
        best = gotIndex;
      }
    });
    if (best >= 0 && bestScore >= MATCH_THRESHOLD) {
      expectedMatched[expIndex] = true;
      gotMatched[best] = true;
    }
  });

  const matchedCount = expectedMatched.filter(Boolean).length;
  const pointRecall = expected.points.length ? matchedCount / expected.points.length : 1;
  const pointPrecision = gotPoints.length ? gotMatched.filter(Boolean).length / gotPoints.length : 1;

  // Refs: identity on book|chapter|start_verse; placement on main point_index.
  const refKey = (r: { book: string; chapter: number; start_verse: number }) =>
    `${norm(r.book)}|${r.chapter}|${r.start_verse}`;
  const gotRefs = new Map(data.scripture_references.map((r) => [refKey(r), r]));

  let refsFound = 0;
  let placementsRight = 0;
  const missedRefs: string[] = [];
  const expectedKeys = new Set(expected.refs.map(refKey));
  for (const expRef of expected.refs) {
    const got = gotRefs.get(refKey(expRef));
    if (!got) {
      missedRefs.push(`${expRef.book} ${expRef.chapter}:${expRef.start_verse}`);
      continue;
    }
    refsFound += 1;
    if ((got.point_index ?? null) === expRef.point_index) placementsRight += 1;
  }
  const falseRefs = data.scripture_references
    .filter((r) => !expectedKeys.has(refKey(r)))
    .map((r) => `${r.book} ${r.chapter}:${r.start_verse}`);

  return {
    name: fixture.name,
    titleOk: titleSimilarity(expected.title, data.title) >= MATCH_THRESHOLD,
    seriesOk: norm(expected.series || "") === norm(data.series || ""),
    pointRecall,
    pointPrecision,
    falsePoints: gotPoints.filter((_, i) => !gotMatched[i]),
    missedPoints: expected.points.filter((_, i) => !expectedMatched[i]),
    refRecall: expected.refs.length ? refsFound / expected.refs.length : 1,
    refPlacementAccuracy: refsFound ? placementsRight / refsFound : 1,
    missedRefs,
    falseRefs,
    analysis,
  };
}

const only = (() => {
  const index = Deno.args.indexOf("--only");
  return index >= 0 ? Deno.args[index + 1] : null;
})();

const fixtures = only ? FIXTURES.filter((f) => f.name === only) : FIXTURES;
if (fixtures.length === 0) {
  console.error(`No fixture named "${only}". Available: ${FIXTURES.map((f) => f.name).join(", ")}`);
  Deno.exit(1);
}

const scores: FixtureScore[] = [];
let totalTokens = 0;
for (const fixture of fixtures) {
  const started = Date.now();
  try {
    const result = await parser.parseManuscriptWithClaude(fixture.input);
    totalTokens += result.tokens_used ?? 0;
    const score = scoreFixture(fixture, result.data, result.analysis ?? null);
    scores.push(score);
    console.log(
      `${score.pointRecall === 1 && score.falsePoints.length === 0 && score.refRecall === 1 && score.falseRefs.length === 0 ? "✓" : "•"} ${fixture.name}` +
        ` — points ${Math.round(score.pointRecall * 100)}%R/${Math.round(score.pointPrecision * 100)}%P,` +
        ` refs ${Math.round(score.refRecall * 100)}%R, placement ${Math.round(score.refPlacementAccuracy * 100)}%` +
        ` (${((Date.now() - started) / 1000).toFixed(1)}s)`,
    );
    if (score.missedPoints.length) console.log(`    missed points: ${score.missedPoints.join(" | ")}`);
    if (score.falsePoints.length) console.log(`    false points:  ${score.falsePoints.join(" | ")}`);
    if (score.missedRefs.length) console.log(`    missed refs:   ${score.missedRefs.join(", ")}`);
    if (score.falseRefs.length) console.log(`    FALSE refs:    ${score.falseRefs.join(", ")}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`✗ ${fixture.name} — ERROR: ${message}`);
    scores.push({
      name: fixture.name,
      titleOk: false,
      seriesOk: false,
      pointRecall: 0,
      pointPrecision: 0,
      falsePoints: [],
      missedPoints: fixture.expected.points,
      refRecall: 0,
      refPlacementAccuracy: 0,
      missedRefs: [],
      falseRefs: [],
      analysis: null,
      error: message,
    });
  }
}

const avg = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const summary = {
  prompt_version: parser.PROMPT_VERSION ?? "unknown",
  model_id: parser.BEDROCK_MODEL_ID ?? Deno.env.get("QUICK_BUILD_MODEL_ID") ?? "unknown",
  ran_at: new Date().toISOString(),
  fixtures: scores.length,
  total_tokens: totalTokens,
  avg_point_recall: avg(scores.map((s) => s.pointRecall)),
  avg_point_precision: avg(scores.map((s) => s.pointPrecision)),
  total_false_points: scores.reduce((a, s) => a + s.falsePoints.length, 0),
  total_false_refs: scores.reduce((a, s) => a + s.falseRefs.length, 0),
  avg_ref_recall: avg(scores.map((s) => s.refRecall)),
  avg_ref_placement: avg(scores.map((s) => s.refPlacementAccuracy)),
  titles_ok: scores.filter((s) => s.titleOk).length,
  series_ok: scores.filter((s) => s.seriesOk).length,
  scores,
};

console.log("\n=== SUMMARY ===");
console.log(`prompt ${summary.prompt_version} · model ${summary.model_id}`);
console.log(
  `point recall ${(summary.avg_point_recall * 100).toFixed(1)}% · precision ${(summary.avg_point_precision * 100).toFixed(1)}%` +
    ` · false points ${summary.total_false_points} · false refs ${summary.total_false_refs}`,
);
console.log(
  `ref recall ${(summary.avg_ref_recall * 100).toFixed(1)}% · placement ${(summary.avg_ref_placement * 100).toFixed(1)}%` +
    ` · titles ${summary.titles_ok}/${scores.length} · series ${summary.series_ok}/${scores.length}`,
);

if (!only) {
  const resultsDir = new URL("./results/", import.meta.url);
  await Deno.mkdir(resultsDir, { recursive: true });
  const outPath = new URL(`./results/${summary.prompt_version}-${Date.now()}.json`, import.meta.url);
  await Deno.writeTextFile(outPath, JSON.stringify(summary, null, 2));
  console.log(`\nScorecard written to ${outPath.pathname}`);
}
