import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ServiceBuilder from "./ServiceBuilder";
import type { ServiceDetail } from "@/lib/services";

const service: ServiceDetail = {
  id: "svc-1",
  accountId: "acct",
  title: "Sunday Service",
  serviceDate: "2026-10-11",
  defaultTranslationId: "NIV",
  updatedAt: "2026-10-08T00:00:00Z",
  items: [
    { id: "i1", position: 1000, type: "logo", sermonId: null, label: null, payload: {} },
    { id: "i2", position: 2000, type: "sermon", sermonId: "s1", label: null, payload: {} },
    {
      id: "i3",
      position: 3000,
      type: "scripture",
      sermonId: null,
      label: null,
      payload: { passages: [{ book: "PSA", chapter: 23, verse_start: 1, verse_end: 6 }], translation_id: null, layout: "verse_by_verse" },
    },
  ],
};

const mocks = vi.hoisted(() => ({
  getService: vi.fn(),
  reorderServiceItems: vi.fn(),
  addServiceItem: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ canUseEsv: false }) }));
vi.mock("@/lib/services", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services")>();
  return {
    ...actual,
    getService: mocks.getService,
    listSermonOptions: vi.fn().mockResolvedValue([{ id: "s1", title: "Anchored", presentationDate: null }]),
    reorderServiceItems: mocks.reorderServiceItems,
    addServiceItem: mocks.addServiceItem,
  };
});

const renderBuilder = () =>
  render(
    <MemoryRouter initialEntries={["/dashboard/services/svc-1"]}>
      <Routes>
        <Route path="/dashboard/services/:id" element={<ServiceBuilder />} />
        <Route path="/present/:id" element={<p>presenter opened</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe("ServiceBuilder", () => {
  beforeEach(() => {
    mocks.getService.mockReset().mockResolvedValue(structuredClone(service));
    mocks.reorderServiceItems.mockReset().mockResolvedValue(undefined);
    mocks.addServiceItem.mockReset().mockResolvedValue(undefined);
  });

  it("shows the order with plain descriptions", async () => {
    renderBuilder();
    expect(await screen.findByText("Shows your church logo")).toBeInTheDocument();
    expect(await screen.findByText("Anchored")).toBeInTheDocument();
    expect(screen.getByText("Psalm 23:1-6")).toBeInTheDocument();
    expect(screen.getByText("Scripture · NIV · one verse per slide")).toBeInTheDocument();
  });

  it("moving an item down sends the whole new order", async () => {
    renderBuilder();
    await screen.findByText("Shows your church logo");
    fireEvent.click(screen.getAllByRole("button", { name: "Move down" })[0]);
    await waitFor(() => expect(mocks.reorderServiceItems).toHaveBeenCalledWith("svc-1", ["i2", "i1", "i3"]));
  });

  it("the first item cannot move up and the last cannot move down", async () => {
    renderBuilder();
    await screen.findByText("Shows your church logo");
    expect(screen.getAllByRole("button", { name: "Move up" })[0]).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Move down" })[2]).toBeDisabled();
  });

  it("a reading with an unreadable reference cannot be saved", async () => {
    renderBuilder();
    await screen.findByText("Shows your church logo");
    fireEvent.click(screen.getByRole("button", { name: /Reading/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("References"), { target: { value: "John 3:16; Hezekiah 4:1" } });
    expect(within(dialog).getByText(/We could not read: Hezekiah 4:1/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Add" })).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText("References"), { target: { value: "John 3:16-18; Romans 8:28" } });
    expect(within(dialog).getByText("John 3:16-18; Romans 8:28", { selector: "p" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(mocks.addServiceItem).toHaveBeenCalled());
    const [, item] = mocks.addServiceItem.mock.calls[0];
    expect(item).toEqual({
      type: "scripture",
      payload: {
        passages: [
          { book: "JHN", chapter: 3, verse_start: 16, verse_end: 18 },
          { book: "ROM", chapter: 8, verse_start: 28, verse_end: 28 },
        ],
        translation_id: null,
        layout: "passage",
      },
    });
    expect(JSON.stringify(item)).not.toMatch(/text/i);
  });

  it("Present opens the presenter for this service", async () => {
    renderBuilder();
    await screen.findByText("Shows your church logo");
    fireEvent.click(screen.getByRole("button", { name: /Present/ }));
    expect(await screen.findByText("presenter opened")).toBeInTheDocument();
  });

  it("explains when the service cannot be found", async () => {
    mocks.getService.mockResolvedValue(null);
    renderBuilder();
    expect(await screen.findByText("We could not find that service.")).toBeInTheDocument();
  });
});
