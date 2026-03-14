import { motion } from "framer-motion";
import { Check, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { SUBSCRIPTION_PLANS } from "@/lib/subscriptionPlans";

const Pricing = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleGoPro = (priceId?: string) => {
    if (user) {
      const params = new URLSearchParams({ startCheckout: "pro" });
      if (priceId) params.set("priceId", priceId);
      navigate(`/account?${params.toString()}`);
      return;
    }

      const params = new URLSearchParams({ plan: "pro" });
      if (priceId) params.set("priceId", priceId);
      navigate(`/signup?${params.toString()}`);
  };

  return (
    <section id="pricing" className="py-24">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-3xl mx-auto mb-16"
        >
          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-lg text-muted-foreground">
            Create and edit your slides for free. Pay only when you're ready to export.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="max-w-6xl mx-auto grid md:grid-cols-3 gap-6"
        >
          {/* Pay Per Export */}
          <div className="relative rounded-3xl glass-panel overflow-hidden">
            <div className="p-8 flex h-full flex-col">
              <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mb-6">
                <Zap className="w-7 h-7 text-foreground" />
              </div>
              <h3 className="font-serif text-2xl font-semibold text-foreground mb-2">Pay Per Export</h3>
              <p className="text-muted-foreground mb-6">One-time payment per presentation</p>
              <div className="flex items-baseline gap-1 mb-8">
                <span className="text-5xl font-bold text-foreground">$9</span>
                <span className="text-muted-foreground">/export</span>
              </div>
              <ul className="space-y-4 mb-8">
                {["Create unlimited slides for free", "Full editor access", "Auto scripture lookup", "Export to PowerPoint (.pptx)", "Export to ProPresenter 6 & 7", "No account required"].map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-primary" />
                    </div>
                    <span className="text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
              <Link to="/create" className="mt-auto block">
                <Button variant="outline" className="w-full" size="lg">Get Started Free</Button>
              </Link>
            </div>
          </div>

          {/* Monthly Subscription */}
          <div className="relative z-10 rounded-3xl glass-panel border-2 border-primary/70 overflow-hidden shadow-elevated md:-translate-y-4 md:shadow-[0_30px_80px_-20px_rgba(0,0,0,0.55)]">
            <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-semibold px-4 py-1 rounded-bl-xl">Best Value</div>
            <div className="p-8 flex h-full flex-col">
              <div className="w-14 h-14 rounded-2xl gradient-hero flex items-center justify-center mb-6 shadow-glow">
                <Zap className="w-7 h-7 text-primary-foreground" />
              </div>
              <h3 className="font-serif text-2xl font-semibold text-foreground mb-2">Pro Monthly</h3>
              <p className="text-muted-foreground mb-6">Unlimited access, billed monthly</p>
              <div className="flex items-baseline gap-1 mb-8">
                <span className="text-5xl font-bold text-foreground">{SUBSCRIPTION_PLANS.month.displayPrice}</span>
                <span className="text-muted-foreground">{SUBSCRIPTION_PLANS.month.intervalLabel}</span>
              </div>
              <ul className="space-y-4 mb-8">
                {["Everything in Pay Per Export", "Account Creation Required", "Unlimited exports", "Personal dashboard", "Saved presentations"].map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-primary" />
                    </div>
                    <span className="text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
              <Button variant="hero" className="w-full mt-auto" size="lg" onClick={() => handleGoPro(SUBSCRIPTION_PLANS.month.priceId)}>
                Go Pro — {SUBSCRIPTION_PLANS.month.displayPrice}{SUBSCRIPTION_PLANS.month.intervalLabel}
              </Button>
            </div>
          </div>

          {/* Yearly Subscription */}
          <div className="relative rounded-3xl glass-panel border-2 border-primary/60 overflow-hidden shadow-elevated">
            <div className="p-8 flex h-full flex-col">
              <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mb-6">
                <Zap className="w-7 h-7 text-foreground" />
              </div>
              <h3 className="font-serif text-2xl font-semibold text-foreground mb-2">Pro Yearly</h3>
              <p className="text-muted-foreground mb-6">Unlimited access, billed annually</p>
              <div className="flex items-baseline gap-1 mb-8">
                <span className="text-5xl font-bold text-foreground">{SUBSCRIPTION_PLANS.year.displayPrice}</span>
                <span className="text-muted-foreground">{SUBSCRIPTION_PLANS.year.intervalLabel}</span>
              </div>
              <ul className="space-y-4 mb-8">
                {["Everything in Pro Monthly", "Priority support", "2 months free vs monthly billing", "Simplified annual budgeting"].map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-primary" />
                    </div>
                    <span className="text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="w-full mt-auto" size="lg" onClick={() => handleGoPro(SUBSCRIPTION_PLANS.year.priceId)}>
                Go Pro — {SUBSCRIPTION_PLANS.year.displayPrice}{SUBSCRIPTION_PLANS.year.intervalLabel}
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default Pricing;
