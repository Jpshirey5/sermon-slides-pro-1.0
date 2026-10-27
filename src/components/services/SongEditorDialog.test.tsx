import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SongEditorDialog } from "./SongEditorDialog";

const mocks = vi.hoisted(() => ({ saveSong: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/songs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/songs")>();
  return { ...actual, saveSong: mocks.saveSong, getSong: vi.fn(), getChurchCcliLicense: vi.fn(async () => "7654321") };
});

const FILE = `Morning Light Is Rising

Verse 1
Morning light is rising

Chorus
Sing it out

Verse 2
Evening falls in mercy

Chorus
Sing it out

CCLI Song # 1234567
Jane Writer | Sam Composer
© 2021 Example Songs
For use solely with the SongSelect® Terms of Use. All rights reserved. www.ccli.com
CCLI License # 7654321
`;

describe("SongEditorDialog import", () => {
  beforeEach(() => mocks.saveSong.mockReset().mockResolvedValue("song1"));

  it("a SongSelect file fills in the song, its sections, and the arrangement", async () => {
    render(<SongEditorDialog open songId={null} onSaved={() => undefined} onClose={() => undefined} />);
    const input = await screen.findByLabelText("SongSelect lyrics file");
    fireEvent.change(input, { target: { files: [new File([FILE], "MorningLight.txt", { type: "text/plain" })] } });
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Morning Light Is Rising"));
    expect(screen.getByLabelText("Author")).toHaveValue("Jane Writer, Sam Composer");
    expect(screen.getByLabelText("CCLI song number")).toHaveValue("1234567");
    expect(screen.getByLabelText("Verse 2 lyrics")).toHaveValue("Evening falls in mercy");

    fireEvent.click(screen.getByRole("button", { name: "Save song" }));
    await waitFor(() => expect(mocks.saveSong).toHaveBeenCalled());
    const saved = mocks.saveSong.mock.calls[0][0];
    const label = (id: string) => saved.sections.find((s: { id: string }) => s.id === id).label;
    expect(saved.arrangement.map(label)).toEqual(["Verse 1", "Chorus", "Verse 2", "Chorus"]);
  });

  it("saves the song's text style", async () => {
    render(<SongEditorDialog open songId={null} onSaved={() => undefined} onClose={() => undefined} />);
    fireEvent.change(await screen.findByLabelText("Title"), { target: { value: "Morning Light" } });
    fireEvent.change(screen.getByLabelText("Verse 1 lyrics"), { target: { value: "words" } });
    fireEvent.change(screen.getByLabelText("Text color"), { target: { value: "#ffee00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save song" }));
    await waitFor(() => expect(mocks.saveSong).toHaveBeenCalled());
    expect(mocks.saveSong.mock.calls[0][0].textStyle).toEqual({ textColor: "#ffee00" });
  });

  it("pasting a whole song replaces the sections", async () => {
    render(<SongEditorDialog open songId={null} onSaved={() => undefined} onClose={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: /Paste whole song/ }));
    fireEvent.change(screen.getByLabelText("Paste the whole song"), { target: { value: "Verse 1\nfirst\n\nBridge\nlast" } });
    fireEvent.click(screen.getByRole("button", { name: "Use these lyrics" }));
    expect(await screen.findByLabelText("Bridge lyrics")).toHaveValue("last");
    expect(screen.queryByLabelText("Chorus lyrics")).not.toBeInTheDocument();
  });
});
