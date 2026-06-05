import { useState } from "react";
import { motion } from "framer-motion";
import { Check, ChevronsUp, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { PLAN_FAMILIES, type BillingInterval } from "@/lib/subscriptionPlans";

type TierFeatures = {
  inheritsFromLabel?: string;
  items: readonly string[];
};

const FEATURES_BY_TIER: Record<"pro" | "team" | "enterprise", TierFeatures> = {
  pro: {
    items: [
      "1 user",
      "AI Quick Builder — 5 builds/month",
      "Unlimited presentation creation",
      "Unlimited PowerPoint and ProPresenter exports",
      "No watermark — clean, unbranded slides on every export",
      "Saved presentations and editing history",
      "Scripture lookup and weekly sermon workflow",
      "Best for solo pastors and ministry leaders",
    ],
  },
  team: {
    inheritsFromLabel: "Everything in Pro, plus:",
    items: [
      "Up to 3 users",
      "AI Quick Builder — 15 builds/month",
      "Shared account for pastors, worship leaders, and staff",
      "Best for small church teams",
    ],
  },
  enterprise: {
    inheritsFromLabel: "Everything in Team, plus:",
    items: [
      "Up to 10 users",
      "AI Quick Builder — Unlimited builds/month",
      "Built for larger ministries and multi-role teams",
      "Built to support multi-campus teams",
      "Best for growing churches and larger teams",
    ],
  },
};

const Pricing = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly");

  const handleUpgrade = (priceId?: string) => {
    if (user) {
      const params = new URLSearchParams({ startCheckout: "pro" });
      if (priceId) params.set("priceId", priceId);
      navigate(`/account?${params.toString()}`);
      return;
    }

    const params = new URLSearchParams();
    if (priceId) params.set("priceId", priceId);
    navigate(`/signup${params.toString() ? `?${params.toString()}` : ""}`);
  };

  return (
    <section id="pricing" className="py-24">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-3xl mx-auto mb-12"
        >
          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-lg text-muted-foreground">
            Subscribe to unlock unlimited exports, saved presentations, and the right collaboration access for your team.
            Pro and higher remove the watermark for clean, unbranded slides on every export.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="max-w-md mx-auto mb-10"
        >
          <div
            className="inline-flex w-full rounded-full border border-border/70 bg-white/80 p-1 shadow-soft"
            role="tablist"
            aria-label="Billing interval"
          >
            {([
              { value: "monthly", label: "Monthly" },
              { value: "annual", label: "Annual" },
            ] as const).map((option) => {
              const active = billingInterval === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setBillingInterval(option.value)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </motion.div>

        {billingInterval === "annual" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="max-w-md mx-auto mb-10"
          >
            <div className="rounded-full border border-primary/20 bg-white px-6 py-3 text-center shadow-soft">
              <p className="text-sm font-medium text-primary">Save 2 months with Annual Billing</p>
            </div>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="max-w-6xl mx-auto grid gap-6 lg:grid-cols-3"
        >
          {PLAN_FAMILIES.map((family) => {
            const plan = billingInterval === "monthly" ? family.monthly : family.annual;
            const isFeatured = family.tier === "team";
            const features = FEATURES_BY_TIER[family.tier];

            return (
              <div
                key={family.tier}
                className={`relative rounded-3xl glass-panel overflow-hidden ${
                  isFeatured ? "border-2 border-primary/70 shadow-elevated" : "border border-border/60"
                }`}
              >
                {isFeatured && (
                  <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-semibold px-4 py-1 rounded-bl-xl">
                    Most Popular
                  </div>
                )}

                <div className="p-8 flex h-full flex-col">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 ${isFeatured ? "gradient-hero shadow-glow" : "bg-secondary"}`}>
                    <Crown className={`w-7 h-7 ${isFeatured ? "text-primary-foreground" : "text-foreground"}`} />
                  </div>
                  <h3 className="font-serif text-2xl font-semibold text-foreground mb-2">{family.planName}</h3>
                  <p className="text-sm text-muted-foreground mb-6">{plan.audience}</p>

                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-5xl font-bold text-foreground">{plan.displayPrice}</span>
                    <span className="text-muted-foreground">{plan.intervalLabel}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-6">
                    {plan.interval === "annual" ? "Billed annually" : "Billed monthly"}
                  </p>

                  {features.inheritsFromLabel && (
                    <div className="mb-5 flex items-center gap-2 rounded-2xl bg-primary/10 px-4 py-3">
                      <ChevronsUp className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold text-primary">
                        {features.inheritsFromLabel}
                      </span>
                    </div>
                  )}

                  <ul className="space-y-4 mb-8">
                    {features.items.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-start gap-3">
                        <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Check className="w-3 h-3 text-primary" />
                        </div>
                        <span className="text-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    variant={isFeatured ? "hero" : "outline"}
                    className="w-full mt-auto"
                    size="lg"
                    onClick={() => handleUpgrade(plan.priceId)}
                  >
                    {plan.label} - {plan.displayPrice}{plan.intervalLabel}
                  </Button>
                </div>
              </div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
};

export default Pricing;
