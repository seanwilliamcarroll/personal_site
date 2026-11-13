// Hello Particles: what only a demo that loads the engine can be asked.
import { advances, demo, expect, start, test } from "./fixtures";

const PAGE = "/posts/hello-particles/";

// A short window: the demo is below the fold when the page loads,
// however short the post's opening is.
test.use({ viewport: { width: 700, height: 240 } });

test("the engine is fetched only when the demo is scrolled to, as wasm", async ({
  page,
}) => {
  const fetched: { url: string; status: number; type: string | undefined }[] =
    [];
  page.on("response", response => {
    const url = new URL(response.url()).pathname;
    if (/physics-engine|engine-package|\.wasm$/.test(url)) {
      fetched.push({
        url,
        status: response.status(),
        type: response.headers()["content-type"],
      });
    }
  });

  await page.goto(PAGE);
  const wrapper = demo(page, "hello-particles");
  await expect(page.locator("html")).toHaveAttribute("data-demo-live", "1");
  await page.waitForLoadState("networkidle");
  await expect(wrapper).toHaveAttribute("data-demo-state", "idle");
  expect(fetched, "fetched before scrolling").toEqual([]);

  await start(wrapper);
  await advances(wrapper);
  const wasm = fetched.filter(f => f.url.endsWith(".wasm"));
  // One file, under a content-hashed name, served as wasm (so the
  // browser can compile it while it downloads).
  expect(wasm).toHaveLength(1);
  expect(wasm[0]?.url).toMatch(/^\/_astro\/engine\.[\w-]+\.wasm$/);
  expect(wasm[0]?.status).toBe(200);
  expect(wasm[0]?.type).toBe("application/wasm");
});
