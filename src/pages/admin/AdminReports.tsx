import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { adminApi, formatMoney } from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const RANGE_OPTIONS = [
  { label: "1 Day", days: 1 },
  { label: "7 Days", days: 7 },
  { label: "30 Days", days: 30 },
  { label: "90 Days", days: 90 },
];

const renderChartDot = (props: any) => {
  if (typeof props?.value !== "number" || props.value <= 0) return null;
  return <circle cx={props.cx} cy={props.cy} r={4} fill="hsl(var(--background))" stroke={props.stroke} strokeWidth={2} />;
};

const StatCard = ({ label, value, hint }: { label: string; value: string | number; hint?: string }) => (
  <div className="rounded-2xl glass-panel p-5">
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className="mt-3 text-3xl font-semibold text-foreground">{value}</p>
    {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
  </div>
);

const RangeSelector = ({ value, onChange }: { value: number; onChange: (days: number) => void }) => (
  <div className="flex flex-wrap gap-2">
    {RANGE_OPTIONS.map((option) => (
      <Button
        key={option.days}
        type="button"
        variant={value === option.days ? "hero" : "outline"}
        size="sm"
        onClick={() => onChange(option.days)}
        className="min-w-[76px]"
      >
        {option.label}
      </Button>
    ))}
  </div>
);

const AdminReports = () => {
  const [rangeDays, setRangeDays] = useState(30);
  const [revenue, setRevenue] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [signups, setSignups] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      adminApi("overview_revenue", { days: rangeDays }),
      adminApi("overview_usage", { days: rangeDays }),
      adminApi("overview_activity", { days: rangeDays }),
    ])
      .then(([rev, use, act]) => {
        if (cancelled) return;
        setRevenue(rev);
        setUsage(use);
        setSignups(act);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rangeDays]);

  const revenueSummary = revenue?.summary || {};
  const currency = revenueSummary.currency || "usd";
  const split = usage?.buildModeSplit || { quickBuild: 0, structuredBuilder: 0, unknown: 0 };
  const attributed = split.quickBuild + split.structuredBuilder;
  const quickBuildPct = attributed > 0 ? Math.round((split.quickBuild / attributed) * 100) : 0;

  const signupTotals = (signups?.items || []).reduce(
    (acc: { orgSignups: number; userSignups: number; orgDeletions: number }, item: any) => ({
      orgSignups: acc.orgSignups + (item.orgSignups || 0),
      userSignups: acc.userSignups + (item.userSignups || 0),
      orgDeletions: acc.orgDeletions + (item.orgDeletions || 0),
    }),
    { orgSignups: 0, userSignups: 0, orgDeletions: 0 },
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground">Reports</h1>
          <p className="text-muted-foreground mt-1">Revenue, signups, and platform usage over time.</p>
        </div>
        <RangeSelector value={rangeDays} onChange={setRangeDays} />
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading reports...</p>
      ) : (
        <>
          {/* Revenue & MRR */}
          <section className="space-y-4">
            <h2 className="font-serif text-xl font-semibold">Revenue &amp; MRR</h2>
            {revenue?.error && (
              <p className="text-sm text-destructive">{revenue.error}</p>
            )}
            <div className="grid gap-4 md:grid-cols-4">
              <StatCard label="Current MRR" value={formatMoney(revenueSummary.currentMrrCents, currency)} hint="Active subscriptions" />
              <StatCard label="Gross Revenue" value={formatMoney(revenueSummary.grossRevenueCents, currency)} hint="In selected range" />
              <StatCard label="Net Revenue" value={formatMoney(revenueSummary.netRevenueCents, currency)} hint="After refunds" />
              <StatCard label="Refunded" value={formatMoney(revenueSummary.refundedCents, currency)} hint={`Stripe fees ${formatMoney(revenueSummary.stripeFeesCents, currency)}`} />
            </div>
            <div className="rounded-2xl glass-panel p-5">
              <ChartContainer
                className="h-64 w-full"
                config={{
                  grossRevenueCents: { label: "Gross", color: "hsl(var(--primary))" },
                  netRevenueCents: { label: "Net", color: "#16a34a" },
                  refundedCents: { label: "Refunded", color: "#dc2626" },
                }}
              >
                <LineChart data={revenue?.items || []} margin={{ left: 8, right: 16, top: 8 }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} width={52} tickFormatter={(v) => `$${Math.round((Number(v) || 0) / 100)}`} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(value) => { const [, m, d] = String(value).split("-"); return `${m}/${d}`; }} />
                  <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                  <Line dataKey="grossRevenueCents" type="linear" stroke="var(--color-grossRevenueCents)" strokeWidth={2.5} dot={renderChartDot} />
                  <Line dataKey="netRevenueCents" type="linear" stroke="var(--color-netRevenueCents)" strokeWidth={2.5} dot={renderChartDot} />
                  <Line dataKey="refundedCents" type="linear" stroke="var(--color-refundedCents)" strokeWidth={2.5} dot={renderChartDot} />
                  <ChartLegend content={<ChartLegendContent />} />
                </LineChart>
              </ChartContainer>
            </div>
          </section>

          {/* Signups & churn */}
          <section className="space-y-4">
            <h2 className="font-serif text-xl font-semibold">Signups &amp; Churn</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <StatCard label="New Organizations" value={signupTotals.orgSignups} hint="In selected range" />
              <StatCard label="New Users" value={signupTotals.userSignups} hint="In selected range" />
              <StatCard label="Org Deletions" value={signupTotals.orgDeletions} hint="Requested or completed" />
            </div>
            <div className="rounded-2xl glass-panel p-5">
              <ChartContainer
                className="h-64 w-full"
                config={{
                  orgSignups: { label: "Org Signups", color: "hsl(var(--primary))" },
                  userSignups: { label: "User Signups", color: "#16a34a" },
                  orgDeletions: { label: "Org Deletions", color: "#f97316" },
                }}
              >
                <LineChart data={signups?.items || []} margin={{ left: 8, right: 16, top: 8 }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} width={36} allowDecimals={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(value) => { const [, m, d] = String(value).split("-"); return `${m}/${d}`; }} />
                  <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                  <Line dataKey="orgSignups" type="linear" stroke="var(--color-orgSignups)" strokeWidth={2.5} dot={renderChartDot} />
                  <Line dataKey="userSignups" type="linear" stroke="var(--color-userSignups)" strokeWidth={2.5} dot={renderChartDot} />
                  <Line dataKey="orgDeletions" type="linear" stroke="var(--color-orgDeletions)" strokeWidth={2.5} dot={renderChartDot} />
                  <ChartLegend content={<ChartLegendContent />} />
                </LineChart>
              </ChartContainer>
            </div>
          </section>

          {/* Usage */}
          <section className="space-y-4">
            <h2 className="font-serif text-xl font-semibold">Platform Usage</h2>
            <div className="grid gap-4 md:grid-cols-4">
              <StatCard label="Presentations (range)" value={usage?.presentationsInWindow ?? 0} hint={`${usage?.totalPresentations ?? 0} all-time`} />
              <StatCard label="Active Organizations" value={usage?.activeOrgs ?? 0} hint="Created a deck in range" />
              <StatCard label="Quick Build Share" value={`${quickBuildPct}%`} hint={`${split.quickBuild} Quick · ${split.structuredBuilder} Structured`} />
              <StatCard label="Exports" value={usage?.exports?.succeeded ?? 0} hint={`${usage?.exports?.started ?? 0} started`} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl glass-panel p-5">
                <h3 className="font-medium mb-3">Build mode split</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Quick Build</span><span className="font-semibold">{split.quickBuild}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Structure Builder</span><span className="font-semibold">{split.structuredBuilder}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Unattributed (pre-tracking)</span><span className="font-semibold">{split.unknown}</span></div>
                </div>
              </div>
              <div className="rounded-2xl glass-panel p-5">
                <h3 className="font-medium mb-3">Quick Build uploads</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Success</span><span className="font-semibold">{usage?.quickBuildUploads?.success ?? 0}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Partial</span><span className="font-semibold">{usage?.quickBuildUploads?.partial ?? 0}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Failed</span><span className="font-semibold">{usage?.quickBuildUploads?.failed ?? 0}</span></div>
                </div>
              </div>
            </div>
            {(usage?.quickBuildAccuracy?.length ?? 0) > 0 && (
              <div className="rounded-2xl glass-panel p-5">
                <h3 className="font-medium mb-1">Quick Build accuracy by prompt version</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Avg corrections are per finalized parse — points the user added/removed and verses they moved in Sermon Review. Lower is better.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="py-1.5 pr-4 font-normal">Prompt version</th>
                        <th className="py-1.5 pr-4 font-normal">Uploads (S/P/F)</th>
                        <th className="py-1.5 pr-4 font-normal">Finalized</th>
                        <th className="py-1.5 pr-4 font-normal">Avg points added</th>
                        <th className="py-1.5 pr-4 font-normal">Avg points removed</th>
                        <th className="py-1.5 font-normal">Avg verse moves</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usage.quickBuildAccuracy.map((row: any) => (
                        <tr key={row.promptVersion} className="border-t border-border/60">
                          <td className="py-1.5 pr-4 font-medium">{row.promptVersion}</td>
                          <td className="py-1.5 pr-4">{row.uploads.success} / {row.uploads.partial} / {row.uploads.failed}</td>
                          <td className="py-1.5 pr-4">{row.finalized} of {row.parses}</td>
                          <td className="py-1.5 pr-4">{row.avgPointsAdded}</td>
                          <td className="py-1.5 pr-4">{row.avgPointsRemoved}</td>
                          <td className="py-1.5">{row.avgVerseMoves}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {usage?.notes?.exports && <p className="text-xs text-muted-foreground">{usage.notes.exports}</p>}
          </section>
        </>
      )}
    </div>
  );
};

export default AdminReports;
