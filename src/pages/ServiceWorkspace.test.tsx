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
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ canUseEsv: false }) }));
vi.mock("@/presenter/ui/usePresenterSession", () => ({ usePresenterSession: () => mocks.session }));
vi.mock("@/lib/presentations", () => ({
  getEditorPresentationState: mocks.getEditorPresentationState,
  saveEditorSlides: mocks.saveEditorSlides,
}));
vi.mock("@/lib/services", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services")>();
  return { ...actual, getService: mocks.getService, listSermonOptions: vi.fn().mockResolvedValue([]) };
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

  it("main screen controls dispatch black, logo, and next", async () => {
    renderWorkspace();
    await screen.findByRole("navigation", { name: "Service order" });
    const main = screen.getByRole("region", { name: "Main screen" });
    const buttons = within(main).getAllByRole("button").map((b) => b.textContent || b.getAttribute("aria-label"));
    expect(buttons).toEqual(["Previous slide", "Logo", "Clear", "Show", "Next slide"]);
    fireEvent.click(within(main).getByRole("button", { name: "Clear" }));
    fireEvent.click(within(main).getByRole("button", { name: "Logo" }));
    fireEvent.click(within(main).getByRole("button", { name: "Next slide" }));
    expect(mocks.session.dispatch).toHaveBeenCalledWith({ type: "toggleBlack" });
    expect(mocks.session.dispatch).toHaveBeenCalledWith({ type: "toggleLogo" });
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

  it("explains a load failure with a retry", async () => {
    mocks.session = makeSession({ load: { kind: "error", error: "plan_required" }, bundle: null });
    renderWorkspace();
    expect(await screen.findByText(/Presenting needs an active plan/)).toBeInTheDocument();
  });
});
