import { act, cleanup, render } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  IDLE_TIMEOUT_MS,
  STORAGE_FORCED_LOGOUT_KEY,
  STORAGE_LAST_ACTIVITY_KEY,
  STORAGE_LOGOUT_REASON_KEY,
} from "@/lib/session-security";
import SessionTimeoutManager from "./SessionTimeoutManager";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  signOut: vi.fn(),
  pathname: "/dashboard",
  user: { id: "user-1" },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: mocks.user,
    signOut: mocks.signOut,
  }),
}));

vi.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: mocks.pathname }),
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => (
    open ? <div>{children}</div> : null
  ),
  AlertDialogAction: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

describe("SessionTimeoutManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T12:00:00.000Z"));
    localStorage.clear();
    mocks.navigate.mockClear();
    mocks.signOut.mockClear();
    mocks.signOut.mockResolvedValue(undefined);
    mocks.pathname = "/dashboard";
    mocks.user = { id: "user-1" };
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("resets stale stored activity when a user becomes authenticated", () => {
    const now = Date.now();
    localStorage.setItem(STORAGE_LAST_ACTIVITY_KEY, String(now - IDLE_TIMEOUT_MS - 1));
    localStorage.setItem(STORAGE_FORCED_LOGOUT_KEY, String(now - IDLE_TIMEOUT_MS - 1));

    render(<SessionTimeoutManager />);

    expect(localStorage.getItem(STORAGE_LAST_ACTIVITY_KEY)).toBe(String(now));
    expect(localStorage.getItem(STORAGE_FORCED_LOGOUT_KEY)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("signs out for inactivity after the authenticated session idles past the timeout", async () => {
    const startTime = Date.now();
    render(<SessionTimeoutManager />);

    await act(async () => {
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS + 1000);
      await Promise.resolve();
    });

    expect(mocks.signOut).toHaveBeenCalledWith({ userInitiated: false });
    expect(mocks.navigate).toHaveBeenCalledWith(
      "/login?reason=inactive",
      { replace: true, state: { from: "/dashboard" } },
    );
    expect(localStorage.getItem(STORAGE_LOGOUT_REASON_KEY)).toBe("inactive");
    expect(Number(localStorage.getItem(STORAGE_FORCED_LOGOUT_KEY))).toBeGreaterThanOrEqual(startTime + IDLE_TIMEOUT_MS);
  });

  it("signs out when another tab broadcasts an inactivity logout", async () => {
    render(<SessionTimeoutManager />);

    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", {
        key: STORAGE_FORCED_LOGOUT_KEY,
        newValue: String(Date.now()),
      }));
      await Promise.resolve();
    });

    expect(mocks.signOut).toHaveBeenCalledWith({ userInitiated: false });
    expect(mocks.navigate).toHaveBeenCalledWith(
      "/login?reason=inactive",
      { replace: true, state: { from: "/dashboard" } },
    );
    expect(localStorage.getItem(STORAGE_LOGOUT_REASON_KEY)).toBe("inactive");
  });
});
