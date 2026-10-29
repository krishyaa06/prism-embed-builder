/* Regenerates assets/logo.png and assets/screenshots/*.png with Playwright (optional dev tool). */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.join(__dirname, "..");
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(req.url.split(/[?#]/)[0]).replace(/\/$/, "/index.html"));
  fs.readFile(file, (err, buf) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" }); res.end(buf); });
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch();
  // serve the hosted sample images from the local checkout
  const route = async (page) => page.route("https://krishyaa06.github.io/prism-embed-builder/**", (r) => r.fulfill({ path: path.join(root, new URL(r.request().url()).pathname.replace("/prism-embed-builder/", "")) }));

  const logo = await browser.newPage({ viewport: { width: 512, height: 512 } });
  await logo.setContent(`<body style="margin:0;background:transparent"><img src="${base}assets/logo.svg" width="512" height="512"></body>`);
  await logo.waitForTimeout(300);
  await logo.screenshot({ path: path.join(root, "assets/logo.png"), omitBackground: true });

  const shots = [["desktop", { width: 1440, height: 1100 }, 1], ["mobile", { width: 390, height: 1500 }, 2]];
  for (const [name, viewport, scale] of shots) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: scale });
    await route(page);
    await page.addInitScript(() => localStorage.clear());
    await page.goto(base, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    if (name === "desktop") await page.evaluate(() => window.scrollTo(0, document.querySelector(".toolbar").offsetTop - 70));
    else await page.evaluate(() => window.scrollTo(0, document.querySelector(".preview-col").offsetTop - 70));
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(root, `assets/screenshots/${name}.png`) });
    console.log("saved", name);
  }
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
