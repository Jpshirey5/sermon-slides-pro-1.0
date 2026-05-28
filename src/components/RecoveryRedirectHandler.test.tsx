import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RecoveryRedirectHandler from "./RecoveryRedirectHandler";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  pathname: "/",
  authCallback: null as ((event: string) => void) | null,
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mocks.navigate,
  useLocation: () => ({ pathname: mocks.pathname }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (event: string) => void) => {
        mocks.authCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  },
}));

const setUrl = (url: string) => window.history.replaceState({}, "", url);

describe("RecoveryRedirectHandler", () => {
  beforeEach(() => {
    mocks.navigate.mockClear();
    mocks.pathname = "/";
    mocks.authCallback = null;
    setUrl("/");
  });

  afterEach(cleanup);

  it("reroutes a token_hash recovery link that landed on the wrong route", () => {
    setUrl("/?token_hash=abc123&type=recovery");
    render(<RecoveryRedirectHandler />);

    expect(mocks.navigate).toHaveBeenCalledWith(
      { pathname: "/reset-password", search: "?token_hash=abc123&type=recovery", hash: "" },
      { replace: true, state: { fromRecoveryEvent: false } },
    );
  });

  it("reroutes an implicit-flow recovery link delivered in the hash", () => {
    setUrl("/#access_token=tok&refresh_token=ref&type=recovery");
    render(<RecoveryRedirectHandler />);

    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/reset-password" }),
      expect.objectContaining({ state: { fromRecoveryEvent: false } }),
    );
  });

  it("reroutes an expired-link bounce so the error can be shown", () => {
    setUrl("/?error=access_denied&error_code=otp_expired");
    render(<RecoveryRedirectHandler />);

    expect(mocks.navigate).toHaveBeenCalled();
  });

  it("does nothing on a normal route with no recovery markers", () => {
    setUrl("/dashboard");
    render(<RecoveryRedirectHandler />);

    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("does not redirect when already on /reset-password", () => {
    mocks.pathname = "/reset-password";
    setUrl("/reset-password?token_hash=abc123&type=recovery");
    render(<RecoveryRedirectHandler />);

    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("routes to /reset-password on a PASSWORD_RECOVERY auth event", () => {
    render(<RecoveryRedirectHandler />);
    mocks.authCallback?.("PASSWORD_RECOVERY");

    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/reset-password" }),
      expect.objectContaining({ state: { fromRecoveryEvent: true } }),
    );
  });
});
