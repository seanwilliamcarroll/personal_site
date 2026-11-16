// Math in posts: written as $…$ and $$…$$, rendered to HTML by KaTeX at
// build time (astro.config.ts), styled and drawn in its own fonts, all
// from the site itself (the fixtures refuse any other).
import { expect, test } from "./fixtures";

const PAGE = "/checks/math/";

test("inline and display math render, in KaTeX's fonts, from the site", async ({
  page,
}) => {
  await page.goto(PAGE);
  const math = page.locator(".katex");
  await expect(math).toHaveCount(2);
  await expect(page.locator(".katex-display")).toHaveCount(1);
  // The source rides along for screen readers and copying (MathML).
  await expect(
    page.locator('.katex-display annotation[encoding="application/x-tex"]')
  ).toContainText("\\varepsilon^2");
  // Rendered, not left as text: no dollar signs on the page.
  await expect(page.locator("article")).not.toContainText("$$");
  await expect(math.first()).toBeVisible();
  // The math font is in use: KaTeX's CSS, and its fonts, loaded.
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(() => document.fonts.check("16px KaTeX_Main"))
  ).toBe(true);
});

test("display math is the text's colour in both themes", async ({ page }) => {
  await page.goto(PAGE);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      t => document.documentElement.setAttribute("data-theme", t),
      theme
    );
    const [math, text] = await page.evaluate(() => [
      getComputedStyle(document.querySelector(".katex-display")!).color,
      getComputedStyle(document.querySelector("article p")!).color,
    ]);
    expect(math, theme).toBe(text);
  }
});
