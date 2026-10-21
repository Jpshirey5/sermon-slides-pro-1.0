import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ScreenSetup, SspDesktop } from "./bridge";
import { DesktopScreens } from "./DesktopScreens";
import { ScreenSetupDialog } from "./ScreenSetupDialog";

const toast = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast }));

const display = (id: string, label: string, isCurrent = false) => ({ id, label, isPrimary: isCurrent, isCurrent, left: 0, top: 0, width: 1920, height: 1080 });

function fakeDesktop(setup: ScreenSetup) {
  let menu: ((command: string) => void) | null = null;
  const desktop = {
    screens: {
      get: vi.fn(async () => setup),
      set: vi.fn(async () => setup),
      identify: vi.fn(async () => undefined),
      onChanged: vi.fn(() => () => undefined),
    },
    onMenuCommand: vi.fn((cb: (command: string) => void) => {
      menu = cb;
      return () => undefined;
    }),
  } as unknown as SspDesktop;
  return { desktop, menu: (command: string) => menu?.(command) };
}

describe("Set up screens", () => {
  it("shows the saved screens and warns when one isn't plugged in", async () => {
    const { desktop } = fakeDesktop({
      displays: [display("1", "Built-in Retina Display", true), display("2", "SAMSUNG")],
      main: { saved: { id: "2", label: "SAMSUNG", width: 1920, height: 1080 }, connectedId: "2" },
      stage: { saved: { id: "7", label: "LG TV", width: 1920, height: 1080 }, connectedId: null },
    });
    render(<ScreenSetupDialog desktop={desktop} open onClose={() => undefined} />);
    expect(await screen.findByText(/Saved as LG TV, which isn't plugged in/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Main screen" })).toHaveTextContent("SAMSUNG");
    fireEvent.click(screen.getByRole("button", { name: /Identify screens/ }));
    expect(desktop.screens.identify).toHaveBeenCalled();
  });

  it("explains mirroring when only one screen is found", async () => {
    const { desktop } = fakeDesktop({ displays: [display("1", "Built-in", true)], main: { saved: null, connectedId: null }, stage: { saved: null, connectedId: null } });
    render(<ScreenSetupDialog desktop={desktop} open onClose={() => undefined} />);
    expect(await screen.findByText(/extend the displays, not mirror them/)).toBeInTheDocument();
  });

  it("the Screens menu opens setup, and Open Main Screen asks for a service when none is open", async () => {
    const { desktop, menu } = fakeDesktop({ displays: [], main: { saved: null, connectedId: null }, stage: { saved: null, connectedId: null } });
    render(<DesktopScreens desktop={desktop} />);
    menu("screens:open-main");
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/Open a service first/));
    menu("screens:setup");
    expect(await screen.findByRole("dialog", { name: "Set up screens" })).toBeInTheDocument();
    await waitFor(() => expect(desktop.screens.get).toHaveBeenCalled());
  });
});
