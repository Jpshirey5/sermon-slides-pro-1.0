import { describe, expect, it } from "vitest";
import { desktopRoute, WEBSITE_URL } from "./routes";

describe("desktop routes", () => {
  it("signed out: everything that isn't the app goes to the sign-in screen", () => {
    for (const path of ["/", "/create", "/create/review/abc", "/admin", "/admin/customers", "/signup/complete"]) {
      expect(desktopRoute(path, "", false)).toEqual({ kind: "redirect", to: "/login" });
    }
    expect(desktopRoute("/login", "", false)).toEqual({ kind: "allow" });
  });

  it("signed in: website-only pages and the sign-in screen go to the dashboard", () => {
    expect(desktopRoute("/", "", true)).toEqual({ kind: "redirect", to: "/dashboard" });
    expect(desktopRoute("/login", "", true)).toEqual({ kind: "redirect", to: "/dashboard" });
  });

  it("sign-up, password help, and legal pages open on the website", () => {
    expect(desktopRoute("/signup", "?plan=core", false)).toEqual({ kind: "browser", url: `${WEBSITE_URL}/signup?plan=core`, then: "/login" });
    expect(desktopRoute("/forgot-password", "", false)).toEqual({ kind: "browser", url: `${WEBSITE_URL}/forgot-password`, then: "/login" });
    expect(desktopRoute("/privacy-policy/", "", true)).toEqual({ kind: "browser", url: `${WEBSITE_URL}/privacy-policy`, then: "/dashboard" });
  });

  it("the app itself is allowed", () => {
    for (const path of ["/dashboard", "/dashboard/services", "/dashboard/services/abc", "/dashboard/songs", "/dashboard/create", "/editor/abc", "/account", "/signup-incomplete", "/checkout-redirect", "/present/abc/output", "/present/abc/stage"]) {
      expect(desktopRoute(path, "", true)).toEqual({ kind: "allow" });
    }
  });
});
