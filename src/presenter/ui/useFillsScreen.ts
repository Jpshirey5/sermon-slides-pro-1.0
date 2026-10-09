import { useEffect, useState } from "react";

/**
 * True when the window already covers its whole screen: browser full screen,
 * or the desktop app's native full-screen presenter windows. Used to hide the
 * "Go full screen" hint where it no longer applies.
 */
export function fillsScreen(): boolean {
  if (typeof window === "undefined") return false;
  if (document.fullscreenElement) return true;
  return window.innerWidth >= window.screen.width - 1 && window.innerHeight >= window.screen.height - 1;
}

export function useFillsScreen(): boolean {
  const [fills, setFills] = useState(fillsScreen);
  useEffect(() => {
    const update = () => setFills(fillsScreen());
    window.addEventListener("resize", update);
    document.addEventListener("fullscreenchange", update);
    return () => {
      window.removeEventListener("resize", update);
      document.removeEventListener("fullscreenchange", update);
    };
  }, []);
  return fills;
}
