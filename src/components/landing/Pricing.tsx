import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Zap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Pricing = () => {
  const navigate = useNavigate();
  const [proLoading, setProLoading] = useState(false);

  const handleGoPro = async () => {
    setProLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-guest-checkout", {
        body: { origin: window.location.origin },
      });
      if (error || !data?.url) {
        toast.error("Could not start checkout.");
      } else {
        window.location.href = data.url;
      }
    } catch {
      toast.error("An error occurred.");
    } finally {
      setProLoading(false);
    }
  };

  return (
    <section id="pricing" className="py-24 bg-background">
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
          className="max-w-4xl mx-auto grid md:grid-cols-2 gap-6"
        >
          {/* Pay Per Export */}
          <div className="relative rounded-3xl bg-card border border-border overflow-hidden shadow-soft">
            <div className="p-8">
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
              <Link to="/create">
                <Button variant="outline" className="w-full" size="lg">Get Started Free</Button>
              </Link>
            </div>
          </div>

          {/* Monthly Subscription */}
          <div className="relative rounded-3xl bg-card border-2 border-primary overflow-hidden shadow-elevated">
            <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-semibold px-4 py-1 rounded-bl-xl">Best Value</div>
            <div className="p-8">
              <div className="w-14 h-14 rounded-2xl gradient-hero flex items-center justify-center mb-6 shadow-glow">
                <Zap className="w-7 h-7 text-primary-foreground" />
              </div>
              <h3 className="font-serif text-2xl font-semibold text-foreground mb-2">Pro Monthly</h3>
              <p className="text-muted-foreground mb-6">Unlimited access for your ministry</p>
              <div className="flex items-baseline gap-1 mb-8">
                <span className="text-5xl font-bold text-foreground">$30</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <ul className="space-y-4 mb-8">
                {["Everything in Pay Per Export", "Unlimited exports", "Personal dashboard", "Saved presentations", "Manuscript Study Guide Generator", "Conference & Training Builder"].map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-primary" />
                    </div>
                    <span className="text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
              <Button variant="hero" className="w-full" size="lg" onClick={handleGoPro} disabled={proLoading}>
                {proLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Starting Checkout...</>
                ) : "Go Pro — $30/month"}
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default Pricing;
