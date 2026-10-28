import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flush, loadToolbar, renderToolbarPage } from "./fixtures";

vi.mock("@/core/hotkeys", () => ({ default: { register: vi.fn() } }));
vi.mock("@/utility/Page", () => ({ default: { matches: () => true } }));
vi.mock("@/models/CurrentPost", () => ({ default: { exists: true, id: 123, vote: vi.fn() } }));
vi.mock("@/models/Favorite", () => ({ default: { create: vi.fn(), destroy: vi.fn() } }));
vi.mock("@/pages/posts/show/notes", () => ({ default: { enabled: false } }));
vi.mock("@/utility/Toast", () => ({ default: { track: vi.fn(), dismiss: vi.fn(), notice: vi.fn(), alert: vi.fn() } }));

const genInfo = { loadAndShow: vi.fn<() => Promise<boolean>>() };
vi.mock("@/pages/posts/show/gen_info", () => ({ default: genInfo }));

describe("ToolbarPrompt", () => {
  beforeEach(() => {
    genInfo.loadAndShow.mockReset();
    genInfo.loadAndShow.mockResolvedValue(true);
    renderToolbarPage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is exposed on the toolbar singleton", async () => {
    const PostsShowToolbar = await loadToolbar();
    const ToolbarPrompt = (await import("@/pages/posts/show/toolbar/Prompt")).default;
    expect(PostsShowToolbar.Prompt).toBe(ToolbarPrompt.instance);
  });

  it("loads the metadata on first click and marks the buttons pending", async () => {
    await loadToolbar();
    const buttons = $(".ptbr-prompt-button");
    expect(buttons.length).toBe(2);

    buttons.first().trigger("click");
    expect(genInfo.loadAndShow).toHaveBeenCalledTimes(1);
    expect(buttons.first().attr("pending")).toBe("true");
    expect(buttons.last().attr("pending")).toBe("true");

    await flush();
    expect(buttons.first().attr("pending")).toBe("false");
    expect(buttons.last().attr("pending")).toBe("false");
  });

  it("toggles the container on later clicks instead of reloading", async () => {
    await loadToolbar();
    const container = $("#gen-info-container");

    $(".ptbr-prompt-button").first().trigger("click");
    await flush();
    expect(container.hasClass("hidden")).toBe(false);

    $(".ptbr-prompt-button").last().trigger("click");
    expect(container.hasClass("hidden")).toBe(true);
    expect(genInfo.loadAndShow).toHaveBeenCalledTimes(1);

    $(".ptbr-prompt-button").first().trigger("click");
    expect(container.hasClass("hidden")).toBe(false);
    expect(genInfo.loadAndShow).toHaveBeenCalledTimes(1);
  });

  it("clears the pending state when loading fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    genInfo.loadAndShow.mockRejectedValue(new Error("nope"));
    await loadToolbar();

    $(".ptbr-prompt-button").first().trigger("click");
    await flush();

    expect(warn).toHaveBeenCalled();
    expect($(".ptbr-prompt-button").first().attr("pending")).toBe("false");
  });
});
