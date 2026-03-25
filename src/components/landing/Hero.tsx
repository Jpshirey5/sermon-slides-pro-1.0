import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";
import heroImage from "@/assets/hero-church.jpg";
import GetStartedModal from "@/components/GetStartedModal";

const Hero = () => {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-24 pb-16 grid-noise">
      <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent" />
      
      <motion.div
        animate={{ y: [0, -15, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-24 left-[10%] w-28 h-28 rounded-full bg-accent/20 blur-2xl"
      />
      <motion.div
        animate={{ y: [0, 15, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-1/3 right-[15%] w-36 h-36 rounded-full bg-primary/20 blur-2xl"
      />

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card/90 border border-border/70 mb-8 shadow-soft"
          >
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-accent-foreground">
              Trusted by 1,000+ ministry leaders
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-serif font-bold text-foreground leading-[1.05] tracking-tight mb-6"
          >
            Turn Sermon Notes Into{" "}
            <span className="text-gradient">Broadcast-Ready Slides</span>{" "}
            Faster
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto mb-10"
          >
            A polished workspace for ministry teams. Generate, edit, and export
            sermon presentations to PowerPoint and ProPresenter with a clean,
            modern flow.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Button variant="hero" size="xl" onClick={() => setModalOpen(true)}>
              Get Started Free
              <ArrowRight className="w-5 h-5" />
            </Button>
            <Link to="/login">
              <Button variant="outline" size="xl">
                Login
              </Button>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-16 pt-8 border-t border-border/60"
          >
            <p className="text-sm text-muted-foreground mb-6">
              Trusted by churches worldwide
            </p>
            <div className="flex flex-wrap items-center justify-center gap-8 opacity-60">
              {["Bell Shoals Church", "First Baptist of Brandon", "Fellowship Church", "New Life Fellowship"].map((church, i) => (
                <span key={i} className="font-serif text-lg text-foreground/70">
                  {church}
                </span>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Preview Image */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4 }}
          className="mt-16 max-w-5xl mx-auto"
        >
          <div className="relative rounded-3xl overflow-hidden shadow-elevated border border-white/70 glass-panel">
            <img
              src={heroImage}
              alt="Sermon presentation preview"
              className="w-full aspect-video object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent flex items-end justify-center pb-8">
              <div className="text-center">
                <h3 className="font-serif text-2xl font-semibold text-foreground mb-2">
                  Beautiful Sermon Presentations
                </h3>
                <p className="text-muted-foreground">
                  Ready for PowerPoint & ProPresenter
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <GetStartedModal open={modalOpen} onOpenChange={setModalOpen} />
    </section>
  );
};

export default Hero;
