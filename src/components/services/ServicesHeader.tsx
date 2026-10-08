import { Link } from "react-router-dom";
import { ArrowLeft, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ServicesHeaderProps {
  backTo: string;
  backLabel: string;
}

/** Same look as the dashboard header, with a single way back. */
export function ServicesHeader({ backTo, backLabel }: ServicesHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-white/65 backdrop-blur-md">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/dashboard" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
            <div className="w-8 h-8 rounded-lg gradient-hero flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-serif text-lg font-semibold text-foreground">Sermon Slide Pro</span>
          </Link>
          <Link to={backTo}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">{backLabel}</span>
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
