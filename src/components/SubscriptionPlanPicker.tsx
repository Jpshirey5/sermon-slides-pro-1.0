import { Crown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SUBSCRIPTION_PLAN_LIST, type BillingInterval } from "@/lib/subscriptionPlans";

interface SubscriptionPlanPickerProps {
  title: string;
  description: string;
  onSelectPlan: (interval: BillingInterval) => void;
  loadingInterval?: BillingInterval | null;
}

const SubscriptionPlanPicker = ({
  title,
  description,
  onSelectPlan,
  loadingInterval = null,
}: SubscriptionPlanPickerProps) => {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl gradient-hero flex items-center justify-center mx-auto mb-4">
          <Crown className="w-7 h-7 text-primary-foreground" />
        </div>
        <h2 className="font-serif text-2xl font-bold text-foreground mb-2">{title}</h2>
        <p className="text-muted-foreground">{description}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {SUBSCRIPTION_PLAN_LIST.map((plan) => {
          const isLoading = loadingInterval === plan.id;

          return (
            <div
              key={plan.id}
              className={`rounded-2xl border p-6 text-center transition-shadow ${
                plan.id === "month"
                  ? "border-primary/70 bg-white/80 shadow-elevated"
                  : "border-border/70 bg-white/70"
              }`}
            >
              <h3 className="font-serif text-xl font-semibold text-foreground mb-2">{plan.label}</h3>
              <div className="flex items-baseline justify-center gap-1 mb-4">
                <span className="text-4xl font-bold text-foreground">{plan.displayPrice}</span>
                <span className="text-muted-foreground">{plan.intervalLabel}</span>
              </div>
              <Button
                variant={plan.id === "month" ? "hero" : "outline"}
                className="w-full"
                size="lg"
                disabled={Boolean(loadingInterval)}
                onClick={() => onSelectPlan(plan.id)}
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : plan.label}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SubscriptionPlanPicker;
