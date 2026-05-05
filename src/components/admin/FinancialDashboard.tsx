import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Download, DollarSign, PiggyBank, Receipt, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import BucketCard from "@/components/admin/financial/BucketCard";
import ConnectCard from "@/components/admin/financial/ConnectCard";
import TransactionRow from "@/components/admin/financial/TransactionRow";
import { adminApi, formatMoney } from "@/lib/admin-api";
import {
  formatFinancialCurrency,
  useFinancialData,
  type FinancialTransaction,
  type FinancialTransactionType,
} from "@/hooks/useFinancialData";

type FinancialDashboardProps = {
  stripeApiKey?: string;
  relayApiKey?: string;
};

const chartConfig = {
  revenueCents: {
    label: "Revenue",
    color: "hsl(var(--primary))",
  },
};

const stripeRevenueChartConfig = {
  netAfterFeesCents: { label: "Net After Fees", color: "hsl(var(--primary))" },
  stripeFeesCents: { label: "Stripe Fees", color: "#dc2626" },
  refundedCents: { label: "Refunds", color: "#f97316" },
};

const transactionFilterOptions: Array<{ value: "all" | FinancialTransactionType; label: string }> = [
  { value: "all", label: "All" },
  { value: "income", label: "Income only" },
  { value: "expense", label: "Expenses only" },
];

const exportTransactionsCsv = (transactions: FinancialTransaction[]) => {
  const rows = [
    ["Name", "Date", "Type", "Status", "Amount"],
    ...transactions.map((transaction) => [
      transaction.name,
      transaction.date,
      transaction.type,
      transaction.status,
      (transaction.amountCents / 100).toFixed(2),
    ]),
  ];

  const csv = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "financial-transactions.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const renderChartDot = (props: any) => {
  if (typeof props?.value !== "number" || props.value <= 0) return null;

  return (
    <circle
      cx={props.cx}
      cy={props.cy}
      r={4}
      fill="hsl(var(--background))"
      stroke={props.stroke}
      strokeWidth={2}
    />
  );
};

const renderActiveChartDot = (props: any) => {
  if (typeof props?.value !== "number" || props.value <= 0) return null;

  return (
    <circle
      cx={props.cx}
      cy={props.cy}
      r={5}
      fill="hsl(var(--background))"
      stroke={props.stroke}
      strokeWidth={2}
    />
  );
};

const formatRevenueAxis = (value: number) => {
  const dollars = value / 100;
  if (Math.abs(dollars) >= 1000) return `${Math.round(dollars / 1000)}k`;
  return `${Math.round(dollars)}`;
};

const FinancialDashboard = ({ stripeApiKey, relayApiKey }: FinancialDashboardProps) => {
  const { revenue, subscribers, expenses, profit, buckets, transactions, monthlyRevenue, integrations } =
    useFinancialData({ stripeApiKey, relayApiKey });
  const [transactionFilter, setTransactionFilter] = useState<"all" | FinancialTransactionType>("all");
  const [rangeDays, setRangeDays] = useState(30);
  const [stripeRevenue, setStripeRevenue] = useState<any>(null);
  const [stripeRevenueLoading, setStripeRevenueLoading] = useState(true);

  useEffect(() => {
    setStripeRevenueLoading(true);
    adminApi("overview_revenue", { days: rangeDays })
      .then(setStripeRevenue)
      .catch((error) => {
        setStripeRevenue({ error: error instanceof Error ? error.message : "Unable to load Stripe revenue." });
      })
      .finally(() => setStripeRevenueLoading(false));
  }, [rangeDays]);

  const filteredTransactions = useMemo(() => {
    if (transactionFilter === "all") return transactions;
    return transactions.filter((transaction) => transaction.type === transactionFilter);
  }, [transactionFilter, transactions]);

  const stripeRevenueSummary = stripeRevenue?.summary || {};
  const stripeRevenueCurrency = stripeRevenueSummary.currency || "usd";

  const metrics = [
    {
      label: "Monthly Revenue",
      value:
        typeof stripeRevenueSummary.netAfterFeesCents === "number"
          ? formatMoney(stripeRevenueSummary.netAfterFeesCents, stripeRevenueCurrency)
          : formatFinancialCurrency(revenue),
      icon: DollarSign,
    },
    {
      label: "Active Subscribers",
      value:
        typeof stripeRevenueSummary.activeSubscriptionCount === "number"
          ? stripeRevenueSummary.activeSubscriptionCount.toLocaleString()
          : subscribers.toLocaleString(),
      icon: Users,
    },
    { label: "Operating Expenses", value: formatFinancialCurrency(expenses), icon: Receipt },
    { label: "Net Profit", value: formatFinancialCurrency(profit), icon: PiggyBank },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold text-foreground">Financials</h1>
        <p className="mt-1 text-muted-foreground">
          Mock-first financial visibility for revenue, Profit First allocations, and connection readiness.
        </p>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-2xl bg-muted/80 p-1 sm:grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="profit-first">Profit First</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="connect">Connect</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <div key={metric.label} className="rounded-2xl glass-panel p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">{metric.label}</p>
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <p className="mt-3 text-3xl font-semibold text-foreground">{metric.value}</p>
                </div>
              );
            })}
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
            <section className="rounded-2xl glass-panel p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="font-serif text-xl font-semibold text-foreground">Stripe Revenue</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Take-home revenue after Stripe fees, plus current subscription run-rate.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
                  {[1, 7, 30, 90].map((days) => (
                    <Button
                      key={days}
                      size="sm"
                      variant={rangeDays === days ? "hero" : "outline"}
                      onClick={() => setRangeDays(days)}
                    >
                      {days} day{days === 1 ? "" : "s"}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border/70 bg-white/65 p-3">
                  <p className="text-xs text-muted-foreground">Net After Stripe Fees</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">
                    {formatMoney(stripeRevenueSummary.netAfterFeesCents ?? 0, stripeRevenueCurrency)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Gross {formatMoney(stripeRevenueSummary.grossRevenueCents ?? 0, stripeRevenueCurrency)}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-white/65 p-3">
                  <p className="text-xs text-muted-foreground">Current MRR</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">
                    {formatMoney(stripeRevenueSummary.currentMrrCents ?? 0, stripeRevenueCurrency)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {stripeRevenueSummary.activeSubscriptionCount ?? 0} active subscriptions
                  </p>
                </div>
              </div>

              {stripeRevenue?.error && (
                <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Stripe revenue could not be loaded: {stripeRevenue.error}
                </div>
              )}

              <div className="mt-5">
                {stripeRevenueLoading ? (
                  <div className="flex h-[300px] items-center justify-center rounded-xl border border-border/70 bg-white/55 text-sm text-muted-foreground">
                    Loading Stripe revenue...
                  </div>
                ) : (
                  <ChartContainer config={stripeRevenueChartConfig} className="h-[300px] w-full">
                    <LineChart data={stripeRevenue?.items || []} margin={{ left: 8, right: 16, top: 8 }}>
                      <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="0" />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        width={44}
                        tickFormatter={(value) => formatRevenueAxis(Number(value))}
                      />
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        tickFormatter={(value) => {
                          const [, month, day] = String(value).split("-");
                          return `${month}/${day}`;
                        }}
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            indicator="dot"
                            formatter={(value, name) => (
                              <div className="flex min-w-40 items-center justify-between gap-4">
                                <span className="text-muted-foreground">{name}</span>
                                <span className="font-mono font-medium text-foreground">
                                  {formatMoney(Number(value), stripeRevenueCurrency)}
                                </span>
                              </div>
                            )}
                          />
                        }
                      />
                      <Line
                        dataKey="netAfterFeesCents"
                        name="Net After Fees"
                        type="linear"
                        stroke="var(--color-netAfterFeesCents)"
                        strokeWidth={2.75}
                        dot={renderChartDot}
                        activeDot={renderActiveChartDot}
                      />
                      <Line
                        dataKey="stripeFeesCents"
                        name="Stripe Fees"
                        type="linear"
                        stroke="var(--color-stripeFeesCents)"
                        strokeWidth={2.25}
                        dot={renderChartDot}
                        activeDot={renderActiveChartDot}
                      />
                      <Line
                        dataKey="refundedCents"
                        name="Refunds"
                        type="linear"
                        stroke="var(--color-refundedCents)"
                        strokeWidth={2.25}
                        dot={renderChartDot}
                        activeDot={renderActiveChartDot}
                      />
                      <ChartLegend content={<ChartLegendContent />} />
                    </LineChart>
                  </ChartContainer>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{stripeRevenueSummary.paidInvoiceCount ?? 0} paid invoices</span>
                <span>{formatMoney(stripeRevenueSummary.stripeFeesCents ?? 0, stripeRevenueCurrency)} Stripe fees</span>
                <span>{formatMoney(stripeRevenueSummary.refundedCents ?? 0, stripeRevenueCurrency)} refunded</span>
                <span>{formatMoney(stripeRevenueSummary.netRevenueCents ?? 0, stripeRevenueCurrency)} net before fees</span>
                {stripeRevenueSummary.mixedCurrencies && <span>Multiple Stripe currencies detected.</span>}
              </div>
            </section>

            <section className="rounded-2xl glass-panel p-5">
              <div>
                <h2 className="font-serif text-xl font-semibold text-foreground">Recent Transactions</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Latest income and expenses styled for quick scanning.
                </p>
              </div>

              <div className="mt-5 space-y-3">
                {transactions.slice(0, 4).map((transaction) => (
                  <TransactionRow key={transaction.id} transaction={transaction} />
                ))}
              </div>

              <div className="mt-5 rounded-xl border border-border/70 bg-white/65 p-4">
                <h3 className="font-medium text-foreground">Mock revenue trend</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Local sample data remains available here until live expenses and accounting integrations are added.
                </p>
                <div className="mt-4">
                  <ChartContainer config={chartConfig} className="h-[180px] w-full">
                    <BarChart data={monthlyRevenue} margin={{ left: 8, right: 8, top: 8 }}>
                      <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        width={44}
                        tickFormatter={(value) => `${Math.round(Number(value) / 100)}`}
                      />
                      <ChartTooltip
                        cursor={false}
                        content={
                          <ChartTooltipContent
                            formatter={(value) => (
                              <div className="flex min-w-36 items-center justify-between gap-4">
                                <span className="text-muted-foreground">Revenue</span>
                                <span className="font-mono font-medium text-foreground">
                                  {formatFinancialCurrency(Number(value))}
                                </span>
                              </div>
                            )}
                          />
                        }
                      />
                      <Bar dataKey="revenueCents" radius={[10, 10, 0, 0]} fill="var(--color-revenueCents)" />
                    </BarChart>
                  </ChartContainer>
                </div>
              </div>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="profit-first" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {buckets.map((bucket) => (
              <BucketCard key={bucket.id} bucket={bucket} />
            ))}
          </div>

          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
            <h2 className="font-serif text-lg font-semibold text-foreground">Relay auto-transfer note</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Profit First allocations are designed to support Relay auto-transfers on the 1st and 15th so bucket
              balances stay aligned with your operating rhythm.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="transactions" className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-serif text-xl font-semibold text-foreground">Transactions</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Filter recent activity and export the current view when needed.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Select
                value={transactionFilter}
                onValueChange={(value: "all" | FinancialTransactionType) => setTransactionFilter(value)}
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Filter transactions" />
                </SelectTrigger>
                <SelectContent>
                  {transactionFilterOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button variant="outline" className="gap-2" onClick={() => exportTransactionsCsv(filteredTransactions)}>
                <Download className="h-4 w-4" />
                Export
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {filteredTransactions.map((transaction) => (
              <TransactionRow key={transaction.id} transaction={transaction} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="connect" className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-3">
            {Object.values(integrations).map((integration) => (
              <ConnectCard key={integration.key} integration={integration} />
            ))}
          </div>

          <div className="rounded-2xl border border-border/70 bg-white/65 p-5 text-sm text-muted-foreground">
            OAuth connections will be enabled through secure server-backed admin integrations. This screen is ready to
            surface connection state now without exposing billing or banking secrets in the browser.
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FinancialDashboard;
