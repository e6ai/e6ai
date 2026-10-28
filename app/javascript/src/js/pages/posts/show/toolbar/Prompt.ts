import GenInfo from "@/pages/posts/show/gen_info";

/**
 * Prompt button on the post toolbar (e6ai).
 * The first click fetches the generation metadata and renders it; later clicks toggle the container.
 */
export default class ToolbarPrompt {

  /* ============================== */
  /* ===== Singleton pattern ====== */
  /* ============================== */

  private static _instance: ToolbarPrompt | null = null;
  public static get instance (): ToolbarPrompt {
    if (!ToolbarPrompt._instance)
      ToolbarPrompt._instance = new ToolbarPrompt();
    return ToolbarPrompt._instance;
  }


  /* ============================== */
  /* ======= Initialization ======= */
  /* ============================== */

  private buttons: JQuery<HTMLElement>;
  private container: JQuery<HTMLElement>;

  /** Whether the metadata fetch has already been started */
  private loaded = false;

  private constructor () {
    if (ToolbarPrompt._instance)
      throw new Error("ToolbarPrompt is a singleton class. Use ToolbarPrompt.instance to access the instance.");

    this.buttons = $(".ptbr-prompt-button");
    this.container = $("#gen-info-container");

    this.buttons.on("click", () => this.handleClick());
  }

  private handleClick (): void {
    if (this.loaded) {
      this.container.toggleClass("hidden");
      return;
    }

    this.loaded = true;
    this.buttons.attr("pending", "true");
    GenInfo.loadAndShow().catch((error) => {
      console.warn("GenInfo: Failed to extract metadata", error);
    }).finally(() => {
      this.buttons.attr("pending", "false");
    });
  }
}
