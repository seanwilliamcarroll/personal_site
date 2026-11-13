// The life of a demo embedded in a post: everything that isn't the demo
// itself. A demo supplies a factory (a canvas in, a `frame` function
// out); this decides when it starts, runs, pauses and is torn down.
//
// - Starts when scrolled into view: nothing is fetched for a reader who
//   never reaches it.
// - Runs only while on screen, in a visible tab, and not paused by the
//   reader. With "reduce motion" set, it starts paused.
// - The site navigates without reloading (<ClientRouter />), so every
//   demo is disposed before a page is swapped out and mounted again on
//   arrival: nothing keeps running, or leaks, across pages.
// - Colours come from the site's theme and follow it when it changes.
// - A failure replaces the canvas with a message, not a blank box.

/** The theme's colours, as CSS colour strings. */
export interface Palette {
  background: string;
  foreground: string;
  accent: string;
  muted: string;
  border: string;
}

/** What a frame is drawn with. `width` and `height` are the canvas's
 *  size in device pixels; `dpr` is device pixels per CSS pixel. */
export interface FrameInfo {
  colors: Palette;
  width: number;
  height: number;
  dpr: number;
}

/** A running demo. */
export interface Demo {
  /** Advance by `elapsedSeconds` (0 when only a redraw is wanted: a
   *  theme change while paused) and draw. */
  frame(elapsedSeconds: number, info: FrameInfo): void;
  /** Release what was taken (wasm memory, listeners). */
  dispose?(): void;
}

/** Makes a demo for a canvas; may load things first. */
export type DemoFactory = (canvas: HTMLCanvasElement) => Demo | Promise<Demo>;

/** Where a mount is in its life (the element's `data-demo-state`). */
export type DemoState = "idle" | "loading" | "running" | "paused" | "failed";

/** The longest step a frame reports, s: after a stall (a debugger, a
 *  slow frame), the demo doesn't jump. */
const MAX_FRAME_S = 0.1;

const factories = new Map<string, DemoFactory>();
const mounts = new Map<HTMLElement, Mount>();

/** Registers the demo called `name` (the `data-demo` attribute of its
 *  wrapper) and mounts any already on the page. */
export function registerDemo(name: string, factory: DemoFactory): void {
  factories.set(name, factory);
  mountAll();
}

/** How many demos are mounted (for tests: 0 after leaving a page). */
export function liveDemos(): number {
  return mounts.size;
}

function publishLive(): void {
  document.documentElement.dataset.demoLive = String(mounts.size);
}

/** Mounts every wrapper on the page whose demo is registered. */
export function mountAll(): void {
  for (const el of document.querySelectorAll<HTMLElement>("[data-demo]")) {
    const factory = factories.get(el.dataset.demo ?? "");
    if (factory && !mounts.has(el)) mounts.set(el, new Mount(el, factory));
  }
  publishLive();
}

/** Disposes every mounted demo (before the page is swapped out). */
export function disposeAll(): void {
  for (const mount of mounts.values()) mount.dispose();
  mounts.clear();
  publishLive();
}

function palette(el: Element): Palette {
  const css = getComputedStyle(el);
  const read = (name: string, fallback: string) =>
    css.getPropertyValue(name).trim() || fallback;
  return {
    background: read("--background", "#ffffff"),
    foreground: read("--foreground", "#000000"),
    accent: read("--accent", "#0000ff"),
    muted: read("--muted", "#cccccc"),
    border: read("--border", "#cccccc"),
  };
}

class Mount {
  readonly #el: HTMLElement;
  readonly #canvas: HTMLCanvasElement;
  readonly #button: HTMLButtonElement | null;
  readonly #message: HTMLElement | null;
  readonly #factory: DemoFactory;
  readonly #abort = new AbortController();
  readonly #observers: { disconnect(): void }[] = [];
  #demo: Demo | null = null;
  #state: DemoState = "idle";
  #disposed = false;
  #onScreen = false;
  /** The reader's choice; starts paused under "reduce motion". */
  #wantsToRun: boolean;
  #raf = 0;
  #last = 0;
  #frames = 0;
  #colors: Palette;

  constructor(el: HTMLElement, factory: DemoFactory) {
    this.#el = el;
    this.#factory = factory;
    const canvas = el.querySelector("canvas");
    if (!canvas) throw new Error("a demo wrapper needs a <canvas>");
    this.#canvas = canvas;
    this.#button = el.querySelector<HTMLButtonElement>("[data-demo-toggle]");
    this.#message = el.querySelector<HTMLElement>("[data-demo-message]");
    this.#colors = palette(el);
    this.#wantsToRun = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.#setState("idle");
    el.dataset.demoFrames = "0";

    const signal = this.#abort.signal;
    const seen = new IntersectionObserver(entries => {
      this.#onScreen = entries.some(e => e.isIntersecting);
      if (this.#onScreen && this.#state === "idle") void this.#start();
      this.#schedule();
    });
    seen.observe(el);
    const resized = new ResizeObserver(() => this.#redraw());
    resized.observe(this.#canvas);
    // The theme is an attribute of <html> (src/scripts/theme.ts).
    const themed = new MutationObserver(() => {
      this.#colors = palette(this.#el);
      this.#redraw();
    });
    themed.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    this.#observers.push(seen, resized, themed);
    document.addEventListener("visibilitychange", () => this.#schedule(), {
      signal,
    });
    this.#button?.addEventListener(
      "click",
      () => {
        this.#wantsToRun = !this.#wantsToRun;
        this.#schedule();
      },
      { signal }
    );
    this.#reflectButton();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    cancelAnimationFrame(this.#raf);
    this.#abort.abort();
    for (const o of this.#observers) o.disconnect();
    this.#disposeDemo();
  }

  #disposeDemo(): void {
    try {
      this.#demo?.dispose?.();
    } catch (err) {
      // eslint-disable-next-line no-console -- a failure must reach the console
      console.error("demo: dispose failed", err);
    }
    this.#demo = null;
  }

  #setState(state: DemoState): void {
    this.#state = state;
    this.#el.dataset.demoState = state;
  }

  #reflectButton(): void {
    if (!this.#button) return;
    this.#button.textContent = this.#wantsToRun ? "Pause" : "Play";
    this.#button.setAttribute("aria-pressed", String(!this.#wantsToRun));
  }

  #fail(err: unknown): void {
    cancelAnimationFrame(this.#raf);
    this.#disposeDemo();
    this.#setState("failed");
    // eslint-disable-next-line no-console -- a failure must reach the console
    console.error("demo: failed", err);
    if (this.#message) {
      this.#message.hidden = false;
      this.#message.textContent =
        "This demo couldn't start. Reloading the page may help.";
    }
    this.#canvas.hidden = true;
    if (this.#button) this.#button.hidden = true;
  }

  async #start(): Promise<void> {
    this.#setState("loading");
    try {
      const demo = await this.#factory(this.#canvas);
      if (this.#disposed) {
        // Left the page while it was loading.
        demo.dispose?.();
        return;
      }
      this.#demo = demo;
      this.#setState("paused");
      // One frame at once, so a paused demo isn't blank.
      this.#redraw();
      this.#schedule();
    } catch (err) {
      if (!this.#disposed) this.#fail(err);
    }
  }

  /** The canvas's backing store follows its displayed size. */
  #info(): FrameInfo {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(this.#canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(this.#canvas.clientHeight * dpr));
    if (this.#canvas.width !== width) this.#canvas.width = width;
    if (this.#canvas.height !== height) this.#canvas.height = height;
    return { colors: this.#colors, width, height, dpr };
  }

  #draw(elapsedSeconds: number): void {
    if (!this.#demo) return;
    try {
      this.#demo.frame(elapsedSeconds, this.#info());
      this.#frames += 1;
      this.#el.dataset.demoFrames = String(this.#frames);
    } catch (err) {
      this.#fail(err);
    }
  }

  /** A frame that advances nothing: after a resize or a theme change. */
  #redraw(): void {
    if (this.#state === "running" || this.#state === "paused") this.#draw(0);
  }

  /** Starts or stops the loop to match what should be happening. */
  #schedule(): void {
    this.#reflectButton();
    if (this.#disposed || !this.#demo || this.#state === "failed") return;
    const shouldRun =
      this.#wantsToRun &&
      this.#onScreen &&
      document.visibilityState === "visible";
    if (shouldRun && this.#state !== "running") {
      this.#setState("running");
      this.#last = 0;
      this.#raf = requestAnimationFrame(this.#tick);
    } else if (!shouldRun && this.#state === "running") {
      this.#setState("paused");
      cancelAnimationFrame(this.#raf);
    }
  }

  #tick = (now: number): void => {
    if (this.#state !== "running") return;
    // The first frame after a start or a pause advances nothing.
    const elapsed =
      this.#last === 0 ? 0 : Math.min((now - this.#last) / 1000, MAX_FRAME_S);
    this.#last = now;
    this.#draw(elapsed);
    if (this.#state === "running") {
      this.#raf = requestAnimationFrame(this.#tick);
    }
  };
}

// Client-side navigation: pages are swapped without a reload, and module
// scripts run once per visit to the site, so mounting follows the
// router's events, not the script's first run.
document.addEventListener("astro:page-load", mountAll);
document.addEventListener("astro:before-swap", disposeAll);
