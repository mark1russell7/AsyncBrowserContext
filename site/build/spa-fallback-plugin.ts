import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";
import { contentRoutes, routeFiles, routeHtml } from "./static-routes.ts";

/**
 * This plugin writes an HTML file for each page after the build, and it
 * copies `index.html` to `404.html`. GitHub Pages serves the file of a page
 * with the status 200, with the title and the description of the page. For
 * an unknown path, it serves `404.html`, and the client router shows the
 * page that the app knows, or its "not found" page.
 */
export function spaFallbackPlugin() : Plugin {
    let outDir = "";
    let root = "";
    return {
        name : "abc-site:spa-fallback",
        apply : "build",
        configResolved(config) {
            root = config.root;
            outDir = path.resolve(config.root, config.build.outDir);
        },
        async writeBundle() {
            const template = await readFile(path.join(outDir, "index.html"), "utf8");
            await copyFile(path.join(outDir, "index.html"), path.join(outDir, "404.html"));

            const routes = await contentRoutes(path.join(root, "content"));
            for (const route of routes) {
                const html = routeHtml(template, route);
                for (const file of routeFiles(route)) {
                    const target = path.join(outDir, file);
                    await mkdir(path.dirname(target), { recursive : true });
                    await writeFile(target, html, "utf8");
                }
            }
        },
    };
}
