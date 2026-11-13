// What every demo test gets, on top of Playwright's own `test`:
//
// - Nothing leaves the machine. A request to any other site is refused,
//   and fails the test: the pages under test must work from the site's
//   own files (and the test build has no analytics tag to begin with:
//   src/utils/analytics.ts).
// - A page error or a console error fails the test, unless the test
//   took it out of `consoleErrors` as expected.
import { test as base, expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

interface Fixtures {
  offSite: string[];
  consoleErrors: string[];
}

export const test = base.extend<Fixtures>({
  offSite: [
    async ({ context, baseURL }, use) => {
      const home = new URL(baseURL ?? "").origin;
      const seen: string[] = [];
      await context.route(
        url => /^https?:$/.test(url.protocol) && url.origin !== home,
        route => {
          seen.push(route.request().url());
          return route.abort();
        }
      );
      await use(seen);
      expect(seen, "requests to other sites").toEqual([]);
    },
    { auto: true },
  ],
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", err => errors.push(String(err)));
      page.on("console", msg => {
        if (msg.type() === "error") errors.push(msg.text());
      });
      await use(errors);
      expect(errors, "page and console errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** The wrapper of the demo registered as `name`. */
export const demo = (page: Page, name: string): Locator =>
  page.locator(`[data-demo="${name}"]`);

/** How many frames the demo has drawn. */
export const frames = async (wrapper: Locator): Promise<number> =>
  Number(await wrapper.getAttribute("data-demo-frames"));

/** How many demos are mounted on the page. */
export const live = (page: Page): Promise<string | null> =>
  page.locator("html").getAttribute("data-demo-live");

/** Scrolls the demo into view and waits for it to be running. */
export async function start(wrapper: Locator): Promise<void> {
  await wrapper.scrollIntoViewIfNeeded();
  await expect(wrapper).toHaveAttribute("data-demo-state", "running");
}

/** Waits until the demo has drawn `more` frames beyond now. */
export async function advances(wrapper: Locator, more = 5): Promise<void> {
  const from = await frames(wrapper);
  await expect.poll(() => frames(wrapper)).toBeGreaterThanOrEqual(from + more);
}

/** Checks that no frame is drawn over `ms` milliseconds. */
export async function holdsStill(wrapper: Locator, ms = 300): Promise<void> {
  const from = await frames(wrapper);
  await wrapper.page().waitForTimeout(ms);
  expect(await frames(wrapper)).toBe(from);
}

/** What the canvas shows: how many distinct colours (in a sample of its
 *  pixels), and the sample itself, to compare one moment with another. */
export const picture = (
  wrapper: Locator
): Promise<{ colours: number; sample: string }> =>
  wrapper.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("not a 2D canvas");
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels: string[] = [];
    // Every 97th pixel: a prime stride, so the sample isn't one column.
    for (let i = 0; i < data.length; i += 4 * 97) {
      pixels.push(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    }
    return { colours: new Set(pixels).size, sample: pixels.join(" ") };
  });
