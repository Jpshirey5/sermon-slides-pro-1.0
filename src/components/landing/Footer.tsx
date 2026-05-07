import { Link } from "react-router-dom";
import { BookOpen } from "lucide-react";

const Footer = () => {
  return (
    <footer className="py-12 border-t border-border/70 bg-white/55 backdrop-blur-md">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg gradient-hero flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-serif text-xl font-semibold text-foreground">
                Sermon Slide Pro
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
              <Link to="/terms-and-conditions" className="text-muted-foreground hover:text-foreground hover:underline">
                Terms and Conditions
              </Link>
              <Link to="/privacy-policy" className="text-muted-foreground hover:text-foreground hover:underline">
                Privacy Policy
              </Link>
            </div>
          </div>

          <p className="text-muted-foreground text-sm">
            © 2026 Sermon Slide Pro. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
