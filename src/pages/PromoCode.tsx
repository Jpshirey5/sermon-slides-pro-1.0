import { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, BookOpen } from "lucide-react";

export default function PromoCode() {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://js-na2.hsforms.net/forms/embed/246327823.js";
    script.defer = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return (
    <div className="app-shell flex flex-col">
      <header className="border-b border-border/60 bg-white/65 backdrop-blur-md">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link
              to="/"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="hidden sm:inline">Back to Home</span>
            </Link>
            <Link to="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
              <div className="w-8 h-8 rounded-lg gradient-hero flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-serif text-lg font-semibold text-foreground">
                Sermon Slide Pro
              </span>
            </Link>
            <div className="w-20" />
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-10 sm:py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-3xl"
        >
          <div className="rounded-2xl glass-panel p-6 sm:p-8 shadow-elevated">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-serif text-3xl font-bold text-foreground sm:text-4xl">
                Get Your Discount Code
              </h2>
              <p className="mt-2 text-muted-foreground">
                Tell us a bit about yourself and we&apos;ll send you a discount code for Sermon Slide Pro.
              </p>
            </div>

            <div className="mx-auto mt-10 max-w-2xl">
              <div
                className="hs-form-frame"
                data-region="na2"
                data-form-id="2cd1168a-a5c2-477b-bb85-5a3a674588f2"
                data-portal-id="246327823"
              />
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
