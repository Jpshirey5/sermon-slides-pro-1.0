import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Services from "./Services";

const mocks = vi.hoisted(() => ({
  listServices: vi.fn(),
  deleteService: vi.fn(),
  listTemplates: vi.fn(),
  createServiceFromTemplate: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ profile: null, canUseEsv: false }) }));
vi.mock("@/lib/services", () => ({
  listServices: mocks.listServices,
  deleteService: mocks.deleteService,
  listTemplates: mocks.listTemplates,
  createServiceFromTemplate: mocks.createServiceFromTemplate,
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
    mocks.listTemplates.mockReset().mockResolvedValue([]);
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

  it("lists templates and starts a new service from one", async () => {
    mocks.listTemplates.mockResolvedValue([{ id: "tpl", title: "Sunday Morning", serviceDate: null, updatedAt: "", isTemplate: true }]);
    mocks.createServiceFromTemplate.mockReset().mockResolvedValue("new1");
    renderPage();
    const templates = await screen.findByRole("region", { name: "Templates" });
    fireEvent.click(within(templates).getByRole("button", { name: "Use" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Pick this week's sermon and songs next/)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "October 25" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    await waitFor(() => expect(mocks.createServiceFromTemplate).toHaveBeenCalledWith("tpl", expect.objectContaining({ title: "October 25" })));
  });
});
