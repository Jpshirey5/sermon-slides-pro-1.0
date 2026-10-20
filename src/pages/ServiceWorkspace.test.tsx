import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { buildStageFrame, initialStageControls } from "@/presenter/core/stage";
import { initialPresenterState, presenterReducer } from "@/presenter/core/state";
import { makeBundle, scripture } from "@/presenter/core/test-fixtures";
import type { PresenterSession } from "@/presenter/ui/usePresenterSession";
import type { ServiceDetail } from "@/lib/services";
import ServiceWorkspace from "./ServiceWorkspace";

const mocks = vi.hoisted(() => ({
  session: null as unknown as PresenterSession,
  getService: vi.fn(),
  getEditorPresentationState: vi.fn(),
  saveEditorSlides: vi.fn(),
  uploadSlideImage: vi.fn(),
  addServiceItem: vi.fn(),
  updateServiceItem: vi.fn(),
  listSermonOptions: vi.fn(),
  saveAsTemplate: vi.fn(),
  recordSongUse: vi.fn(),
  setSongBackground: vi.fn(),
  uploadSongBackground: vi.fn(),
  getSong: vi.fn(),
}));

vi.mock("@/lib/songs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/songs")>();
  return {
    ...actual,
    recordSongUse: mocks.recordSongUse,
    setSongBackground: mocks.setSongBackground,
    uploadSongBackground: mocks.uploadSongBackground,
    getSong: mocks.getSong,
    listSongs: vi.fn(async () => []),
  };
});

vi.mock("@/lib/media", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/media")>();
  return { ...actual, uploadSlideImage: mocks.uploadSlideImage };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ canUseEsv: false }) }));
vi.mock("@/presenter/ui/usePresenterSession", () => ({ usePresenterSession: () => mocks.session }));
vi.mock("@/lib/presentations", () => ({
  getEditorPresentationState: mocks.getEditorPresentationState,
  saveEditorSlides: mocks.saveEditorSlides,
}));
vi.mock("@/lib/services", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services")>();
  return { ...actual, getService: mocks.getService, addServiceItem: mocks.addServiceItem, updateServiceItem: mocks.updateServiceItem, listSermonOptions: mocks.listSermonOptions, saveAsTemplate: mocks.saveAsTemplate };
});

const style = { background: "#000000", fontFamily: "Georgia", textColor: "#FFFFFF" };

function makeSession(over: Partial<PresenterSession> = {}): PresenterSession {
  const bundle = makeBundle();
  bundle.items[1].sermon_id = "ser1";
  bundle.items[1].slides = [
    { id: "t", kind: "title", title: "Anchored", style, source: { sermon_id: "ser1", slide_indexes: [0] } },
    { id: "p", kind: "point", title: "Hope is a person", style, notes: "Tell the story", source: { sermon_id: "ser1", slide_indexes: [1] } },
    scripture("niv-1", "NIV", { source: { sermon_id: "ser1", slide_indexes: [2] } }),
  ];
  const state = [{ type: "load" as const, bundle }, { type: "goToSlide" as const, item: 1, slide: 1 }].reduce(presenterReducer, initialPresenterState);
  return {
    load: { kind: "ready" },
    bundle,
    state,
    dispatch: vi.fn(),
    current: bundle.items[1].slides[1],
    next: bundle.items[1].slides[2],
    frame: { kind: "slide", slide: bundle.items[1].slides[1] },
    images: {},
    nonce: "n",
    projectorConnected: false,
    canPresent: true,
    fumsPending: 0,
    retry: vi.fn(),
    attachProjectorWindow: vi.fn(),
    stage: initialStageControls,
    stageFrame: buildStageFrame(state, initialStageControls),
    dispatchStage: vi.fn(),
    stageConnected: false,
    attachStageWindow: vi.fn(),
    reload: vi.fn(async () => true),
    usingOfflineCopy: false,
    windowClosed: vi.fn(),
    endSession: vi.fn(),
    videoUrls: {},
    videoStatus: null,
    sendVideo: vi.fn(),
    setLocalVideoPlayer: vi.fn(),
    reportLocalVideoStatus: vi.fn(),
    ...over,
  };
}

const service: ServiceDetail = {
  id: "svc",
  accountId: "acct",
  title: "Sunday",
  serviceDate: "2026-10-11",
  defaultTranslationId: "KJV",
  updatedAt: "",
  isTemplate: false,
  items: ["logo", "sermon", "empty", "reading", "blank"].map((id, i) => ({
    id, position: (i + 1) * 1000, type: (id === "reading" || id === "empty" ? "scripture" : id) as never, sermonId: id === "sermon" ? "ser1" : null, songId: null, mediaId: null, label: null, payload: {},
  })),
};

const renderWorkspace = () =>
  render(
    <MemoryRouter initialEntries={["/dashboard/services/svc"]}>
      <Routes>
        <Route path="/dashboard/services/:id" element={<ServiceWorkspace />} />
      </Routes>
    </MemoryRouter>,
  );

describe("ServiceWorkspace", () => {
  beforeEach(() => {
    mocks.session = makeSession();
    mocks.getService.mockReset().mockResolvedValue(structuredClone(service));
    mocks.getEditorPresentationState.mockReset();
    mocks.saveEditorSlides.mockReset().mockResolvedValue(undefined);
    mocks.listSermonOptions.mockReset().mockResolvedValue([]);
    mocks.addServiceItem.mockReset().mockResolvedValue(undefined);
    mocks.recordSongUse.mockReset().mockResolvedValue(undefined);
    mocks.updateServiceItem.mockReset().mockResolvedValue(undefined);
  });

  it("shows the order, every slide of the selected item, the main screen, and the stage display", async () => {
    renderWorkspace();
    const order = await screen.findByRole("navigation", { name: "Service order" });
    expect(within(order).getByText("Anchored")).toBeInTheDocument();
    expect(within(order).getByText("Reading")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Slide 1: Title" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Slide 2: Hope is a person" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "Slide 3: John 3:16 (NIV)" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Main screen" })).toBeInTheDocument();
    expect(screen.getByLabelText("Stage display")).toBeInTheDocument();
    expect(screen.getByLabelText("Has speaker notes")).toBeInTheDocument();
  });

  it("clicking a slide puts it on the main screen", async () => {
    renderWorkspace();
    fireEvent.click(await screen.findByRole("button", { name: "Slide 3: John 3:16 (NIV)" }));
    expect(mocks.session.dispatch).toHaveBeenCalledWith({ type: "goToSlide", item: 1, slide: 2 });
  });

  it("clicking another item shows its slides without changing what's live", async () => {
    renderWorkspace();
    const order = await screen.findByRole("navigation", { name: "Service order" });
    fireEvent.click(within(order).getByText("Reading"));
    expect(await screen.findByRole("button", { name: "Slide 1: John 3:16 (KJV)" })).toBeInTheDocument();
    expect(mocks.session.dispatch).not.toHaveBeenCalled();
  });

  it("double-clicking a sermon slide edits it and saves to the sermon", async () => {
    mocks.getEditorPresentationState.mockResolvedValue({
      editorSlides: [
        { id: "t", type: "title", content: { title: "Anchored" }, ...style },
        { id: "p", type: "point", content: { title: "Hope is a person", subtitle: "" }, ...style, notes: "Tell the story" },
        { id: "s", type: "scripture", content: { reference: "John 3:16 (NIV)" }, ...style },
      ],
    });
    renderWorkspace();
    fireEvent.doubleClick(await screen.findByRole("button", { name: "Slide 2: Hope is a person" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Speaker notes")).toHaveValue("Tell the story");
    fireEvent.change(within(dialog).getByLabelText("Point"), { target: { value: "Hope is a promise" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.saveEditorSlides).toHaveBeenCalled());
    const [sermonId, slides] = mocks.saveEditorSlides.mock.calls[0];
    expect(sermonId).toBe("ser1");
    expect(slides[1].content.title).toBe("Hope is a promise");
    expect(slides[0]).toEqual(expect.objectContaining({ id: "t" }));
    expect(mocks.session.reload).toHaveBeenCalled();
  });

  it("a scripture slide's edit dialog changes the reference, never the words", async () => {
    renderWorkspace();
    fireEvent.doubleClick(await screen.findByRole("button", { name: "Slide 3: John 3:16 (NIV)" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Scripture reference")).toHaveValue("John 3:16 (NIV)");
    expect(within(dialog).queryByLabelText("Point")).toBeNull();
    expect(within(dialog).getByText(/can't be retyped/)).toBeInTheDocument();
  });

  it("stage controls: layout, countdown, and the stage message", async () => {
    renderWorkspace();
    await screen.findByRole("navigation", { name: "Service order" });
    fireEvent.click(screen.getByRole("radio", { name: "Video" }));
    expect(mocks.session.dispatchStage).toHaveBeenCalledWith({ type: "setTemplate", template: "video" });
    fireEvent.click(screen.getByRole("button", { name: "+1m" }));
    expect(mocks.session.dispatchStage).toHaveBeenCalledWith({ type: "timerAdjust", seconds: 60 });
    fireEvent.change(screen.getByLabelText(/Message to stage/), { target: { value: "Wrap up" } });
    expect(mocks.session.dispatchStage).toHaveBeenCalledWith({ type: "setMessage", text: "Wrap up" });
  });

  it("main screen controls dispatch clear and next, with no logo button", async () => {
    renderWorkspace();
    await screen.findByRole("navigation", { name: "Service order" });
    const main = screen.getByRole("region", { name: "Main screen" });
    const buttons = within(main).getAllByRole("button").map((b) => b.textContent || b.getAttribute("aria-label"));
    expect(buttons).toEqual(["Previous slide", "Clear", "Show", "Next slide"]);
    fireEvent.click(within(main).getByRole("button", { name: "Clear" }));
    fireEvent.click(within(main).getByRole("button", { name: "Next slide" }));
    expect(mocks.session.dispatch).toHaveBeenCalledWith({ type: "toggleBlack" });
    expect(mocks.session.dispatch).toHaveBeenCalledWith({ type: "next" });
  });

  it("adds a sermon slide after the chosen slide and saves it to the sermon", async () => {
    mocks.getEditorPresentationState.mockResolvedValue({
      editorSlides: [
        { id: "t", type: "title", content: { title: "Anchored" }, ...style },
        { id: "p", type: "point", content: { title: "Hope is a person", subtitle: "" }, ...style },
        { id: "s", type: "scripture", content: { reference: "John 3:16 (NIV)" }, ...style },
      ],
    });
    renderWorkspace();
    fireEvent.keyDown(await screen.findByRole("button", { name: "Add slide" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Point" }));
    await waitFor(() => expect(mocks.saveEditorSlides).toHaveBeenCalled());
    const [sermonId, slides] = mocks.saveEditorSlides.mock.calls[0];
    expect(sermonId).toBe("ser1");
    expect(slides.map((s: { type: string }) => s.type)).toEqual(["title", "point", "scripture", "point"]);
  });

  it("shows video controls in the right column when a video is live", async () => {
    const video = { id: "v", kind: "video" as const, title: "Welcome video", style, video: { media_id: "m1", storage_path: "account/a/m1.mp4", duration_seconds: 90, loop: false, end_action: "hold" as const } };
    mocks.session = makeSession({ current: video, frame: { kind: "slide", slide: video } });
    renderWorkspace();
    const controls = await screen.findByRole("region", { name: "Video controls" });
    fireEvent.click(within(controls).getByRole("button", { name: "Play video" }));
    expect(mocks.session.sendVideo).toHaveBeenCalledWith({ action: "play" });
    expect(within(controls).getByText(/Playing in this preview/)).toBeInTheDocument();
  });

  it("shift-click selects a range, and a dropped picture becomes the background on every selected slide", async () => {
    mocks.uploadSlideImage.mockReset().mockResolvedValue("storage:presentation-backgrounds/acct/bg.png");
    mocks.getEditorPresentationState.mockResolvedValue({
      editorSlides: [
        { id: "t", type: "title", content: { title: "Anchored" }, ...style },
        { id: "p", type: "point", content: { title: "Hope is a person", subtitle: "" }, ...style },
        { id: "s", type: "scripture", content: { reference: "John 3:16 (NIV)" }, ...style },
      ],
    });
    renderWorkspace();
    fireEvent.click(await screen.findByRole("button", { name: "Slide 1: Title" }));
    fireEvent.click(screen.getByRole("button", { name: "Slide 3: John 3:16 (NIV)" }), { shiftKey: true });
    expect(screen.getByRole("status")).toHaveTextContent("3 slides selected");
    // Shift-click only selects; it doesn't change what's on the main screen.
    expect(mocks.session.dispatch).toHaveBeenCalledTimes(1);

    const file = new File(["x"], "bg.png", { type: "image/png" });
    const target = screen.getByRole("button", { name: "Slide 2: Hope is a person" }).parentElement!;
    fireEvent.drop(target, { dataTransfer: { files: [file], types: ["Files"] } });

    await waitFor(() => expect(mocks.saveEditorSlides).toHaveBeenCalledTimes(1));
    expect(mocks.uploadSlideImage).toHaveBeenCalledTimes(1);
    const [, slides] = mocks.saveEditorSlides.mock.calls[0];
    expect(slides.map((s: { backgroundImage?: string }) => s.backgroundImage)).toEqual([
      "storage:presentation-backgrounds/acct/bg.png",
      "storage:presentation-backgrounds/acct/bg.png",
      "storage:presentation-backgrounds/acct/bg.png",
    ]);
  });

  it("Add offers only a sermon, a song, or a blank slide", async () => {
    mocks.addServiceItem.mockReset().mockResolvedValue(undefined);
    renderWorkspace();
    await screen.findByRole("navigation", { name: "Service order" });
    fireEvent.keyDown(screen.getByRole("button", { name: /^Add$/ }), { key: "Enter" });
    const items = (await screen.findAllByRole("menuitem")).map((m) => m.textContent?.trim());
    expect(items).toEqual(["Sermon", "Song", "Blank slide"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Blank slide" }));
    await waitFor(() => expect(mocks.addServiceItem).toHaveBeenCalled());
    const [, item] = mocks.addServiceItem.mock.calls[0];
    expect(item.type).toBe("slides");
    expect(item.label).toBe("Blank slide");
    expect(item.payload.slides.map((s: { kind: string }) => s.kind)).toEqual(["blank"]);
  });

  it("renames a section from its menu, and an empty name goes back to the default", async () => {
    mocks.updateServiceItem.mockReset().mockResolvedValue(undefined);
    renderWorkspace();
    const order = await screen.findByRole("navigation", { name: "Service order" });
    fireEvent.doubleClick(within(order).getByText("Reading"));
    const box = screen.getByRole("textbox", { name: "Section name" });
    fireEvent.change(box, { target: { value: "Call to Worship" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(mocks.updateServiceItem).toHaveBeenCalledWith("reading", { label: "Call to Worship" }));

    fireEvent.doubleClick(within(order).getByText("Reading"));
    fireEvent.change(screen.getByRole("textbox", { name: "Section name" }), { target: { value: "  " } });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Section name" }), { key: "Enter" });
    await waitFor(() => expect(mocks.updateServiceItem).toHaveBeenCalledTimes(1));
  });

  it("an empty sermon section from a template asks you to choose a sermon, and fills that same section", async () => {
    const empty = mocks.session.bundle!.items.find((i) => i.id === "empty")!;
    Object.assign(empty, { type: "sermon", label: "Message", sermon_id: undefined, slides: [] });
    mocks.listSermonOptions.mockResolvedValue([{ id: "ser9", title: "Rooted", presentationDate: null }]);
    renderWorkspace();
    const order = await screen.findByRole("navigation", { name: "Service order" });
    fireEvent.click(within(order).getByText("Message"));
    expect(await screen.findByText("No sermon chosen yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Choose sermon" }));
    fireEvent.click(await screen.findByText("Rooted"));
    await waitFor(() => expect(mocks.updateServiceItem).toHaveBeenCalledWith("empty", { sermonId: "ser9" }));
    expect(mocks.addServiceItem).not.toHaveBeenCalled();
  });

  it("saves the service as a template", async () => {
    mocks.saveAsTemplate.mockReset().mockResolvedValue("tpl1");
    renderWorkspace();
    const order = await screen.findByRole("navigation", { name: "Service order" });
    fireEvent.click(within(order).getByRole("button", { name: "Save as template" }));
    const name = await screen.findByLabelText("Template name");
    fireEvent.change(name, { target: { value: "Sunday Morning" } });
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    await waitFor(() => expect(mocks.saveAsTemplate).toHaveBeenCalledWith("svc", "Sunday Morning"));
  });

  it("desktop: Main screen opens straight on the saved screen, and the Screens menu can open it too", async () => {
    const tv = { id: "2", label: "SAMSUNG", isPrimary: false, isCurrent: false, left: 1512, top: 0, width: 1920, height: 1080 };
    const openPresenterWindow = vi.fn(async () => true);
    window.sspDesktop = {
      isDesktop: true,
      openPresenterWindow,
      onPresenterClosed: () => () => undefined,
      listDisplays: vi.fn(async () => [tv]),
      screens: {
        get: vi.fn(async () => ({ displays: [tv], main: { saved: { id: "2", label: "SAMSUNG", width: 1920, height: 1080 }, connectedId: "2" }, stage: { saved: null, connectedId: null } })),
        set: vi.fn(),
        identify: vi.fn(),
        onChanged: () => () => undefined,
      },
      onMenuCommand: () => () => undefined,
      offlineCache: { available: vi.fn(async () => false) },
    } as unknown as NonNullable<typeof window.sspDesktop>;
    try {
      renderWorkspace();
      await screen.findByRole("navigation", { name: "Service order" });
      fireEvent.click(screen.getByRole("button", { name: /^Main screen$/ }));
      await waitFor(() => expect(openPresenterWindow).toHaveBeenCalledWith("main", expect.stringContaining("/output?channel="), "2"));
      expect(screen.queryByText("Which screen is the main screen?")).not.toBeInTheDocument();

      const detail = { kind: "main", handled: false };
      window.dispatchEvent(new CustomEvent("ssp:screen-command", { detail }));
      expect(detail.handled).toBe(true);
      await waitFor(() => expect(openPresenterWindow).toHaveBeenCalledTimes(2));
    } finally {
      delete window.sspDesktop;
    }
  });

  const makeSongSession = (over: Partial<PresenterSession> = {}) => {
    const session = makeSession();
    const item = session.bundle!.items.find((i) => i.id === "empty")!;
    Object.assign(item, {
      type: "song",
      label: "Morning Light",
      song_id: "song1",
      slides: [{ id: "l1", kind: "lyrics", text: "first verse", style }, { id: "l2", kind: "lyrics", text: "the chorus", style }],
    });
    const index = session.bundle!.items.indexOf(item);
    return { ...session, state: { ...session.state, mode: "live" as const, cursor: { item: index, slide: 0 } }, ...over };
  };

  it("CCLI: a song counts once when it's live on the main screen, not while rehearsing", async () => {
    mocks.session = makeSongSession({ projectorConnected: false });
    const { unmount } = renderWorkspace();
    await screen.findByRole("navigation", { name: "Service order" });
    expect(mocks.recordSongUse).not.toHaveBeenCalled();
    unmount();

    mocks.session = makeSongSession({ projectorConnected: true });
    renderWorkspace();
    await waitFor(() => expect(mocks.recordSongUse).toHaveBeenCalledWith("svc", "song1"));
    expect(mocks.recordSongUse).toHaveBeenCalledTimes(1);
  });

  it("dropping a picture on a song's slide sets that song's background", async () => {
    mocks.session = makeSongSession();
    mocks.uploadSongBackground.mockReset().mockResolvedValue("storage:presentation-backgrounds/account/a/sermons/songs/song1.png");
    mocks.setSongBackground.mockReset().mockResolvedValue(undefined);
    renderWorkspace();
    const order = await screen.findByRole("navigation", { name: "Service order" });
    fireEvent.click(within(order).getByText("Morning Light"));
    const slide = (await screen.findByRole("button", { name: /^Slide 2:/ })).parentElement!;
    fireEvent.drop(slide, { dataTransfer: { files: [new File(["x"], "bg.png", { type: "image/png" })], types: ["Files"] } });
    await waitFor(() =>
      expect(mocks.setSongBackground).toHaveBeenCalledWith("song1", { background: null, backgroundImage: "storage:presentation-backgrounds/account/a/sermons/songs/song1.png" }));
  });

  it("sets a song's arrangement for this service only", async () => {
    mocks.session = makeSongSession();
    mocks.getSong.mockReset().mockResolvedValue({
      id: "song1", title: "Morning Light", author: "", ccliSongNumber: "", copyright: "", source: "licensed", background: "", backgroundImage: null,
      sections: [{ id: "v1", label: "Verse 1", lyrics: "a" }, { id: "c", label: "Chorus", lyrics: "b" }, { id: "b", label: "Bridge", lyrics: "c" }],
      arrangement: ["v1", "c", "b", "c"],
    });
    renderWorkspace();
    const order = await screen.findByRole("navigation", { name: "Service order" });
    fireEvent.keyDown(within(order).getByRole("button", { name: "Morning Light options" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Arrangement for this service/ }));
    const dialog = await screen.findByRole("dialog", { name: "Arrangement for this service" });
    await within(dialog).findByLabelText("Remove Bridge from the order");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove Bridge from the order" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.updateServiceItem).toHaveBeenCalledWith("empty", { payload: { arrangement: ["v1", "c", "c"] } }));
  });

  it("explains a load failure with a retry", async () => {
    mocks.session = makeSession({ load: { kind: "error", error: "plan_required" }, bundle: null });
    renderWorkspace();
    expect(await screen.findByText(/Presenting needs an active plan/)).toBeInTheDocument();
  });
});
