import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { adminApi, formatAdminDate } from "@/lib/admin-api";

const AdminBilling = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi<{ items: any[] }>("billing_list")
      .then((data) => setItems(data.items))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold">Billing</h1>
        <p className="text-muted-foreground mt-1">Subscription and payment visibility backed by account and Stripe context.</p>
      </div>

      <div className="rounded-2xl glass-panel p-5 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-3 font-medium">Organization</th>
              <th className="py-3 font-medium">Plan</th>
              <th className="py-3 font-medium">Status</th>
              <th className="py-3 font-medium">Billing</th>
              <th className="py-3 font-medium">Period End</th>
              <th className="py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {loading ? (
              <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Loading billing...</td></tr>
            ) : items.map((account) => (
              <tr key={account.id}>
                <td className="py-3">{account.name}</td>
                <td className="py-3 capitalize">{account.plan_tier || "free"}</td>
                <td className="py-3">{account.subscription_status}</td>
                <td className="py-3 capitalize">{account.billing_interval || "none"}</td>
                <td className="py-3">{formatAdminDate(account.subscription_period_end)}</td>
                <td className="py-3 text-right">
                  <Link to={`/admin/customers/${account.id}`}>
                    <Button variant="outline" size="sm">Details</Button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminBilling;
