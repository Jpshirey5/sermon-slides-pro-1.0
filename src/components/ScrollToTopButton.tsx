import { useEffect, useState } from "react";
import { ChevronUp } from "lucide-react";

const SHOW_AFTER_PX = 240;

const ScrollToTopButton = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > SHOW_AFTER_PX);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full gradient-hero text-primary-foreground shadow-elevated hover:shadow-glow transition-all"
    >
      <ChevronUp className="w-5 h-5 mx-auto" />
    </button>
  );
};

export default ScrollToTopButton;
