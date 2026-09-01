import { useEffect, useState } from "react";
import { Search, Send, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminApi, formatAdminDate, formatAdminRelativeTime } from "@/lib/admin-api";
import { toast } from "sonner";

const AdminPendingSignups = () => {
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [resendingIds, setResendingIds] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const result = await adminApi<{ items: any[] }>("pending_signups_list", { search });
      setItems(result.items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const resend = async (id: string) => {
    setResendingIds((current) => new Set(current).add(id));
    try {
      const result = await adminApi<{ finishEmailSentAt: string | null; finishEmailError: string | null }>(
        "pending_signups_resend_email",
        { id },
      );
      toast.success("Finish-signup email resent.");
      setItems((current) =>
        current.map((item) =>
          item.id === id
            ? { ...item, finish_email_sent_at: result.finishEmailSentAt, finish_email_error: result.finishEmailError, staleHours: 0, isExpired: false }
            : item,
        ),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not resend the finish-signup email.");
    } finally {
      setResendingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold">Pending Signups</h1>
        <p className="text-muted-foreground mt-1">
          Customers who paid via Stripe but never finished creating their account.
        </p>
      </div>

      <div className="rounded-2xl glass-panel p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 gap-2 xl:max-w-xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && load()}
                className="pl-9"
                placeholder="Search by email or Stripe customer ID..."
              />
            </div>
            <Button variant="outline" onClick={load}>Search</Button>
          </div>
        </div>

        {loading ? (
          <p className="text-center text-muted-foreground py-8">Loading pending signups...</p>
        ) : items.length === 0 ? (
          <div className="py-12 text-center">
            <UserPlus className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
            <p className="font-medium text-foreground">No pending signups.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Customers who pay but never finish creating their account will show up here.
            </p>
          </div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-2xl border border-border/70 bg-white/65">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead>Email</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Stripe Customer</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Stale</TableHead>
                  <TableHead>Finish Email</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const isResending = resendingIds.has(item.id);
                  const isStale = item.staleHours > 24 || item.isExpired;
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="min-w-48">
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">{item.checkout_email || "Unknown email"}</p>
                          {item.reason === "email_conflict" && (
                            <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                              Email conflict
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {item.plan_tier || "—"}
                        {item.billing_interval ? ` (${item.billing_interval})` : ""}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {item.stripe_customer_id ? (
                          <a
                            href={`https://dashboard.stripe.com/customers/${item.stripe_customer_id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline"
                          >
                            {item.stripe_customer_id}
                          </a>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatAdminDate(item.paid_at)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        <span className={isStale ? "font-medium text-destructive" : "text-muted-foreground"}>
                          {formatAdminRelativeTime(item.updated_at)}
                          {item.isExpired ? " (expired)" : ""}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {item.finish_email_error ? (
                          <span className="text-destructive" title={item.finish_email_error}>Failed</span>
                        ) : item.finish_email_sent_at ? (
                          <span className="text-muted-foreground">Sent</span>
                        ) : (
                          <span className="text-muted-foreground">Not sent</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => resend(item.id)}
                          disabled={isResending || item.reason === "email_conflict"}
                        >
                          <Send className="h-4 w-4" />
                          Resend Email
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPendingSignups;
