// Checks the published site (`npm run check:live`, by hand: it needs the
// network and a deployed site, so it isn't in CI): every page with a
// demo loads, the WebAssembly its scripts name is served as wasm, and a
// page that doesn't exist is a real 404. The first is what a reader
// needs; the second is what Amplify's settings decide (a `.wasm` served
// as anything else can't be compiled while it downloads); the third is
// Amplify's rewrite rule (CLAUDE.md, "Amplify").
//
//   npm run check:live                     # https://www.seanwilliamcarroll.com
//   npm run check:live -- https://other.example /posts/some-post/
//
// The first argument is the site; any others are the pages to check
// (default: DEMO_PAGES below).

const SITE = process.argv[2] ?? "https://www.seanwilliamcarroll.com";
/** Published pages that embed a demo running WebAssembly. */
const DEMO_PAGES = ["/posts/hello-particles/"];
const pages = process.argv.length > 3 ? process.argv.slice(3) : DEMO_PAGES;
const WASM_MAGIC = [0x00, 0x61, 0x73, 0x6d];

const problems = [];
const ok = msg => console.log(`check-live: ok   ${msg}`);
const fail = msg => {
  problems.push(msg);
  console.error(`check-live: FAIL ${msg}`);
};

async function get(path) {
  const url = new URL(path, SITE);
  const response = await fetch(url, { redirect: "follow" });
  return { url, response };
}

/** The `.wasm` paths the page's module scripts name, following their
 *  imports on the same site (a few dozen files at most). */
async function wasmOf(html, pageUrl) {
  const queue = [
    ...html.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g),
  ].map(m => new URL(m[1], pageUrl).href);
  const seen = new Set();
  const wasm = new Set();
  while (queue.length > 0 && seen.size < 50) {
    const href = queue.shift();
    if (seen.has(href) || new URL(href).origin !== new URL(SITE).origin)
      continue;
    seen.add(href);
    const response = await fetch(href);
    if (!response.ok) {
      fail(`${href}: ${response.status}`);
      continue;
    }
    const js = await response.text();
    // Quoted any way the bundler likes: "…", '…' or `…`.
    for (const m of js.matchAll(/["'`]([^"'`]*\.wasm)["'`]/g)) {
      wasm.add(new URL(m[1], href).pathname);
    }
    for (const m of js.matchAll(
      /(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+\.js)["']/g
    )) {
      queue.push(new URL(m[1], href).href);
    }
  }
  return wasm;
}

for (const page of pages) {
  const { url, response } = await get(page);
  const type = response.headers.get("content-type") ?? "";
  if (response.status !== 200 || !type.startsWith("text/html")) {
    fail(`${url.href}: ${response.status} ${type}`);
    continue;
  }
  const html = await response.text();
  if (!html.includes("data-demo=")) {
    fail(`${url.href}: no demo on the page`);
    continue;
  }
  ok(`${url.href}: 200, a demo`);
  const wasm = await wasmOf(html, url);
  if (wasm.size === 0) fail(`${url.href}: its scripts name no .wasm`);
  for (const path of wasm) {
    const { url: wasmUrl, response: r } = await get(path);
    const wasmType = r.headers.get("content-type") ?? "";
    const bytes = new Uint8Array(await r.arrayBuffer());
    const magic = WASM_MAGIC.every((b, i) => bytes[i] === b);
    if (r.status === 200 && wasmType === "application/wasm" && magic) {
      ok(`${wasmUrl.pathname}: 200, application/wasm, ${bytes.length} bytes`);
    } else {
      fail(
        `${wasmUrl.href}: ${r.status} ${wasmType || "no type"}, ${magic ? "wasm" : "not wasm"}`
      );
    }
  }
}

// A page that can't exist: Amplify's rule serves the site's 404 page,
// at the same address, with status 404 (not the home page, not 200).
{
  const { url, response } = await get(`/check-live-${Date.now()}/`);
  const html = await response.text();
  if (response.status === 404 && html.includes("Page Not Found")) {
    ok(`${url.pathname}: 404, the site's own page`);
  } else {
    fail(`${url.href}: ${response.status}, expected 404 and "Page Not Found"`);
  }
}

if (problems.length > 0) {
  console.error(`check-live: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log("check-live: the live site is as it should be");
