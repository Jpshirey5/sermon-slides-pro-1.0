import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Download, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ServicesHeader } from "@/components/services/ServicesHeader";
import { formatDateOnlyForDisplay } from "@/lib/date-format";
import { deleteSongUse, listSongUses, songReportCsv, type SongUse, summarizeSongUses } from "@/lib/songs";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthsAgo = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n, 1);
  return ymd(d);
};

const PRESETS = [
  { label: "This month", from: () => monthsAgo(0) },
  { label: "Last 3 months", from: () => monthsAgo(2) },
  { label: "Last 6 months", from: () => monthsAgo(5) },
  { label: "This year", from: () => `${new Date().getFullYear()}-01-01` },
];

/** Songs shown in services, totaled per song, for the church to enter in its CCLI reporting account. */
const SongReport = () => {
  const [from, setFrom] = useState(monthsAgo(5));
  const [to, setTo] = useState(ymd(new Date()));
  const [uses, setUses] = useState<SongUse[] | null>(null);

  const load = useCallback(() => {
    setUses(null);
    listSongUses(from, to)
      .then(setUses)
      .catch((error) => {
        setUses([]);
        toast.error("Could not load the report", { description: (error as Error).message });
      });
  }, [from, to]);

  useEffect(() => {
    if (from && to && from <= to) load();
  }, [from, to, load]);

  const { report, notReported } = useMemo(() => summarizeSongUses(uses ?? []), [uses]);

  const copyForCcli = async () => {
    const text = report.map((r) => [r.title, r.ccliSongNumber ? `CCLI Song # ${r.ccliSongNumber}` : "No CCLI number", `${r.uses} time${r.uses === 1 ? "" : "s"}`].join("\t")).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied", { description: "Paste it next to your CCLI reporting form as you enter each song." });
    } catch {
      toast.error("Could not copy. Use Download instead.");
    }
  };

  const download = () => {
    const blob = new Blob([songReportCsv(report)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ccli-song-report-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const remove = async (use: SongUse) => {
    try {
      await deleteSongUse(use.id);
      setUses((list) => list?.filter((u) => u.id !== use.id) ?? null);
      toast.success(`Removed ${use.title} on ${formatDateOnlyForDisplay(use.usedOn)}`);
    } catch (error) {
      toast.error("Could not remove it", { description: (error as Error).message });
    }
  };

  return (
    <div className="app-shell">
      <ServicesHeader backTo="/dashboard/songs" backLabel="Songs" />
      <main className="container mx-auto max-w-3xl px-4 py-8">
        <h1 className="font-serif text-3xl font-semibold text-foreground">CCLI report</h1>
        <p className="mt-1 text-muted-foreground">
          Songs shown on your main screen, counted once per service. Enter these in your CCLI reporting account.
        </p>

        <Card className="mt-6">
          <CardContent className="flex flex-wrap items-end gap-3 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="report-from">From</Label>
              <Input id="report-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-to">To</Label>
              <Input id="report-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <Button key={p.label} variant="ghost" size="sm" onClick={() => { setFrom(p.from()); setTo(ymd(new Date())); }}>
                  {p.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {uses === null ? (
          <div className="flex justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <>
            <section className="mt-8" aria-labelledby="report-heading">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 id="report-heading" className="mr-auto font-serif text-xl font-semibold text-foreground">Songs to report</h2>
                <Button variant="outline" size="sm" disabled={report.length === 0} onClick={() => void copyForCcli()}>
                  <Copy className="h-4 w-4" /> Copy
                </Button>
                <Button variant="outline" size="sm" disabled={report.length === 0} onClick={download}>
                  <Download className="h-4 w-4" /> Download
                </Button>
              </div>
              {report.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                  No licensed songs were shown in these dates. Songs are counted when one of their slides is on the main screen during a service.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border bg-card">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Song</th>
                        <th className="px-3 py-2 font-medium">CCLI #</th>
                        <th className="px-3 py-2 text-right font-medium">Times used</th>
                        <th className="px-3 py-2 font-medium">Last used</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {report.map((r) => (
                        <tr key={`${r.ccliSongNumber}-${r.title}`}>
                          <td className="px-3 py-2">
                            <p className="font-medium text-foreground">{r.title}</p>
                            {r.author && <p className="text-xs text-muted-foreground">{r.author}</p>}
                          </td>
                          <td className="px-3 py-2 tabular-nums">{r.ccliSongNumber || <span className="text-amber-600">Missing</span>}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.uses}</td>
                          <td className="px-3 py-2 text-muted-foreground">{formatDateOnlyForDisplay(r.lastUsed)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {report.some((r) => !r.ccliSongNumber) && (
                <p className="mt-2 text-xs text-amber-600">Some songs have no CCLI song number. Add it in the song so CCLI can match it.</p>
              )}
            </section>

            {notReported.length > 0 && (
              <section className="mt-8" aria-labelledby="not-reported-heading">
                <h2 id="not-reported-heading" className="font-serif text-lg font-semibold text-foreground">Not reported to CCLI</h2>
                <p className="mb-2 text-sm text-muted-foreground">Public domain and original songs. Listed for your records.</p>
                <ul className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
                  {notReported.map((r) => (
                    <li key={r.title} className="flex justify-between px-3 py-2">
                      <span>{r.title}</span>
                      <span className="tabular-nums text-muted-foreground">{r.uses}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {uses.length > 0 && (
              <section className="mt-8" aria-labelledby="uses-heading">
                <h2 id="uses-heading" className="font-serif text-lg font-semibold text-foreground">Each use</h2>
                <p className="mb-2 text-sm text-muted-foreground">Remove one that shouldn't count, like a rehearsal on the main screen.</p>
                <ul className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
                  {uses.map((u) => (
                    <li key={u.id} className="flex items-center gap-3 px-3 py-2">
                      <span className="w-28 shrink-0 text-muted-foreground">{formatDateOnlyForDisplay(u.usedOn)}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {u.title} <span className="text-muted-foreground">· {u.serviceTitle}</span>
                      </span>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label={`Remove ${u.title} on ${u.usedOn}`} onClick={() => void remove(u)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default SongReport;
