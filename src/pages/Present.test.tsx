import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { initialPresenterState, presenterReducer } from "@/presenter/core/state";
import { makeBundle } from "@/presenter/core/test-fixtures";
import type { PresenterSession } from "@/presenter/ui/usePresenterSession";
import Present from "./Present";

const mocks = vi.hoisted(() => ({ session: null as unknown as PresenterSession }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock("@/presenter/ui/usePresenterSession", () => ({ usePresenterSession: () => mocks.session }));

function session(over: Partial<PresenterSession> = {}): PresenterSession {
  const bundle = makeBundle({
    translations: {
      KJV: { id: "KJV", name: "King James Version", attribution: "KJV line", notice: "KJV full notice", is_public_domain: true },
    },
  });
  const state = [{ type: "load" as const, bundle }, { type: "goToItem" as const, item: 3 }].reduce(presenterReducer, initialPresenterState);
  return {
    load: { kind: "ready" },
    bundle,
    state,
    dispatch: vi.fn(),
    current: bundle.items[3].slides[0],
    next: bundle.items[4].slides[0],
    frame: { kind: "slide", slide: bundle.items[3].slides[0] },
    images: {},
    nonce: "n",
    projectorConnected: false,
    canPresent: true,
    fumsPending: 0,
    retry: vi.fn(),
    attachProjectorWindow: vi.fn(),
    endSession: vi.fn(),
    ...over,
  };
}

const renderPresent = () =>
  render(
    <MemoryRouter initialEntries={["/present/svc"]}>
      <Routes>
        <Route path="/present/:serviceId" element={<Present />} />
      </Routes>
    </MemoryRouter>,
  );

describe("Present (operator view)", () => {
  beforeEach(() => {
    mocks.session = session();
  });

  it("shows the service order, what is on the projector, and the controls", () => {
    renderPresent();
    const order = screen.getByRole("navigation", { name: "Service order" });
    expect(within(order).getAllByRole("button").map((b) => b.textContent)).toEqual([
      expect.stringContaining("Logo"),
      expect.stringContaining("Anchored"),
      expect.stringContaining("Nothing"),
      expect.stringContaining("Reading"),
      expect.stringContaining("Blank"),
      expect.stringContaining("Scripture credits"),
    ]);
    expect(within(order).getAllByRole("button")[2]).toBeDisabled();
    const onProjector = screen.getByRole("region", { name: "On the projector" });
    expect(within(onProjector).getByText("Text of kjv-1")).toBeInTheDocument();
    expect(within(onProjector).getByText("KJV notice")).toBeInTheDocument();
    expect(screen.getByText("Projector not open")).toBeInTheDocument();
  });

  it("buttons dispatch presenter actions", () => {
    renderPresent();
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    fireEvent.click(screen.getByRole("button", { name: /Black/ }));
    fireEvent.click(within(screen.getByRole("navigation", { name: "Service order" })).getAllByRole("button")[1]);
    expect(mocks.session.dispatch).toHaveBeenCalledWith({ type: "next" });
    expect(mocks.session.dispatch).toHaveBeenCalledWith({ type: "toggleBlack" });
    expect(mocks.session.dispatch).toHaveBeenCalledWith({ type: "goToItem", item: 1 });
  });

  it("the full copyright notices are one click away", () => {
    renderPresent();
    fireEvent.click(screen.getByRole("button", { name: "Copyright notices" }));
    expect(screen.getByText("KJV full notice")).toBeInTheDocument();
  });

  it("explains a missing slide and that the projector shows black", () => {
    const missing = { id: "m", kind: "missing" as const, missing_reason: "revoked", style: { background: "#000", fontFamily: "Georgia", textColor: "#fff" } };
    mocks.session = session({ current: missing, frame: { kind: "black" } });
    renderPresent();
    expect(screen.getByText(/This translation is no longer available/, { selector: "p.rounded-md" })).toBeInTheDocument();
  });

  it("shows plain errors with a retry when the service cannot load", () => {
    mocks.session = session({ load: { kind: "error", error: "plan_required" }, bundle: null });
    renderPresent();
    expect(screen.getByText(/Presenting needs an active plan/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.session.retry).toHaveBeenCalled();
  });

  it("flags offline, unpaid plan, and waiting reports without stopping the service", () => {
    mocks.session = session({ canPresent: false, fumsPending: 3, projectorConnected: true });
    renderPresent();
    expect(screen.getByText("Plan not active")).toBeInTheDocument();
    expect(screen.getByText("3 reports waiting")).toBeInTheDocument();
    expect(screen.getByText("Projector connected")).toBeInTheDocument();
  });
});
