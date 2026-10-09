import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { contentRoutes, homeRoute, routeFiles, routeHtml, siteRoutes } from "./static-routes";

const TEMPLATE = `<!doctype html><html><head><meta name="description" content="The site &amp; more." /><title>async-browser-context: AsyncLocalStorage for browsers</title></head><body><div id="root"></div></body></html>`;

async function contentDir() : Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "abc-routes-"));
    await mkdir(path.join(dir, "docs", "concepts"), { recursive : true });
    await writeFile(path.join(dir, "docs", "index.mdx"), "---\ntitle: Overview\ndescription: The start.\n---\nText");
    await writeFile(path.join(dir, "docs", "concepts", "rules.mdx"), "---\ntitle: Context rules\n---\nText");
    await writeFile(path.join(dir, "docs", "concepts", "index.mdx"), "---\ntitle: Concepts\n---\nText");
    return dir;
}

describe("static routes", () => {
    it("gives the content pages the paths and the titles of the content registry, in path order", async () => {
        expect(await contentRoutes(await contentDir())).toEqual([
            { path : "docs", title : "Overview – async-browser-context", heading : "Overview", description : "The start." },
            { path : "docs/concepts", title : "Concepts – async-browser-context", heading : "Concepts" },
            { path : "docs/concepts/rules", title : "Context rules – async-browser-context", heading : "Context rules" },
        ]);
    });

    it("finds a new MDX file with no other change", async () => {
        const dir = await contentDir();
        await mkdir(path.join(dir, "explore"), { recursive : true });
        await writeFile(path.join(dir, "explore", "debugger.mdx"), "---\ntitle: Context debugger\n---\nText");
        expect((await contentRoutes(dir)).map(route => route.path)).toContain("explore/debugger");
    });

    it("takes the home route from the title and the description of index.html", () => {
        expect(homeRoute(TEMPLATE)).toEqual({
            path : "",
            title : "async-browser-context: AsyncLocalStorage for browsers",
            heading : "AsyncLocalStorage for browsers",
            description : "The site & more.",
        });
        expect(homeRoute("<title>Only a name</title>").heading).toBe("Only a name");
    });

    it("lists the home page first, then the content pages", async () => {
        const routes = await siteRoutes(TEMPLATE, await contentDir());
        expect(routes.map(route => route.path)).toEqual(["", "docs", "docs/concepts", "docs/concepts/rules"]);
    });

    it("puts the title and the description of the route into the HTML, with escapes", () => {
        const html = routeHtml(TEMPLATE, { path : "x", title : "A <b> & \"c\" – abc", heading : "A", description : "Why 1 < 2 costs $1 and $&" });
        expect(html).toContain("<title>A &lt;b&gt; &amp; &quot;c&quot; – abc</title>");
        expect(html).toContain('<meta name="description" content="Why 1 &lt; 2 costs $1 and $&amp;" />');
        expect(html).toContain('<div id="root"></div>');
        expect(routeHtml(TEMPLATE, { path : "x", title : "T", heading : "T" })).toContain('content="The site &amp; more."');
    });

    it("writes a file for the path and a file for the path with a slash at the end", () => {
        expect(routeFiles({ path : "docs/concepts", title : "C", heading : "C" })).toEqual(["docs/concepts.html", "docs/concepts/index.html"]);
        expect(routeFiles({ path : "", title : "Home", heading : "Home" })).toEqual(["index.html"]);
    });
});
