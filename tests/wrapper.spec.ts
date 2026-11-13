// The demo wrapper itself (src/components/demo/), on the two draft pages
// that exist to exercise it: when a demo starts, what pauses it, the
// theme, "reduce motion", and failure.
import {
  advances,
  demo,
  expect,
  frames,
  holdsStill,
  picture,
  start,
  test,
} from "./fixtures";

const CHECK = "/posts/demo-wrapper-check/";
const FAILURE = "/posts/demo-failure-check/";

test.describe("the wrapper", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(CHECK);
  });

  test("does nothing until the demo is scrolled to", async ({ page }) => {
    const wrapper = demo(page, "bounce");
    await expect(page.locator("html")).toHaveAttribute("data-demo-live", "1");
    await holdsStill(wrapper);
    await expect(wrapper).toHaveAttribute("data-demo-state", "idle");
    expect(await frames(wrapper)).toBe(0);
  });

  test("pauses off screen and resumes on return", async ({ page }) => {
    const wrapper = demo(page, "bounce");
    await start(wrapper);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(wrapper).toHaveAttribute("data-demo-state", "paused");
    await holdsStill(wrapper);
    await start(wrapper);
    await advances(wrapper);
  });

  test("pauses in a hidden tab and resumes when shown", async ({ page }) => {
    const wrapper = demo(page, "bounce");
    await start(wrapper);
    // A headless page can't be put in the background: say it is.
    const show = (state: string) =>
      page.evaluate(value => {
        Object.defineProperty(document, "visibilityState", {
          value,
          configurable: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      }, state);
    await show("hidden");
    await expect(wrapper).toHaveAttribute("data-demo-state", "paused");
    await holdsStill(wrapper);
    await show("visible");
    await expect(wrapper).toHaveAttribute("data-demo-state", "running");
    await advances(wrapper);
  });

  test("redraws in the new colours when the theme changes, even paused", async ({
    page,
  }) => {
    const wrapper = demo(page, "bounce");
    await start(wrapper);
    await wrapper.locator("[data-demo-toggle]").click();
    await expect(wrapper).toHaveAttribute("data-demo-state", "paused");
    const before = await picture(wrapper);
    const theme = await page.locator("html").getAttribute("data-theme");
    // On a phone the theme button is inside the header's menu.
    const themeButton = page.locator("#theme-btn");
    if (!(await themeButton.isVisible())) {
      await page.locator("#menu-btn").click();
    }
    await themeButton.click();
    await expect(page.locator("html")).not.toHaveAttribute(
      "data-theme",
      theme ?? ""
    );
    await expect
      .poll(async () => (await picture(wrapper)).sample)
      .not.toBe(before.sample);
    await expect(wrapper).toHaveAttribute("data-demo-state", "paused");
  });
});

test.describe("with reduce motion set", () => {
  test.use({ reducedMotion: "reduce" });

  test("starts paused, with a frame drawn, and Play starts it", async ({
    page,
  }) => {
    await page.goto(CHECK);
    const wrapper = demo(page, "bounce");
    const button = wrapper.locator("[data-demo-toggle]");
    await wrapper.scrollIntoViewIfNeeded();
    await expect(wrapper).toHaveAttribute("data-demo-state", "paused");
    await expect(button).toHaveText("Play");
    // Not a blank box: the first frame is there.
    await expect.poll(() => frames(wrapper)).toBeGreaterThanOrEqual(1);
    expect((await picture(wrapper)).colours).toBeGreaterThanOrEqual(2);
    await holdsStill(wrapper);
    await button.click();
    await expect(wrapper).toHaveAttribute("data-demo-state", "running");
    await advances(wrapper);
  });
});

test.describe("a demo that can't start", () => {
  test("shows a message in place of the canvas, and logs why", async ({
    page,
    consoleErrors,
  }) => {
    await page.goto(FAILURE);
    const wrapper = demo(page, "broken");
    await wrapper.scrollIntoViewIfNeeded();
    await expect(wrapper).toHaveAttribute("data-demo-state", "failed");
    await expect(wrapper.locator("[data-demo-message]")).toHaveText(
      "This demo couldn't start. Reloading the page may help."
    );
    await expect(wrapper.locator("canvas")).toBeHidden();
    await expect(wrapper.locator("[data-demo-toggle]")).toBeHidden();
    // The one expected error; anything else still fails the test.
    expect(consoleErrors.splice(0).join("\n")).toContain("broken on purpose");
  });
});
