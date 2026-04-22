import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { adminApi, formatAdminDate, formatMoney } from "@/lib/admin-api";

const filters = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "canceled", label: "Canceled" },
  { value: "past_due", label: "Past Due" },
  { value: "failed_payment", label: "Failed Payment" },
  { value: "free", label: "Free" },
  { value: "beta", label: "Beta" },
  { value: "recent", label: "Recent Signups" },
  { value: "support", label: "Open Support" },
];

const NextInvoiceSummary = ({ nextInvoice }: { nextInvoice?: any }) => {
  if (!nextInvoice || nextInvoice.status === "none") {
    return <span className="text-muted-foreground">No upcoming invoice</span>;
  }

  if (nextInvoice.status === "unavailable") {
    return <span className="text-amber-700">Unavailable</span>;
  }

  return (
    <div className="space-y-0.5">
      <p className="font-medium text-foreground">
        {typeof nextInvoice.amountDue === "number" ? formatMoney(nextInvoice.amountDue, nextInvoice.currency || "usd") : "Amount unavailable"}
      </p>
      <p className="text-xs text-muted-foreground">{formatAdminDate(nextInvoice.nextInvoiceAt)}</p>
    </div>
  );
};

const AdminCustomers = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const load = async () => {
    setLoading(true);
    try {
      const result = await adminApi<{ items: any[] }>("customers", { search, status, limit: 100 });
      setItems(result.items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [status]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold">Customers</h1>
        <p className="text-muted-foreground mt-1">Search accounts, subscription states, and customer context.</p>
      </div>

      <div className="rounded-2xl glass-panel p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative md:w-96">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} className="pl-9" placeholder="Search name, email, Stripe id..." />
          </div>
          <div className="flex gap-2">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {filters.map((filter) => <SelectItem key={filter.value} value={filter.value}>{filter.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={load}>Search</Button>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-xl border border-border/70">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium">Organization</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Next Invoice</th>
                <th className="px-4 py-3 font-medium">Support</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70 bg-white/45">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Loading customers...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No customers found.</td></tr>
              ) : items.map((item) => {
                const location = [item.account.city, item.account.state].filter(Boolean).join(", ");
                return (
                <tr key={item.account.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{item.owner?.full_name || "No owner profile"}</p>
                    <p className="text-xs text-muted-foreground">{item.owner?.email || item.account.stripe_customer_id || item.account.id}</p>
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      <span>{item.account.name}</span>
                      {item.account.is_beta_user && (
                        <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          Beta
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{location || "Unavailable"}</td>
                  <td className="px-4 py-3 capitalize">{item.account.plan_tier || "free"}</td>
                  <td className="px-4 py-3">{item.account.subscription_status}</td>
                  <td className="px-4 py-3"><NextInvoiceSummary nextInvoice={item.nextInvoice} /></td>
                  <td className="px-4 py-3">{item.supportRequestCount}</td>
                  <td className="px-4 py-3">{formatAdminDate(item.account.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/admin/customers/${item.account.id}`}>
                      <Button variant="outline" size="sm">View</Button>
                    </Link>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminCustomers;
