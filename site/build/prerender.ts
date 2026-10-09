import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Browser, Page, Route } from "playwright";
import { LOADING_SELECTOR } from "../src/lib/readiness.ts";
import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from "./head-tags.ts";
import { COLOR_ATTRIBUTES, replaceTokenColors, type Snapshot } from "./snapshot.ts";
import type { StaticRoute } from "./static-routes.ts";

export type PrerenderOptions = {
    browser : Browser;
    /** The build output. The browser gets each file from this folder. */
    outDir : string;
    /** The URL of the site in the browser, with a slash at the end. The prerender answers each request below it. */
    baseUrl : string;
    /** The built index.html with an empty root element. The browser gets it for each page. */
    template : string;
    routes : readonly StaticRoute[];
    tokens : ReadonlyArray<readonly [string, string]>;
    /** The maximum time for a page to become ready, in milliseconds. */
    timeoutMs? : number;
    /** The number of pages that render at the same time. */
    concurrency? : number;
    warn? : (message : string) => void;
};

const CONTENT_TYPES : Readonly<Record<string, string>> = {
    ".css" : "text/css; charset=utf-8",
    ".html" : "text/html; charset=utf-8",
    ".ico" : "image/x-icon",
    ".jpg" : "image/jpeg",
    ".js" : "text/javascript; charset=utf-8",
    ".json" : "application/json; charset=utf-8",
    ".mjs" : "text/javascript; charset=utf-8",
    ".png" : "image/png",
    ".svg" : "image/svg+xml",
    ".txt" : "text/plain; charset=utf-8",
    ".wasm" : "application/wasm",
    ".webp" : "image/webp",
    ".woff" : "font/woff",
    ".woff2" : "font/woff2",
    ".xml" : "application/xml; charset=utf-8",
};

/**
 * The browser gets the files of the build output with no server. Each
 * request below `baseUrl` gets a file, and each page request gets the
 * template. A request to another address stops, so the build does not use
 * the network.
 */
async function answer(route : Route, outDir : string, baseUrl : string, template : string) : Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.href.startsWith(baseUrl)) {
        await (url.origin === new URL(baseUrl).origin ? route.fulfill({ status : 404 }) : route.abort());
        return;
    }
    if (request.resourceType() === "document") {
        await route.fulfill({ status : 200, contentType : "text/html; charset=utf-8", body : template });
        return;
    }
    const root = path.resolve(outDir);
    const file = path.resolve(root, decodeURIComponent(url.pathname.slice(new URL(baseUrl).pathname.length)));
    if (!file.startsWith(root + path.sep)) {
        await route.fulfill({ status : 404 });
        return;
    }
    try {
        const body = await readFile(file);
        await route.fulfill({ status : 200, contentType : CONTENT_TYPES[path.extname(file)] ?? "application/octet-stream", body });
    } catch {
        await route.fulfill({ status : 404 });
    }
}

// The scripts below run in the page. They are text, so that the bundle of the Vite configuration cannot change them.

const READY_SCRIPT = `(() => {
    const root = document.getElementById("root");
    return root !== null && root.firstElementChild !== null && document.querySelector(${JSON.stringify(LOADING_SELECTOR)}) === null;
})()`;

const PENDING_SCRIPT = `(() => {
    const root = document.getElementById("root");
    if (root === null || root.firstElementChild === null) return "The app rendered nothing into the root element.";
    const loading = document.querySelector(${JSON.stringify(LOADING_SELECTOR)});
    return loading === null ? "" : "This element still loads: " + loading.outerHTML.slice(0, 300);
})()`;

/** This script waits until the DOM does not change for 200 ms, for 3 s at most. Charts and graphs can change the DOM after the data loads. */
const SETTLE_SCRIPT = `new Promise((resolve) => {
    let quiet = 0;
    let limit = 0;
    let observer;
    const done = () => { observer.disconnect(); clearTimeout(quiet); clearTimeout(limit); resolve(undefined); };
    observer = new MutationObserver(() => { clearTimeout(quiet); quiet = setTimeout(done, 200); });
    observer.observe(document.documentElement, { subtree : true, childList : true, attributes : true, characterData : true });
    quiet = setTimeout(done, 200);
    limit = setTimeout(done, 3000);
}).then(() => document.fonts.ready).then(() => undefined)`;

/**
 * This script copies the root element and removes what must not be in a
 * static file: scripts. It changes the theme colors in style attributes and
 * style elements to `var(<token>)`, so the HTML follows the dark theme too.
 * The links that the app added to the head get paths without the origin.
 */
function captureScript(tokens : ReadonlyArray<readonly [string, string]>) : string {
    const args = JSON.stringify({ tokens, attributes : COLOR_ATTRIBUTES });
    return `((args, replaceColors) => {
    const clone = document.getElementById("root").cloneNode(true);
    for (const element of clone.querySelectorAll("script")) element.remove();
    for (const element of clone.querySelectorAll("[style]")) element.setAttribute("style", replaceColors(element.getAttribute("style"), args.tokens));
    for (const element of clone.querySelectorAll("style")) element.textContent = replaceColors(element.textContent, args.tokens);
    const pairs = new Map();
    for (const element of clone.querySelectorAll("svg, svg *")) {
        for (const name of args.attributes) {
            const value = element.getAttribute(name);
            if (value) pairs.set(name + "\\u0000" + value, [name, value]);
        }
    }
    const links = [...document.head.querySelectorAll('link[rel="stylesheet"], link[rel="modulepreload"]')].map((link) => {
        const copy = link.cloneNode(true);
        const url = new URL(link.href);
        if (url.origin === location.origin) copy.setAttribute("href", url.pathname + url.search);
        return copy.outerHTML;
    });
    return { body : clone.innerHTML, links, colorAttributes : [...pairs.values()], title : document.title };
})(${args}, ${replaceTokenColors.toString()})`;
}

type Capture = Snapshot & { title : string };

async function renderRoute(page : Page, route : StaticRoute, options : PrerenderOptions, problems : string[]) : Promise<Snapshot> {
    const timeout = options.timeoutMs ?? 30_000;
    const name = `/${route.path}`;
    problems.length = 0;
    const response = await page.goto(new URL(route.path, options.baseUrl).href, { waitUntil : "load", timeout });
    if (!response?.ok()) throw new Error(`Prerender: the page ${name} did not load (HTTP ${response?.status() ?? "no response"}).`);
    try {
        await page.waitForFunction(READY_SCRIPT, undefined, { timeout, polling : 50 });
    } catch {
        const pending = await page.evaluate(PENDING_SCRIPT).catch(() => "");
        throw new Error([
            `Prerender: the page ${name} was not ready after ${timeout / 1000} s.`,
            `A page is ready when it has content and no element matches ${LOADING_SELECTOR}.`,
            pending,
            ...problems,
        ].filter(line => line !== "").join("\n"));
    }
    await page.evaluate(SETTLE_SCRIPT);
    if (!await page.evaluate(READY_SCRIPT)) {
        throw new Error(`Prerender: the page ${name} started to load again. ${String(await page.evaluate(PENDING_SCRIPT))}`);
    }
    const errors = problems.filter(problem => problem.startsWith("Error in the page"));
    if (errors.length > 0) throw new Error(`Prerender: the page ${name} has errors.\n${errors.join("\n")}`);
    for (const problem of problems) options.warn?.(`Prerender: ${name}: ${problem}`);

    const capture = await page.evaluate(captureScript(options.tokens)) as Capture;
    if (capture.title !== route.title) {
        options.warn?.(`Prerender: the page ${name} has the title "${capture.title}", but the head tags use "${route.title}".`);
    }
    return { body : capture.body, links : capture.links, colorAttributes : capture.colorAttributes };
}

/**
 * This function renders each route in Chromium and gives the HTML of each
 * page when the page is ready (refer to `src/lib/readiness.ts`). The key of
 * the map is the route path.
 */
export async function prerenderRoutes(options : PrerenderOptions) : Promise<Map<string, Snapshot>> {
    const context = await options.browser.newContext({
        viewport : { width : 1280, height : 800 },
        colorScheme : "light",
        locale : "en-US",
        timezoneId : "UTC",
    });
    try {
        await context.route("**/*", route => answer(route, options.outDir, options.baseUrl, options.template));
        const results = new Map<string, Snapshot>();
        const queue = [...options.routes];
        const worker = async () : Promise<void> => {
            const page = await context.newPage();
            const problems : string[] = [];
            page.on("pageerror", error => problems.push(`Error in the page: ${error.message}`));
            page.on("console", message => {
                if (message.type() === "error") problems.push(`Console error: ${message.text()}`);
            });
            try {
                for (let route = queue.shift(); route !== undefined; route = queue.shift()) {
                    results.set(route.path, await renderRoute(page, route, options, problems));
                }
            } finally {
                await page.close();
            }
        };
        await Promise.all(Array.from({ length : Math.max(1, options.concurrency ?? 4) }, worker));
        return results;
    } finally {
        await context.close();
    }
}

export type OgImageJob = {
    /** The file in the build output, for example "og/docs/api.png". */
    file : string;
    /** The HTML of the image (refer to `ogImageHtml`). */
    html : string;
};

/** This function renders each image page to a PNG file of 1200 × 630 pixels. */
export async function renderOgImages(browser : Browser, outDir : string, jobs : readonly OgImageJob[]) : Promise<void> {
    const context = await browser.newContext({ viewport : { width : OG_IMAGE_WIDTH, height : OG_IMAGE_HEIGHT }, deviceScaleFactor : 1 });
    try {
        // The image pages contain their fonts. They need no request.
        await context.route("**/*", route => route.abort());
        const page = await context.newPage();
        for (const job of jobs) {
            await page.setContent(job.html, { waitUntil : "load" });
            await page.waitForSelector("body[data-ready]", { timeout : 15_000 });
            const target = path.join(outDir, job.file);
            await mkdir(path.dirname(target), { recursive : true });
            await page.screenshot({ path : target, type : "png" });
        }
    } finally {
        await context.close();
    }
}
