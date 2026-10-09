// Backfill logic for scripts/strip-sermon-scripture.ts, kept separate so it
// can be tested without a database. See that file for how to run it.

import { describeStoredScripture, stripScriptureText } from "../src/lib/scripture-storage.ts";

export interface SermonRow {
  id: string;
  account_id: string;
  title: string;
  slides: unknown;
  updated_at: string;
}

export interface BackfillDb {
  /** Sermons ordered by id, after `afterId`, at most `limit`. */
  page(afterId: string | null, limit: number): Promise<SermonRow[]>;
  /**
   * Write stripped slides only if the row has not changed since we read it.
   * Returns false when it changed (a pastor saved meanwhile); we skip it.
   */
  update(id: string, slides: unknown, expectedUpdatedAt: string): Promise<boolean>;
}

export interface BackfillReport {
  mode: "dry-run" | "apply";
  sermonsScanned: number;
  sermonsWithText: number;
  textBlocksRemoved: number;
  sermonsUpdated: number;
  sermonsSkippedChanged: number;
  /** Legacy scripture slides with text but no readable reference. Text is kept. */
  unreadable: { sermonId: string; accountId: string; title: string; slides: number }[];
}

export async function runBackfill(db: BackfillDb, options: { apply: boolean; pageSize?: number }): Promise<BackfillReport> {
  const pageSize = options.pageSize ?? 200;
  const report: BackfillReport = {
    mode: options.apply ? "apply" : "dry-run",
    sermonsScanned: 0,
    sermonsWithText: 0,
    textBlocksRemoved: 0,
    sermonsUpdated: 0,
    sermonsSkippedChanged: 0,
    unreadable: [],
  };

  let after: string | null = null;
  for (;;) {
    const rows = await db.page(after, pageSize);
    if (rows.length === 0) break;
    for (const row of rows) {
      report.sermonsScanned++;
      const found = describeStoredScripture(row.slides);
      if (found.unreadableWithText > 0) {
        report.unreadable.push({ sermonId: row.id, accountId: row.account_id, title: row.title, slides: found.unreadableWithText });
      }
      if (found.textBlocks === 0) continue;
      report.sermonsWithText++;
      report.textBlocksRemoved += found.textBlocks;
      if (!options.apply) continue;
      const ok = await db.update(row.id, stripScriptureText(row.slides), row.updated_at);
      if (ok) report.sermonsUpdated++;
      else report.sermonsSkippedChanged++;
    }
    after = rows[rows.length - 1].id;
    if (rows.length < pageSize) break;
  }
  return report;
}

/** Plain-language summary. Contains counts, ids, and titles only, never verse text. */
export function formatReport(r: BackfillReport): string {
  const lines = [
    r.mode === "dry-run" ? "DRY RUN: nothing was changed." : "APPLIED: sermons were updated.",
    `Sermons scanned: ${r.sermonsScanned}`,
    `Sermons holding verse text: ${r.sermonsWithText}`,
    `Verse text blocks ${r.mode === "dry-run" ? "that would be" : ""} removed: ${r.textBlocksRemoved}`.replace("  ", " "),
  ];
  if (r.mode === "apply") {
    lines.push(`Sermons updated: ${r.sermonsUpdated}`);
    lines.push(`Sermons skipped because they changed during the run: ${r.sermonsSkippedChanged} (run again to pick them up)`);
  }
  lines.push(`Sermons with scripture slides that have no readable reference (text kept, presenter shows black): ${r.unreadable.length}`);
  for (const u of r.unreadable.slice(0, 50)) lines.push(`  - ${u.title} (${u.sermonId}): ${u.slides} slide${u.slides === 1 ? "" : "s"}`);
  if (r.unreadable.length > 50) lines.push(`  ...and ${r.unreadable.length - 50} more`);
  return lines.join("\n");
}
