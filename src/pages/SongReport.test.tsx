import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SongReport from "./SongReport";

const mocks = vi.hoisted(() => ({ listSongUses: vi.fn(), deleteSongUse: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/songs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/songs")>();
  return { ...actual, listSongUses: mocks.listSongUses, deleteSongUse: mocks.deleteSongUse };
});

const base = { author: "Jane Writer", copyright: "2021", serviceId: "s1", serviceTitle: "Sunday" };

describe("SongReport", () => {
  beforeEach(() => {
    mocks.listSongUses.mockReset().mockResolvedValue([
      { ...base, id: "u1", usedOn: "2026-10-11", title: "Morning Light", ccliSongNumber: "1234567", source: "licensed" },
      { ...base, id: "u2", usedOn: "2026-10-04", title: "Morning Light", ccliSongNumber: "1234567", source: "licensed" },
      { ...base, id: "u3", usedOn: "2026-10-04", title: "Amazing Grace", ccliSongNumber: "", source: "public_domain" },
    ]);
    mocks.deleteSongUse.mockReset().mockResolvedValue(undefined);
  });

  it("shows licensed songs with their totals, keeps public domain separate, and can remove a use", async () => {
    render(<MemoryRouter><SongReport /></MemoryRouter>);
    const table = await screen.findByRole("table");
    const row = within(table).getByText("Morning Light").closest("tr")!;
    expect(within(row).getByText("1234567")).toBeInTheDocument();
    expect(within(row).getByText("2")).toBeInTheDocument();
    expect(within(table).queryByText("Amazing Grace")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Not reported to CCLI" })).toHaveTextContent("Amazing Grace");

    fireEvent.click(screen.getByRole("button", { name: "Remove Morning Light on 2026-10-04" }));
    await waitFor(() => expect(mocks.deleteSongUse).toHaveBeenCalledWith("u2"));
    await waitFor(() => expect(within(screen.getByRole("table")).getByText("Morning Light").closest("tr")!).toHaveTextContent(/Morning Light.*1234567.*1/));
  });
});
