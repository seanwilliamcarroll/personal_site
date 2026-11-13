// What every embedded demo must do, on every page that has one
// (tests/demo-pages.ts).
import { DEMO_PAGES } from "./demo-pages";
import {
  advances,
  demo,
  expect,
  holdsStill,
  live,
  picture,
  start,
  test,
} from "./fixtures";

for (const { path, demos } of DEMO_PAGES) {
  test.describe(path, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(path);
    });

    for (const name of demos) {
      test(`${name}: starts when scrolled to, draws, and keeps moving`, async ({
        page,
      }) => {
        const wrapper = demo(page, name);
        await start(wrapper);
        await advances(wrapper);
        const before = await picture(wrapper);
        // Not one flat colour.
        expect(before.colours).toBeGreaterThanOrEqual(2);
        await expect
          .poll(async () => (await picture(wrapper)).sample)
          .not.toBe(before.sample);
      });

      test(`${name}: the button pauses and resumes it`, async ({ page }) => {
        const wrapper = demo(page, name);
        const button = wrapper.locator("[data-demo-toggle]");
        await start(wrapper);
        await expect(button).toHaveText("Pause");
        await button.click();
        await expect(wrapper).toHaveAttribute("data-demo-state", "paused");
        await expect(button).toHaveText("Play");
        await holdsStill(wrapper);
        await button.click();
        await expect(wrapper).toHaveAttribute("data-demo-state", "running");
        await advances(wrapper);
      });
    }

    test("leaving the page disposes every demo; coming back mounts each once", async ({
      page,
    }) => {
      for (const name of demos) await start(demo(page, name));
      expect(await live(page)).toBe(String(demos.length));
      // The site's title, in the header: a client-side navigation.
      await page.locator('header a[href="/"]').first().click();
      await page.waitForURL(url => url.pathname === "/");
      await expect(page.locator("html")).toHaveAttribute("data-demo-live", "0");
      await page.goBack();
      await page.waitForURL(url => url.pathname === path);
      await expect(page.locator("html")).toHaveAttribute(
        "data-demo-live",
        String(demos.length)
      );
      for (const name of demos) {
        const wrapper = demo(page, name);
        await start(wrapper);
        await advances(wrapper);
      }
    });
  });
}
