import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";
import GetStartedModal from "@/components/GetStartedModal";

const CTA = () => {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 gradient-warm opacity-95" />
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
      </div>

      {/* Floating Elements */}
      <motion.div
        animate={{ y: [0, -20, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-1/4 left-[5%] w-24 h-24 rounded-full bg-accent/20 blur-2xl"
      />
      <motion.div
        animate={{ y: [0, 20, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-1/4 right-[10%] w-32 h-32 rounded-full bg-primary/20 blur-2xl"
      />

      <div className="container mx-auto px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-3xl mx-auto glass-panel rounded-2xl p-10 md:p-14"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card/85 border border-border/70 mb-8">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">
              Create and edit slides for free
            </span>
          </div>

          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mb-6">
            Ready to Transform Your Sermon Preparation?
          </h2>

          <p className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto">
            Create beautiful sermon slides in minutes. 
            Pay only $9 when you're ready to export.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button variant="gold" size="xl" onClick={() => setModalOpen(true)}>
              Get Started Free
              <ArrowRight className="w-5 h-5" />
            </Button>
            <Link to="/login">
              <Button variant="outline" size="xl">
                Login
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>

      <GetStartedModal open={modalOpen} onOpenChange={setModalOpen} />
    </section>
  );
};

export default CTA;
