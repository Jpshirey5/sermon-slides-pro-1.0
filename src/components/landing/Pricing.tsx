import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, Zap, Users } from "lucide-react";
import { STRIPE_CONFIG } from "@/contexts/AuthContext";

const plans = [
  {
    name: "Pay Per Sermon",
    price: `$${STRIPE_CONFIG.payPerSermon.price}`,
    description: "Perfect for occasional use",
    icon: Zap,
    features: [
      "One-time payment per export",
      "Full editor access",
      "Export to PowerPoint",
      "Export to ProPresenter",
      "No account required",
    ],
    cta: "Get Started",
    variant: "outline" as const,
    popular: false,
    href: "/create",
  },
  {
    name: "Unlimited",
    price: `$${STRIPE_CONFIG.unlimited.price}`,
    period: "/month",
    description: "For churches & ministry teams",
    icon: Users,
    features: [
      "Unlimited exports",
      "Saved sermon library",
      "Team collaboration (up to 5 users)",
      "Shared templates & assets",
      "Priority support",
      "Custom backgrounds",
    ],
    cta: "Start Unlimited",
    variant: "hero" as const,
    popular: true,
    href: "/signup?plan=unlimited",
  },
];

const Pricing = () => {
  const navigate = useNavigate();

  return (
    <section id="pricing" className="py-24 gradient-warm">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-3xl mx-auto mb-16"
        >
          <span className="text-accent font-medium text-sm uppercase tracking-wider">
            Pricing
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mt-3 mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-lg text-muted-foreground">
            Pay only for what you need. No hidden fees.
          </p>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`relative p-8 rounded-2xl bg-card border ${
                plan.popular
                  ? "border-primary shadow-elevated scale-105"
                  : "border-border"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <div className="flex items-center gap-1.5 px-4 py-1.5 rounded-full gradient-gold text-accent-foreground text-sm font-medium shadow-glow">
                    <Sparkles className="w-4 h-4" />
                    Best Value
                  </div>
                </div>
              )}

              <div className="mb-6">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
                  plan.popular ? "gradient-hero" : "bg-secondary"
                }`}>
                  <plan.icon className={`w-6 h-6 ${plan.popular ? "text-white" : "text-primary"}`} />
                </div>
                <h3 className="font-serif text-2xl font-bold text-foreground mb-2">
                  {plan.name}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {plan.description}
                </p>
              </div>

              <div className="flex items-baseline gap-1 mb-8">
                <span className="font-serif text-5xl font-bold text-foreground">
                  {plan.price}
                </span>
                {plan.period && (
                  <span className="text-muted-foreground">{plan.period}</span>
                )}
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-primary" />
                    </div>
                    <span className="text-sm text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button 
                variant={plan.variant} 
                size="lg" 
                className="w-full"
                onClick={() => navigate(plan.href)}
              >
                {plan.cta}
              </Button>
            </motion.div>
          ))}
        </div>

        {/* Money Back Guarantee */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="text-center text-muted-foreground mt-12"
        >
          Secure payment powered by Stripe. Cancel anytime.
        </motion.p>
      </div>
    </section>
  );
};

export default Pricing;
