# Quick Build Parser Eval Harness

Scores the sermon parser against a fixture suite of realistic formatting conventions
(ALL-CAPS points, Big Idea labels, fill-in-the-blank handouts, announcement-polluted
bulletins, cross-chapter refs, ...). Run it before shipping any change to the PROMPT
or tool schema in `supabase/functions/parse-sermon-manuscript/claudeParser.ts`, and
bump `PROMPT_VERSION` there for every iteration so scorecards stay comparable.

## Run

Needs AWS credentials with Bedrock access (the same ones stored as Supabase edge
function secrets — copy them from the Supabase dashboard or your AWS console):

```sh
AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=us-east-1 \
  deno run --allow-net --allow-env --allow-read --allow-write scripts/quick-build-eval/run.ts
```

- `--only <fixture-name>` — run a single fixture while iterating.
- `QUICK_BUILD_MODEL_ID=...` — A/B a different Bedrock model.
- `PARSER_MODULE=<path>` — score an alternate `claudeParser.ts` (e.g. from a
  `git worktree` of an older commit) to produce a baseline for comparison.

Full runs write a scorecard to `results/<prompt_version>-<timestamp>.json`.

## Shipping bar

- No regression on `classic-numbered-outline` / `subpoints-nested-outline`.
- `announcements-polluted` and `illustration-heavy-manuscript` must produce zero
  false points (announcements, worship songs, illustrations must not become points).
- `no-points-topical` must return zero points (no fabrication).

## Adding fixtures

Add real-world failure documents to `fixtures.ts` as they come in from users
(strip anything identifying). Each fixture pairs an input (`text` or mammoth-shaped
`html`) with the expected flat point list (numbering stripped, subpoints included)
and refs with their main-point placement (`point_index`, null = intro).
