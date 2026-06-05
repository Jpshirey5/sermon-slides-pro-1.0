import { useState } from "react";
import { Crown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLAN_FAMILIES, type BillingInterval, type SubscriptionPlanId } from "@/lib/subscriptionPlans";

interface SubscriptionPlanPickerProps {
  title: string;
  description: string;
  onSelectPlan: (planId: SubscriptionPlanId) => void;
  loadingPlanId?: SubscriptionPlanId | null;
  selectedPlanId?: SubscriptionPlanId | null;
  selectionMode?: "submit" | "pick";
}

const SubscriptionPlanPicker = ({
  title,
  description,
  onSelectPlan,
  loadingPlanId = null,
  selectedPlanId = null,
  selectionMode = "submit",
}: SubscriptionPlanPickerProps) => {
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly");

  const featureHighlights: Record<string, string> = {
    pro: "1 user • No watermark • Saved presentations • Weekly sermon workflow",
    team: "Up to 3 users • No watermark • Shared team workflow • Recurring collaboration",
    enterprise: "Up to 10 users • No watermark • Multi-role teams • Organization-wide workflow",
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl gradient-hero flex items-center justify-center mx-auto mb-4">
          <Crown className="w-7 h-7 text-primary-foreground" />
        </div>
        <h2 className="font-serif text-2xl font-bold text-foreground mb-2">{title}</h2>
        <p className="text-muted-foreground">{description}</p>
      </div>

      <div className="mx-auto max-w-md">
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
      </div>

      {billingInterval === "annual" && (
        <div className="mx-auto max-w-md rounded-full border border-primary/20 bg-white px-6 py-3 text-center shadow-soft">
          <p className="text-sm font-medium text-primary">Save 2 months with Annual Billing</p>
        </div>
      )}

      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        {PLAN_FAMILIES.map((family) => {
          const plan = billingInterval === "monthly" ? family.monthly : family.annual;
          const isFeatured = family.tier === "team";
          const isLoading = loadingPlanId === plan.id;
          const isSelected = selectedPlanId === plan.id;

          return (
            <div
              key={family.tier}
              className={`relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border p-5 transition-shadow ${
                isSelected
                  ? "border-2 border-primary bg-white shadow-elevated ring-2 ring-primary/15"
                  : isFeatured
                  ? "border-2 border-primary/70 bg-white/90 shadow-elevated"
                  : "border-border/70 bg-white/70"
              }`}
            >
              {isFeatured && (
                <div className="absolute right-0 top-0 rounded-bl-xl bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground">
                  Best Value
                </div>
              )}
              <div className="mb-5 flex min-h-[132px] flex-col gap-3">
                <div className="min-w-0">
                  <h3 className="font-serif text-xl font-semibold text-foreground">{family.planName}</h3>
                  <p className="text-sm text-foreground/80 mt-1">{family.audience}</p>
                  <p className="text-sm text-muted-foreground mt-1">{family.description}</p>
                  <p className="text-xs text-primary mt-2">{featureHighlights[family.tier]}</p>
                </div>
                {billingInterval === "annual" && family.annual.savingsCopy && (
                  <span className="inline-flex w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    {family.annual.savingsCopy}
                  </span>
                )}
              </div>

              <div className="mt-auto flex min-h-[154px] flex-col rounded-xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm font-medium text-foreground mb-2">{billingInterval === "monthly" ? "Monthly" : "Annual"}</p>
                <div className="mb-2 flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
                  <span className="text-4xl font-bold leading-none text-foreground">{plan.displayPrice}</span>
                  <span className="text-muted-foreground">{plan.intervalLabel}</span>
                </div>
                <p className="mb-4 text-sm text-muted-foreground">
                  {billingInterval === "annual" ? "Billed annually" : "Billed monthly"}
                </p>
                <Button
                  variant={selectionMode === "pick" && isSelected ? "outline" : "hero"}
                  className="w-full mt-auto"
                  size="lg"
                  disabled={Boolean(loadingPlanId)}
                  onClick={() => onSelectPlan(plan.id)}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    selectionMode === "pick" && isSelected ? "Selected" : "Select"
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SubscriptionPlanPicker;
