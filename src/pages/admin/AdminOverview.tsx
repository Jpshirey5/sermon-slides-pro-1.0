import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CreditCard, Inbox, Users } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { adminApi, formatAdminDate } from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const AdminOverview = () => {
  const [data, setData] = useState<any>(null);
  const [activity, setActivity] = useState<any>(null);
  const [rangeDays, setRangeDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);

  useEffect(() => {
    adminApi("overview")
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setActivityLoading(true);
    adminApi("overview_activity", { days: rangeDays })
      .then(setActivity)
      .finally(() => setActivityLoading(false));
  }, [rangeDays]);

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

      <section className="rounded-2xl glass-panel p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-serif text-xl font-semibold">Signup and Deletion Activity</h2>
            <p className="text-sm text-muted-foreground">
              Organization and user movement from real platform data.
            </p>
          </div>
          <div className="flex gap-2">
            {[7, 30, 90].map((days) => (
              <Button
                key={days}
                size="sm"
                variant={rangeDays === days ? "hero" : "outline"}
                onClick={() => setRangeDays(days)}
              >
                {days} days
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
              <AreaChart data={activity?.items || []} margin={{ left: 12, right: 12 }}>
                <CartesianGrid vertical={false} />
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
                <Area dataKey="orgSignups" type="natural" fill="var(--color-orgSignups)" fillOpacity={0.2} stroke="var(--color-orgSignups)" stackId="a" />
                <Area dataKey="userSignups" type="natural" fill="var(--color-userSignups)" fillOpacity={0.16} stroke="var(--color-userSignups)" stackId="b" />
                <Area dataKey="orgDeletions" type="natural" fill="var(--color-orgDeletions)" fillOpacity={0.18} stroke="var(--color-orgDeletions)" stackId="c" />
                <Area dataKey="userDeletions" type="natural" fill="var(--color-userDeletions)" fillOpacity={0.18} stroke="var(--color-userDeletions)" stackId="d" />
                <ChartLegend content={<ChartLegendContent />} />
              </AreaChart>
            </ChartContainer>
          )}
          {activity?.notes?.userDeletions && (
            <p className="mt-3 text-xs text-muted-foreground">{activity.notes.userDeletions}</p>
          )}
        </div>
      </section>

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
