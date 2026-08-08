import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { adminApi, formatAdminDate, formatMoney } from "@/lib/admin-api";

// Mirrors the same helpers used in AdminCustomerDetail.tsx -- livePlan and
// priceUnitAmount are resolved live from Stripe (see admin-api's
// getNextInvoiceSummary), independent of the DB-cached account.plan_tier.
const formatLiveStripePlan = (nextInvoice?: any) => {
  const livePlan = nextInvoice?.livePlan;
  if (!livePlan) return null;
  const interval = livePlan.billingInterval === "annual" ? "Yearly" : "Monthly";
  return `${livePlan.planLabel} ${interval}`;
};

const formatStickerPrice = (nextInvoice?: any) => {
  if (typeof nextInvoice?.priceUnitAmount !== "number") return null;
  const suffix = nextInvoice?.livePlan?.billingInterval === "annual" ? "/yr" : nextInvoice?.livePlan?.billingInterval === "monthly" ? "/mo" : "";
  return `${formatMoney(nextInvoice.priceUnitAmount, nextInvoice.currency || "usd")}${suffix}`;
};

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

      <div className="rounded-2xl glass-panel p-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-3 pr-4 font-medium">Organization</th>
              <th className="py-3 pr-4 font-medium">Plan</th>
              <th className="py-3 pr-4 font-medium">Stripe Plan (live)</th>
              <th className="py-3 pr-4 font-medium">Sticker Price (live)</th>
              <th className="py-3 pr-4 font-medium">Status</th>
              <th className="py-3 pr-4 font-medium">Billing</th>
              <th className="py-3 pr-4 font-medium">Period End</th>
              <th className="py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {loading ? (
              <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">Loading billing...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">No accounts found.</td></tr>
            ) : items.map((item) => {
              const account = item.account;
              const nextInvoice = item.nextInvoice || null;
              const livePlanTier = nextInvoice?.livePlan?.planTier || null;
              const planTierMismatch = Boolean(livePlanTier && account.plan_tier && livePlanTier !== account.plan_tier);
              const livePlanLabel = formatLiveStripePlan(nextInvoice);
              const stickerPrice = formatStickerPrice(nextInvoice);

              return (
                <tr key={account.id}>
                  <td className="py-3 pr-4">{account.name}</td>
                  <td className="py-3 pr-4">
                    <span className="capitalize flex items-center gap-1.5 whitespace-nowrap">
                      {account.plan_tier || "free"}
                      {planTierMismatch && (
                        <span
                          className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium normal-case text-destructive"
                          title={`Stripe shows "${livePlanTier}" but the account record shows "${account.plan_tier}" -- a sync may have been missed.`}
                        >
                          Mismatch vs Stripe
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      {livePlanLabel || <span className="text-muted-foreground">No active subscription</span>}
                      {nextInvoice?.discount && (
                        <span
                          className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                          title="A Stripe coupon is applied to this subscription"
                        >
                          Coupon
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-3 pr-4">{stickerPrice || <span className="text-muted-foreground">Unavailable</span>}</td>
                  <td className="py-3 pr-4">{account.subscription_status}</td>
                  <td className="py-3 pr-4 capitalize">{account.billing_interval || "none"}</td>
                  <td className="py-3 pr-4">{formatAdminDate(account.subscription_period_end)}</td>
                  <td className="py-3 text-right">
                    <Link to={`/admin/customers/${account.id}`}>
                      <Button variant="outline" size="sm">Details</Button>
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminBilling;
