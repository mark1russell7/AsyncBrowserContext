import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { contentRoutes, routeFiles, routeHtml } from "./static-routes";

const TEMPLATE = `<!doctype html><html><head><meta name="description" content="The site." /><title>async-browser-context</title></head><body><div id="root"></div></body></html>`;

describe("static routes", () => {
    it("gives the content pages the paths and the titles of the content registry", async () => {
        const dir = await mkdtemp(path.join(tmpdir(), "abc-routes-"));
        await mkdir(path.join(dir, "docs", "concepts"), { recursive : true });
        await writeFile(path.join(dir, "docs", "index.mdx"), "---\ntitle: Overview\ndescription: The start.\n---\nText");
        await writeFile(path.join(dir, "docs", "concepts", "rules.mdx"), "---\ntitle: Context rules\n---\nText");
        await writeFile(path.join(dir, "docs", "concepts", "index.mdx"), "---\ntitle: Concepts\n---\nText");

        const routes = (await contentRoutes(dir)).sort((a, b) => a.path.localeCompare(b.path));
        expect(routes).toEqual([
            { path : "docs", title : "Overview – async-browser-context", description : "The start." },
            { path : "docs/concepts", title : "Concepts – async-browser-context" },
            { path : "docs/concepts/rules", title : "Context rules – async-browser-context" },
        ]);
    });

    it("puts the title and the description of the route into the HTML, with escapes", () => {
        const html = routeHtml(TEMPLATE, { path : "x", title : "A <b> & \"c\" – abc", description : "Why 1 < 2" });
        expect(html).toContain("<title>A &lt;b&gt; &amp; &quot;c&quot; – abc</title>");
        expect(html).toContain('<meta name="description" content="Why 1 &lt; 2" />');
        expect(html).toContain('<div id="root"></div>');
        expect(routeHtml(TEMPLATE, { path : "x", title : "T" })).toContain('content="The site."');
    });

    it("writes a file for the path and a file for the path with a slash at the end", () => {
        expect(routeFiles({ path : "docs/concepts", title : "C" })).toEqual(["docs/concepts.html", "docs/concepts/index.html"]);
        expect(routeFiles({ path : "", title : "Home" })).toEqual([]);
    });
});
