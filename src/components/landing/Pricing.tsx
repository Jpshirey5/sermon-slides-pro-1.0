import { motion } from "framer-motion";
import { Check, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const Pricing = () => {
  return (
    <section id="pricing" className="py-24 bg-background">
      <div className="container mx-auto px-4">
        {/* Header */}
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

        {/* Single Pricing Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="max-w-md mx-auto"
        >
          <div className="relative rounded-3xl bg-card border-2 border-primary overflow-hidden shadow-elevated">
            {/* Popular Badge */}
            <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-semibold px-4 py-1 rounded-bl-xl">
              Simple & Fair
            </div>

            <div className="p-8">
              {/* Icon */}
              <div className="w-14 h-14 rounded-2xl gradient-hero flex items-center justify-center mb-6 shadow-glow">
                <Zap className="w-7 h-7 text-primary-foreground" />
              </div>

              {/* Plan Info */}
              <h3 className="font-serif text-2xl font-semibold text-foreground mb-2">
                Pay Per Export
              </h3>
              <p className="text-muted-foreground mb-6">
                One-time payment per presentation
              </p>

              {/* Price */}
              <div className="flex items-baseline gap-1 mb-8">
                <span className="text-5xl font-bold text-foreground">$9</span>
                <span className="text-muted-foreground">/export</span>
              </div>

              {/* Features */}
              <ul className="space-y-4 mb-8">
                {[
                  "Create unlimited slides for free",
                  "Full editor access",
                  "Auto scripture lookup",
                  "Export to PowerPoint (.pptx)",
                  "Export to ProPresenter 6 & 7",
                  "No account required",
                  "No subscription needed",
                ].map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-primary" />
                    </div>
                    <span className="text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Link to="/create">
                <Button variant="hero" className="w-full" size="lg">
                  Get Started Free
                </Button>
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default Pricing;
