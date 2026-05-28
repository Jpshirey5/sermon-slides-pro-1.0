import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ResetPassword from "./ResetPassword";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  searchParams: new URLSearchParams(),
  state: null as unknown,
  verifyOtp: vi.fn(),
  setSession: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mocks.navigate,
  useLocation: () => ({ state: mocks.state, pathname: "/reset-password" }),
  useSearchParams: () => [mocks.searchParams],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      verifyOtp: (...args: unknown[]) => mocks.verifyOtp(...args),
      setSession: (...args: unknown[]) => mocks.setSession(...args),
      exchangeCodeForSession: (...args: unknown[]) => mocks.exchangeCodeForSession(...args),
      updateUser: vi.fn(),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));

vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => mocks.toastError(...a), success: vi.fn() } }));
vi.mock("framer-motion", () => ({
  motion: { div: ({ children }: { children: React.ReactNode }) => <div>{children}</div> },
}));
vi.mock("@/components/auth/PasswordInput", () => ({
  default: (props: Record<string, unknown>) => <input {...props} />,
}));
vi.mock("@/components/auth/PasswordRequirements", () => ({ default: () => null }));

const setHash = (hash: string) => window.history.replaceState({}, "", `/reset-password${hash}`);

describe("ResetPassword recovery gate", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => typeof m === "function" && (m as { mockClear?: () => void }).mockClear?.());
    mocks.searchParams = new URLSearchParams();
    mocks.state = null;
    mocks.verifyOtp.mockResolvedValue({ error: null });
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    setHash("");
  });

  afterEach(cleanup);

  it("shows an expired message and a retry path when the link bounced as otp_expired", async () => {
    mocks.searchParams = new URLSearchParams("error=access_denied&error_code=otp_expired");
    render(<ResetPassword />);

    expect(await screen.findByText(/Request New Link/i)).toBeInTheDocument();
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringMatching(/expired/i));
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("blocks the form when there is no recovery context at all", async () => {
    render(<ResetPassword />);
    expect(await screen.findByText(/Invalid or expired reset link/i)).toBeInTheDocument();
  });

  it("unlocks the form via verifyOtp for a token_hash link", async () => {
    mocks.searchParams = new URLSearchParams("token_hash=abc123&type=recovery");
    render(<ResetPassword />);

    expect(await screen.findByText(/Set New Password/i)).toBeInTheDocument();
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "abc123", type: "recovery" });
  });

  it("unlocks the form via exchangeCodeForSession for a PKCE ?code= link", async () => {
    mocks.searchParams = new URLSearchParams("code=pkce-code");
    render(<ResetPassword />);

    expect(await screen.findByText(/Set New Password/i)).toBeInTheDocument();
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("pkce-code");
  });

  it("keeps the form blocked when verifyOtp rejects an expired token", async () => {
    mocks.searchParams = new URLSearchParams("token_hash=stale&type=recovery");
    mocks.verifyOtp.mockResolvedValue({ error: { message: "Token has expired" } });
    render(<ResetPassword />);

    expect(await screen.findByText(/Invalid or expired reset link/i)).toBeInTheDocument();
  });
});
