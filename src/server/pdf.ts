import "server-only";
import { chromium, type Browser } from "playwright-core";

/**
 * Renders an internal page to PDF with headless Chromium. One browser is
 * kept warm and reused; each request gets its own isolated context.
 */
let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        executablePath: process.env.CHROMIUM_PATH || undefined,
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
      })
      .then((b) => {
        b.on("disconnected", () => (browserPromise = null));
        return b;
      })
      .catch((e) => {
        browserPromise = null;
        throw e;
      });
  }
  return browserPromise;
}

export function internalBaseUrl(): string {
  return process.env.INTERNAL_BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`;
}

export async function renderPdf(opts: { path: string; cookie: { name: string; value: string }; footerLabel: string }): Promise<Buffer> {
  const browser = await getBrowser();
  const base = internalBaseUrl();
  const context = await browser.newContext({ colorScheme: "light" });
  try {
    await context.addCookies([{ name: opts.cookie.name, value: opts.cookie.value, url: base, httpOnly: true, sameSite: "Lax" }]);
    const page = await context.newPage();
    const res = await page.goto(base + opts.path, { waitUntil: "networkidle", timeout: 120_000 });
    if (!res || !res.ok()) throw new Error(`Report page returned ${res?.status() ?? "no response"}`);
    await page.emulateMedia({ media: "print" });
    const esc = opts.footerLabel.replace(/[<>&]/g, "");
    return await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="font-size:8px;color:#6f6e69;width:100%;padding:0 12mm;display:flex;justify-content:space-between;font-family:Arial,sans-serif"><span>${esc}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
      margin: { top: "14mm", bottom: "16mm", left: "12mm", right: "12mm" },
    });
  } finally {
    await context.close();
  }
}
