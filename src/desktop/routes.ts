// What the desktop app may show. The desktop app is for signed-in churches
// running their services; signing up, pricing, and the marketing site live on
// the website. Pure functions so the rules are easy to test.

/** The public website, for pages the desktop app sends to the browser. */
export const WEBSITE_URL = "https://www.sermonslidepro.com";

/** Website pages that open in the person's browser instead of the app. */
const OPEN_IN_BROWSER = new Set([
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/contact",
  "/privacy-policy",
  "/terms-and-conditions",
  "/trust-center",
  "/invite-signup",
]);

/** Pages that never show in the desktop app (marketing, guest builder, admin). */
function isWebsiteOnly(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/create" ||
    pathname.startsWith("/create/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/signup/complete" ||
    pathname === "/auth/confirm" ||
    pathname === "/auth/confirm-email-change" ||
    pathname === "/handoff/complete"
  );
}

export type DesktopRouteDecision =
  | { kind: "allow" }
  /** Show this app route instead. */
  | { kind: "redirect"; to: string }
  /** Open this website page in the browser, then show `then` in the app. */
  | { kind: "browser"; url: string; then: string };

export function desktopRoute(pathname: string, search: string, signedIn: boolean): DesktopRouteDecision {
  const path = pathname.replace(/\/+$/, "") || "/";
  const home = signedIn ? "/dashboard" : "/login";
  if (OPEN_IN_BROWSER.has(path)) return { kind: "browser", url: `${WEBSITE_URL}${path}${search}`, then: home };
  if (isWebsiteOnly(path)) return { kind: "redirect", to: home };
  if (path === "/login" && signedIn) return { kind: "redirect", to: "/dashboard" };
  return { kind: "allow" };
}
