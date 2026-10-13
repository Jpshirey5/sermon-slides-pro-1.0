import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Services from "./Services";

const mocks = vi.hoisted(() => ({
  listServices: vi.fn(),
  deleteService: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ profile: null, canUseEsv: false }) }));
vi.mock("@/lib/services", () => ({
  listServices: mocks.listServices,
  deleteService: mocks.deleteService,
  createService: vi.fn(),
}));

const renderPage = () => render(<MemoryRouter><Services /></MemoryRouter>);

describe("Services", () => {
  beforeEach(() => {
    mocks.listServices.mockReset().mockResolvedValue([
      { id: "a", title: "Sunday Service", serviceDate: "2026-10-18" },
      { id: "b", title: "Wednesday Night", serviceDate: null },
    ]);
    mocks.deleteService.mockReset().mockResolvedValue(undefined);
  });

  it("deletes a service only after confirming", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete Wednesday Night" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/can't be undone/)).toBeInTheDocument();
    expect(mocks.deleteService).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete service" }));
    await waitFor(() => expect(mocks.deleteService).toHaveBeenCalledWith("b"));
    await waitFor(() => expect(screen.queryByText("Wednesday Night")).not.toBeInTheDocument());
    expect(screen.getByText("Sunday Service")).toBeInTheDocument();
  });

  it("cancel keeps the service", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete Sunday Service" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(mocks.deleteService).not.toHaveBeenCalled();
    expect(screen.getByText("Sunday Service")).toBeInTheDocument();
  });
});
