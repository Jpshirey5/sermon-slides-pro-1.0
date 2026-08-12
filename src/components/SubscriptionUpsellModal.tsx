import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PLAN_FAMILIES, type SubscriptionPlanId } from "@/lib/subscriptionPlans";

interface SubscriptionUpsellModalProps {
  isOpen: boolean;
  onDismiss: () => void;
  onSelectPlan: (planId: SubscriptionPlanId) => void;
}

export function SubscriptionUpsellModal({
  isOpen,
  onDismiss,
  onSelectPlan,
}: SubscriptionUpsellModalProps) {
  const featureHighlights: Record<string, string> = {
    core: "Up to 3 users • AI Quick Build • 25 shared generations/month",
    team: "Up to 10 users • Multi-campus • 150 shared generations/month",
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Your export is ready — want more?</DialogTitle>
          <DialogDescription>
            You just exported for free with the manual builder. Create an account on Core or Team to unlock AI Quick
            Build, saved presentations, and team collaboration.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 md:grid-cols-2">
          {PLAN_FAMILIES.map((family) => (
            <div key={family.tier} className="rounded-2xl border border-border/70 bg-white/70 p-4">
              <h3 className="font-serif text-lg font-semibold text-foreground">{family.planName}</h3>
              <p className="text-sm font-medium text-foreground/80 mt-1">
                {family.inviteCapacityLabel}
              </p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">{family.description}</p>
              <p className="text-xs text-primary mt-1 mb-4">{featureHighlights[family.tier]}</p>
              <div className="space-y-2">
                {[family.monthly, family.annual].map((plan) => (
                  <Button
                    key={plan.id}
                    variant={plan.interval === "monthly" ? "hero" : "outline"}
                    className="w-full justify-between"
                    onClick={() => onSelectPlan(plan.id)}
                  >
                    <span>{plan.label}</span>
                    <span>{plan.displayPrice}</span>
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onDismiss}>
            Maybe later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
