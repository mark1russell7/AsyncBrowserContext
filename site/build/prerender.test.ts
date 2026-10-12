import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser, type Route } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { answerRequest, captureScript } from "./prerender";

type Fulfilled = { status : number; body? : unknown };

/** A Playwright route for one request, which records the answer. */
function fakeRoute(url : string, resourceType = "image") : { route : Route; answers : Array<Fulfilled | "aborted"> } {
    const answers : Array<Fulfilled | "aborted"> = [];
    const route = {
        request : () => ({ url : () => url, resourceType : () => resourceType }),
        fulfill : (answer : Fulfilled) => {
            answers.push(answer);
            return Promise.resolve();
        },
        abort : () => {
            answers.push("aborted");
            return Promise.resolve();
        },
    } as unknown as Route;
    return { route, answers };
}

describe("the requests of the prerender", () => {
    let outDir = "";

    beforeAll(async () => {
        outDir = await mkdtemp(path.join(tmpdir(), "abc-prerender-"));
        await writeFile(path.join(outDir, "a b.txt"), "text");
    });

    afterAll(async () => {
        await rm(outDir, { recursive : true, force : true });
    });

    const BASE = "https://site.test/Repo/";

    it("gives a file of the output, the template for a page, and nothing outside the site", async () => {
        const file = fakeRoute(`${BASE}a%20b.txt`);
        await answerRequest(file.route, outDir, BASE, "<html></html>");
        expect(file.answers).toMatchObject([{ status : 200 }]);
        const page = fakeRoute(`${BASE}docs/api`, "document");
        await answerRequest(page.route, outDir, BASE, "<html></html>");
        expect(page.answers).toMatchObject([{ status : 200, body : "<html></html>" }]);
        const other = fakeRoute("https://other.test/x.js");
        await answerRequest(other.route, outDir, BASE, "");
        expect(other.answers).toEqual(["aborted"]);
        const missing = fakeRoute(`${BASE}missing.js`);
        await answerRequest(missing.route, outDir, BASE, "");
        expect(missing.answers).toEqual([{ status : 404 }]);
    });

    it("answers a path with an incorrect escape with the status 400, and does not throw", async () => {
        const bad = fakeRoute(`${BASE}assets/%E0%A4%A.js`);
        await answerRequest(bad.route, outDir, BASE, "");
        expect(bad.answers).toEqual([{ status : 400 }]);
    });
});

describe("the capture of a page", () => {
    let browser : Browser;

    beforeAll(async () => {
        browser = await chromium.launch();
    });

    afterAll(async () => {
        await browser.close();
    });

    it("changes the token colors to theme variables, and keeps the fixed colors of the custom properties", async () => {
        const page = await browser.newPage();
        await page.setContent([
            `<div id="root">`,
            `<p style="color: #151c2e">Text</p>`,
            `<span style="--shiki-light-bg: #ffffff; --shiki-dark-bg: #0d1117">Code</span>`,
            `<svg style="color: #151c2e"><style>.a{fill:#2a78d6;--b:#2a78d6}</style><rect fill="#2a78d6" style="stroke: #151c2e"></rect></svg>`,
            `<script>window.x = 1;</script>`,
            `</div>`,
        ].join(""));
        const capture = await page.evaluate(captureScript([["#2a78d6", "--series-1"], ["#ffffff", "--color-surface"], ["#151c2e", "--color-ink"]])) as { body : string; colorAttributes : unknown[] };
        await page.close();
        expect(capture.body).toContain(`<p style="color: var(--color-ink)">Text</p>`);
        expect(capture.body).toContain(`<span style="--shiki-light-bg: #ffffff; --shiki-dark-bg: #0d1117">Code</span>`);
        expect(capture.body).toContain(`<svg style="color: var(--color-ink)"><style>.a{fill:var(--series-1);--b:#2a78d6}</style>`);
        expect(capture.body).toContain(`<rect fill="#2a78d6" style="stroke: var(--color-ink)"></rect>`);
        expect(capture.body).not.toContain("<script");
        expect(capture.colorAttributes).toEqual([["fill", "#2a78d6"]]);
    });
});
