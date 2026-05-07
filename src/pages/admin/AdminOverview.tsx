import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CreditCard, Inbox, Users } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { adminApi, formatAdminDate } from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

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

const AdminOverview = () => {
  const [data, setData] = useState<any>(null);
  const [activity, setActivity] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityRangeDays, setActivityRangeDays] = useState(30);

  useEffect(() => {
    adminApi("overview")
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setActivityLoading(true);
    adminApi("overview_activity", { days: activityRangeDays })
      .then(setActivity)
      .finally(() => setActivityLoading(false));
  }, [activityRangeDays]);

  if (loading) return <p className="text-muted-foreground">Loading overview...</p>;

  const metrics = data?.metrics || {};
  const cards = [
    { label: "Total Users", value: metrics.totalUsers, icon: Users },
    { label: "Active Subscribers", value: metrics.activeSubscribers, icon: CreditCard },
    { label: "Past Due / Failed", value: metrics.pastDueAccounts, icon: AlertCircle },
    { label: "Open Support", value: metrics.openSupportRequests, icon: Inbox },
  ];
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-bold text-foreground">Admin Overview</h1>
        <p className="text-muted-foreground mt-1">Business health, support load, and recent activity.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-2xl glass-panel p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{card.label}</p>
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <p className="mt-3 text-3xl font-semibold text-foreground">{card.value ?? 0}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6">
        <section className="rounded-2xl glass-panel p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-serif text-xl font-semibold">Signup and Deletion Activity</h2>
              <p className="text-sm text-muted-foreground">
                Organization and user movement from real platform data.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "1 Day", days: 1 },
                { label: "7 Days", days: 7 },
                { label: "30 Days", days: 30 },
                { label: "90 Days", days: 90 },
              ].map((option) => (
                <Button
                  key={option.days}
                  type="button"
                  variant={activityRangeDays === option.days ? "hero" : "outline"}
                  size="sm"
                  onClick={() => setActivityRangeDays(option.days)}
                  className="min-w-[76px]"
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="mt-5">
            {activityLoading ? (
              <div className="flex h-72 items-center justify-center rounded-xl border border-border/70 bg-white/55 text-sm text-muted-foreground">
                Loading activity...
              </div>
            ) : (
              <ChartContainer
                className="h-72 w-full"
                config={{
                  orgSignups: { label: "Org Signups", color: "hsl(var(--primary))" },
                  userSignups: { label: "User Signups", color: "#16a34a" },
                  orgDeletions: { label: "Org Deletions", color: "#f97316" },
                  userDeletions: { label: "User Deletions", color: "#dc2626" },
                }}
              >
                <LineChart data={activity?.items || []} margin={{ left: 8, right: 16, top: 8 }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="0" />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    width={36}
                    allowDecimals={false}
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
                  <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                  <Line dataKey="orgSignups" type="linear" stroke="var(--color-orgSignups)" strokeWidth={2.5} dot={renderChartDot} activeDot={renderActiveChartDot} />
                  <Line dataKey="userSignups" type="linear" stroke="var(--color-userSignups)" strokeWidth={2.5} dot={renderChartDot} activeDot={renderActiveChartDot} />
                  <Line dataKey="orgDeletions" type="linear" stroke="var(--color-orgDeletions)" strokeWidth={2.5} dot={renderChartDot} activeDot={renderActiveChartDot} />
                  <Line dataKey="userDeletions" type="linear" stroke="var(--color-userDeletions)" strokeWidth={2.5} dot={renderChartDot} activeDot={renderActiveChartDot} />
                  <ChartLegend content={<ChartLegendContent />} />
                </LineChart>
              </ChartContainer>
            )}
            {activity?.notes?.userDeletions && (
              <p className="mt-3 text-xs text-muted-foreground">{activity.notes.userDeletions}</p>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl glass-panel p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-xl font-semibold">Recent Support</h2>
            <Link to="/admin/support"><Button variant="outline" size="sm">Open Queue</Button></Link>
          </div>
          <div className="space-y-3">
            {(data?.recentSupport || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No open support requests.</p>
            ) : data.recentSupport.map((item: any) => (
              <div key={item.id} className="rounded-xl border border-border/70 bg-white/65 p-3">
                <p className="text-sm font-medium">{item.name} · {item.email}</p>
                <p className="text-xs text-muted-foreground">{formatAdminDate(item.created_at)}</p>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{item.message}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl glass-panel p-5">
          <h2 className="font-serif text-xl font-semibold mb-4">Recent Signups</h2>
          <div className="space-y-3">
            {(data?.recentProfiles || []).map((profile: any) => (
              <div key={profile.id} className="rounded-xl border border-border/70 bg-white/65 p-3">
                <p className="text-sm font-medium">{profile.full_name || "Unnamed"}</p>
                <p className="text-xs text-muted-foreground">{profile.email || profile.id}</p>
                <p className="text-xs text-muted-foreground">{formatAdminDate(profile.created_at)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default AdminOverview;
