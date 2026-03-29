import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Menu, X, BookOpen } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import GetStartedModal from "@/components/GetStartedModal";

const Header = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const { user } = useAuth();

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="fixed top-4 left-0 right-0 z-50"
    >
      <div className="mx-auto max-w-6xl px-4">
        <div className="glass-panel rounded-full px-3 sm:px-5 flex items-center justify-between h-14 border border-border/75 shadow-elevated">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full gradient-hero flex items-center justify-center shadow-glow">
              <BookOpen className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-serif text-base md:text-lg font-semibold text-foreground">Sermon Slide Pro</span>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</a>
            <a href="#testimonials" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Testimonials</a>
            <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
            <Link to="/contact" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Contact</Link>
            <Link to="/trust-center" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Trust Center</Link>
          </nav>

          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <>
                <Link to="/dashboard"><Button variant="outline">Dashboard</Button></Link>
                <Link to="/account"><Button variant="ghost">Account</Button></Link>
              </>
            ) : (
              <>
                <Button variant="hero" onClick={() => setModalOpen(true)}>Get Started</Button>
                <Link to="/login"><Button variant="outline">Log In</Button></Link>
              </>
            )}
          </div>

          <button className="md:hidden p-2" onClick={() => setIsOpen(!isOpen)} aria-label="Toggle menu">
            {isOpen ? <X className="w-6 h-6 text-foreground" /> : <Menu className="w-6 h-6 text-foreground" />}
          </button>
        </div>

        {isOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="md:hidden mt-2 glass-panel rounded-2xl py-4 px-4 border border-border/60">
            <nav className="flex flex-col gap-4">
              <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors" onClick={() => setIsOpen(false)}>Features</a>
              <a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors" onClick={() => setIsOpen(false)}>Pricing</a>
              <a href="#testimonials" className="text-muted-foreground hover:text-foreground transition-colors" onClick={() => setIsOpen(false)}>Testimonials</a>
              <Link to="/trust-center" className="text-muted-foreground hover:text-foreground transition-colors" onClick={() => setIsOpen(false)}>Trust Center</Link>
              <Link to="/contact" className="text-muted-foreground hover:text-foreground transition-colors" onClick={() => setIsOpen(false)}>Contact</Link>
              <div className="flex flex-col gap-2 pt-4 border-t border-border">
                {user ? (
                  <>
                    <Link to="/dashboard" onClick={() => setIsOpen(false)}><Button variant="hero" className="w-full">Dashboard</Button></Link>
                    <Link to="/account" onClick={() => setIsOpen(false)}><Button variant="outline" className="w-full">Account</Button></Link>
                  </>
                ) : (
                  <>
                    <Button
                      variant="hero"
                      className="w-full"
                      onClick={() => {
                        setIsOpen(false);
                        setModalOpen(true);
                      }}
                    >
                      Get Started
                    </Button>
                    <Link to="/login" onClick={() => setIsOpen(false)}><Button variant="outline" className="w-full">Log In</Button></Link>
                  </>
                )}
              </div>
            </nav>
          </motion.div>
        )}
      </div>
      <GetStartedModal open={modalOpen} onOpenChange={setModalOpen} />
    </motion.header>
  );
};

export default Header;
