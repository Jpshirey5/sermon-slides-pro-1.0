import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getDesktop } from "./bridge";
import { desktopRoute } from "./routes";

/**
 * In the desktop app, keeps people inside the app itself: website-only pages
 * redirect to sign-in (or the dashboard), and sign-up or legal pages open in
 * the browser. On the website this renders its children unchanged.
 */
export function DesktopGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user, loading } = useAuth();
  const isDesktop = Boolean(getDesktop());
  const decision = isDesktop && !loading ? desktopRoute(location.pathname, location.search, Boolean(user)) : null;

  useEffect(() => {
    if (decision?.kind === "browser") window.open(decision.url, "_blank", "noopener");
  }, [decision?.kind === "browser" ? decision.url : null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isDesktop) return <>{children}</>;
  // Don't flash a website page while we find out whether someone is signed in.
  if (loading) return location.pathname === "/" ? null : <>{children}</>;
  if (decision?.kind === "redirect") return <Navigate to={decision.to} replace />;
  if (decision?.kind === "browser") return <Navigate to={decision.then} replace />;
  return <>{children}</>;
}
