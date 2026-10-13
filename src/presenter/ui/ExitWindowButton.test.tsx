import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ExitWindowButton } from "./ExitWindowButton";

describe("ExitWindowButton", () => {
  afterEach(() => vi.useRealTimers());

  it("stays hidden until the mouse moves, then hides again", () => {
    vi.useFakeTimers();
    render(<ExitWindowButton label="Close main screen" />);
    const button = screen.getByRole("button", { name: "Close main screen" });
    expect(button.className).toContain("opacity-0");
    fireEvent.mouseMove(window);
    expect(button.className).toContain("opacity-100");
    act(() => vi.advanceTimersByTime(3000));
    expect(button.className).toContain("opacity-0");
  });

  it("closes the window", async () => {
    const close = vi.spyOn(window, "close").mockImplementation(() => undefined);
    render(<ExitWindowButton label="Close stage display" />);
    fireEvent.mouseMove(window);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Close stage display" })));
    expect(close).toHaveBeenCalled();
  });
});
