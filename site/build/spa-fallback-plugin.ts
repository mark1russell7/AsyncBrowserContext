import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { availableParallelism } from "node:os";
import path from "node:path";
import type { Browser } from "playwright";
import type { Plugin, ResolvedConfig } from "vite";
import { REPOSITORY_URL, SITE_NAME, SITE_TAGLINE } from "../src/app/site.ts";
import { headTags, ogImageFile, type SiteFacts } from "./head-tags.ts";
import { ogCard, ogImageHtml, type OgFonts } from "./og-image.ts";
import { prerenderRoutes, renderOgImages } from "./prerender.ts";
import { resolveSiteUrl, routeUrl } from "./site-url.ts";
import { sitemapXml } from "./sitemap.ts";
import { colorTokens, pageHtml, type Snapshot } from "./snapshot.ts";
import { homeRoute, routeFiles, siteRoutes } from "./static-routes.ts";

/** "0", "false", "no" and "off" turn off the steps that need Chromium. */
export function prerenderEnabled(value : string | undefined) : boolean {
    return !/^\s*(0|false|no|off)\s*$/i.test(value ?? "");
}

type RootPackage = { description? : string; homepage? : string; license? : string; version? : string; author? : string };

async function launchChromium() : Promise<Browser> {
    const { chromium } = await import("playwright");
    try {
        return await chromium.launch();
    } catch (error) {
        throw new Error([
            "The site build renders each page in Chromium, but Chromium did not start.",
            "Install it with \"pnpm exec playwright install chromium\", or set SITE_PRERENDER=0 to build without prerendered pages.",
            error instanceof Error ? error.message : String(error),
        ].join("\n"));
    }
}

async function siteFonts(root : string) : Promise<OgFonts> {
    const require = createRequire(path.join(root, "package.json"));
    const source = async (specifier : string) : Promise<string> =>
        `url(data:font/woff2;base64,${(await readFile(require.resolve(specifier))).toString("base64")}) format("woff2")`;
    return {
        sans : [await source("@fontsource-variable/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-normal.woff2")],
        mono : [await source("@fontsource-variable/atkinson-hyperlegible-mono/files/atkinson-hyperlegible-mono-latin-wght-normal.woff2")],
    };
}

/**
 * This plugin writes the static files of the site after the build:
 *
 * - An HTML file for each page (refer to `static-routes.ts`), with the head
 *   tags of the page and, from Chromium, the full HTML of the page. Search
 *   engines and link previews read it with no JavaScript. The app replaces
 *   it with no flash (refer to `src/app/prerender-handoff.ts`).
 * - `404.html`: the app with an empty root element. For an unknown path,
 *   GitHub Pages serves this file, and the router shows the page.
 * - An Open Graph image for each page, in `og/`.
 * - `sitemap.xml`.
 *
 * `SITE_URL` sets the absolute URL of the site. `SITE_PRERENDER=0` builds
 * without Chromium: no page HTML and no images.
 */
export function spaFallbackPlugin() : Plugin {
    let config : ResolvedConfig | undefined;
    return {
        name : "abc-site:spa-fallback",
        apply : "build",
        configResolved(resolved) {
            config = resolved;
        },
        async writeBundle() {
            if (!config) return;
            const { root, logger } = config;
            const warn = (message : string) : void => logger.warn(message);
            const outDir = path.resolve(root, config.build.outDir);
            const template = await readFile(path.join(outDir, "index.html"), "utf8");
            await writeFile(path.join(outDir, "404.html"), template, "utf8");

            const rootPackage = JSON.parse(await readFile(path.resolve(root, "..", "package.json"), "utf8")) as RootPackage;
            const site : SiteFacts = {
                url : resolveSiteUrl(process.env["SITE_URL"], rootPackage.homepage ?? "http://localhost/"),
                name : SITE_NAME,
                softwareDescription : rootPackage.description ?? SITE_TAGLINE,
                repository : REPOSITORY_URL,
                license : rootPackage.license ?? "MIT",
                ...(rootPackage.version === undefined ? {} : { version : rootPackage.version }),
                ...(rootPackage.author === undefined ? {} : { author : rootPackage.author }),
            };
            const routes = await siteRoutes(template, path.join(root, "content"));
            const fallbackDescription = homeRoute(template).description ?? SITE_TAGLINE;
            const tokens = colorTokens(await readFile(path.join(root, "src", "styles", "tokens.css"), "utf8"));

            let snapshots = new Map<string, Snapshot>();
            if (prerenderEnabled(process.env["SITE_PRERENDER"])) {
                const started = performance.now();
                const browser = await launchChromium();
                try {
                    snapshots = await prerenderRoutes({
                        browser,
                        outDir,
                        baseUrl : new URL(config.base, site.url).href,
                        template,
                        routes,
                        tokens,
                        concurrency : Math.min(4, availableParallelism()),
                        warn,
                    });
                    const fonts = await siteFonts(root);
                    await renderOgImages(browser, outDir, routes.map(route => ({
                        file : ogImageFile(route),
                        html : ogImageHtml(ogCard(route, site, fallbackDescription), fonts),
                    })));
                } finally {
                    await browser.close();
                }
                logger.info(`Prerendered ${routes.length} pages and their Open Graph images in ${((performance.now() - started) / 1000).toFixed(1)} s.`);
            } else {
                warn("SITE_PRERENDER is off: the pages have no prerendered HTML, and the Open Graph images are not in the output.");
            }

            for (const route of routes) {
                const snapshot = snapshots.get(route.path);
                const html = pageHtml(template, {
                    route,
                    head : headTags(route, routes, site, fallbackDescription),
                    ...(snapshot === undefined ? {} : { snapshot }),
                    tokens,
                });
                for (const file of routeFiles(route)) {
                    const target = path.join(outDir, file);
                    await mkdir(path.dirname(target), { recursive : true });
                    await writeFile(target, html, "utf8");
                }
            }
            await writeFile(path.join(outDir, "sitemap.xml"), sitemapXml(routes.map(route => routeUrl(site.url, route.path))), "utf8");
        },
    };
}
