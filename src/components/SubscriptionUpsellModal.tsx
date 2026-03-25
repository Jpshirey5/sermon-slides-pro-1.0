import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PLAN_FAMILIES, type SubscriptionPlanId } from "@/lib/subscriptionPlans";

interface SubscriptionUpsellModalProps {
  isOpen: boolean;
  onContinue: () => void;
  onSelectPlan: (planId: SubscriptionPlanId) => void;
}

export function SubscriptionUpsellModal({
  isOpen,
  onContinue,
  onSelectPlan,
}: SubscriptionUpsellModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onContinue()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Unlock unlimited sermon slide creation</DialogTitle>
          <DialogDescription>
            You just unlocked this sermon for export. Subscribe to Sermon Slide Pro for unlimited exports, saved presentations, and more flexibility each week.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 md:grid-cols-3">
          {PLAN_FAMILIES.map((family) => (
            <div key={family.tier} className="rounded-2xl border border-border/70 bg-white/70 p-4">
              <h3 className="font-serif text-lg font-semibold text-foreground">{family.planName}</h3>
              <p className="text-xs text-muted-foreground mt-1 mb-4">{family.description}</p>
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

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onContinue}>
            Maybe later
          </Button>
          <Button onClick={onContinue}>
            Continue to Export
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
