import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { BookOpen } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="app-shell min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full glass-panel rounded-2xl p-8 text-center">
        <div className="w-12 h-12 rounded-xl gradient-hero flex items-center justify-center mx-auto mb-4">
          <BookOpen className="w-6 h-6 text-primary-foreground" />
        </div>
        <h1 className="font-serif text-4xl font-bold text-foreground mb-2">404</h1>
        <p className="text-muted-foreground mb-6">Page not found.</p>
        <a
          href="/"
          className="inline-flex items-center justify-center rounded-full px-5 h-11 bg-primary text-primary-foreground font-medium hover:opacity-90"
        >
          Return Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
