/**
 * This script makes the images of the README from the built site:
 *
 * - `docs/images/debugger.gif`: the live example of the home page, one frame
 *   for each step.
 * - `docs/images/debugger.png`: one step of the live example.
 *
 * Build the site first (`SITE_BASE=AsyncBrowserContext pnpm site:build`), then
 * start the script with `pnpm readme:media`. The script needs ffmpeg.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { preview } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = path.join(root, "site");
const out = path.join(root, "docs", "images");
/** The time of one step in the animation, in seconds. */
const STEP_SECONDS = 0.9;
/** The step of the static image: the second request continues first. */
const STILL_STEP = 9;

process.env["SITE_BASE"] ??= "AsyncBrowserContext";
const server = await preview({ root : site, configFile : path.join(site, "vite.config.ts"), logLevel : "silent", preview : { port : 0, open : false } });
const url = server.resolvedUrls?.local[0];
if (url === undefined) throw new Error("The preview server has no address.");

const frames = fs.mkdtempSync(path.join(os.tmpdir(), "abc-readme-"));
const browser = await chromium.launch();
try {
    // With reduced motion, the hero does not play, and each frame shows the end of its animations.
    const page = await browser.newPage({ viewport : { width : 1280, height : 900 }, deviceScaleFactor : 1.5, reducedMotion : "reduce", colorScheme : "light" });
    await page.goto(url);
    // The app takes over the prerendered page; then the page has one hero.
    await page.waitForFunction(() => document.querySelectorAll("section[data-variant='hero']").length === 1 && document.querySelector("[data-loading]") === null);
    const demo = page.locator("section[data-variant='hero']");
    const counter = demo.locator("[class*=counter]");
    await counter.waitFor();
    await demo.scrollIntoViewIfNeeded();
    await demo.locator("[tabindex='0']").first().focus();
    await page.keyboard.press("Home");
    // A mouse click shows no focus ring, so the frames have none.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const next = demo.locator("button[aria-label='Next step']");
    const count = Number(/of (\d+)/.exec(await counter.textContent() ?? "")?.[1] ?? 0);
    for (let step = 0; step < count; step++) {
        await page.waitForTimeout(120);
        const file = path.join(frames, `frame-${String(step).padStart(3, "0")}.png`);
        await demo.screenshot({ path : file });
        if (step === STILL_STEP) fs.copyFileSync(file, path.join(out, "debugger.png"));
        if (step < count - 1) await next.click();
    }
    // The last step shows longer.
    const last = path.join(frames, `frame-${String(count - 1).padStart(3, "0")}.png`);
    for (let extra = 0; extra < 3; extra++) fs.copyFileSync(last, path.join(frames, `frame-${String(count + extra).padStart(3, "0")}.png`));
    execFileSync("ffmpeg", [
        "-y", "-loglevel", "error",
        "-framerate", String(1 / STEP_SECONDS),
        "-i", path.join(frames, "frame-%03d.png"),
        "-vf", "fps=10,scale=1040:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle",
        path.join(out, "debugger.gif"),
    ], { stdio : "inherit" });
    console.log(`wrote docs/images/debugger.gif (${count} steps) and docs/images/debugger.png`);
} finally {
    await browser.close();
    await server.close();
    fs.rmSync(frames, { recursive : true, force : true });
}
