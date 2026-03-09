import { BookOpen, Heart } from "lucide-react";

const Footer = () => {
  return (
    <footer className="py-12 border-t border-border/70 bg-white/55 backdrop-blur-md">
      <div className="container mx-auto px-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg gradient-hero flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-serif text-xl font-semibold text-foreground">
              Sermon Slide Pro
            </span>
          </div>

          <p className="text-muted-foreground text-sm">
            © 2026 Sermon Slide Pro. All rights reserved.
          </p>

          <p className="text-muted-foreground text-sm flex items-center gap-1">
            Made with <Heart className="w-4 h-4 text-primary fill-primary" /> for ministry leaders
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
