import { Crown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLAN_FAMILIES, type SubscriptionPlanId } from "@/lib/subscriptionPlans";

interface SubscriptionPlanPickerProps {
  title: string;
  description: string;
  onSelectPlan: (planId: SubscriptionPlanId) => void;
  loadingPlanId?: SubscriptionPlanId | null;
}

const SubscriptionPlanPicker = ({
  title,
  description,
  onSelectPlan,
  loadingPlanId = null,
}: SubscriptionPlanPickerProps) => {
  const featureHighlights: Record<string, string> = {
    pro: "1 user • Saved presentations • Weekly sermon workflow",
    team: "Up to 3 users • Shared team workflow • Recurring collaboration",
    enterprise: "Up to 10 users • Multi-role teams • Organization-wide workflow",
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

      <div className="grid gap-4">
        {PLAN_FAMILIES.map((family, index) => (
          <div
            key={family.tier}
            className={`rounded-2xl border p-6 transition-shadow ${
              index === 0 ? "border-primary/50 bg-white/80 shadow-elevated" : "border-border/70 bg-white/70"
            }`}
          >
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 className="font-serif text-xl font-semibold text-foreground">{family.planName}</h3>
                <p className="text-sm text-foreground/80 mt-1">{family.audience}</p>
                <p className="text-sm text-muted-foreground mt-1">{family.description}</p>
                <p className="text-xs text-primary mt-2">{featureHighlights[family.tier]}</p>
              </div>
              {family.annual.savingsCopy && (
                <span className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  {family.annual.savingsCopy}
                </span>
              )}
            </div>

            <div className={`grid gap-3 ${family.tier === "enterprise" ? "md:grid-cols-[minmax(0,1.15fr)_minmax(0,1.15fr)]" : "sm:grid-cols-2"}`}>
              {[family.monthly, family.annual].map((plan) => {
                const isLoading = loadingPlanId === plan.id;

                return (
                  <div key={plan.id} className="flex h-full flex-col rounded-xl border border-border/70 bg-background/70 p-4">
                    <p className="text-sm font-medium text-foreground mb-2">{plan.interval === "monthly" ? "Monthly" : "Annual"}</p>
                    <div className="flex items-baseline gap-1 mb-2">
                      <span className="text-3xl font-bold text-foreground">{plan.displayPrice}</span>
                      <span className="text-muted-foreground">{plan.intervalLabel}</span>
                    </div>
                    <Button
                      variant={plan.interval === "monthly" ? "hero" : "outline"}
                      className="w-full mt-auto"
                      size="lg"
                      disabled={Boolean(loadingPlanId)}
                      onClick={() => onSelectPlan(plan.id)}
                    >
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        "Select"
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SubscriptionPlanPicker;
