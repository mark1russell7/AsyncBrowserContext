import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { contentRoutes, folderRedirects, homeRoute, redirectHtml, routeFiles, routeHtml, siteRoutes, unescapeHtml } from "./static-routes";

const TEMPLATE = `<!doctype html><html><head><meta name="description" content="The site &amp; more." /><title>async-browser-context: AsyncLocalStorage for browsers</title></head><body><div id="root"></div></body></html>`;

const folders : string[] = [];

afterEach(async () => {
    await Promise.all(folders.splice(0).map(folder => rm(folder, { recursive : true, force : true })));
});

/** A content folder in the temporary folder of the system. The test removes it after each test. */
async function contentDir() : Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "abc-routes-"));
    folders.push(dir);
    await mkdir(path.join(dir, "docs", "concepts"), { recursive : true });
    await writeFile(path.join(dir, "docs", "index.mdx"), "---\ntitle: Overview\ndescription: The start.\norder: 1\n---\nText");
    await writeFile(path.join(dir, "docs", "concepts", "rules.mdx"), "---\ntitle: Context rules\ndescription: \"\"\norder: 2\n---\nText");
    await writeFile(path.join(dir, "docs", "concepts", "index.mdx"), "---\ntitle: Concepts\ndescription: All of them.\norder: 3\n---\nText");
    return dir;
}

describe("static routes", () => {
    it("gives the content pages the paths and the titles of the content registry, in path order", async () => {
        expect(await contentRoutes(await contentDir())).toEqual([
            { path : "docs", title : "Overview – async-browser-context", heading : "Overview", description : "The start.", file : "docs/index.mdx" },
            { path : "docs/concepts", title : "Concepts – async-browser-context", heading : "Concepts", description : "All of them.", file : "docs/concepts/index.mdx" },
            { path : "docs/concepts/rules", title : "Context rules – async-browser-context", heading : "Context rules", file : "docs/concepts/rules.mdx" },
        ]);
    });

    it("finds a new MDX file with no other change", async () => {
        const dir = await contentDir();
        await mkdir(path.join(dir, "explore"), { recursive : true });
        await writeFile(path.join(dir, "explore", "debugger.mdx"), "---\ntitle: Context debugger\ndescription: D.\norder: 1\n---\nText");
        expect((await contentRoutes(dir)).map(route => route.path)).toContain("explore/debugger");
    });

    it("marks a draft and a page with a frontmatter problem, as the content registry does", async () => {
        const dir = await contentDir();
        await writeFile(path.join(dir, "docs", "draft.mdx"), "---\ntitle: Draft\ndescription: D.\norder: 4\nstatus: draft\n---\nText");
        await writeFile(path.join(dir, "docs", "no-title.mdx"), "---\ndescription: D.\norder: 5\n---\nText");
        const routes = await contentRoutes(dir);
        expect(routes.find(route => route.path === "docs/draft")).toMatchObject({ draft : true, heading : "Draft" });
        expect(routes.find(route => route.path === "docs/no-title")).toMatchObject({ draft : true, heading : "No title" });
        expect(routes.find(route => route.path === "docs")?.draft).toBeUndefined();
    });

    it("takes the home route from the title and the description of index.html", () => {
        expect(homeRoute(TEMPLATE)).toEqual({
            path : "",
            title : "async-browser-context: AsyncLocalStorage for browsers",
            heading : "AsyncLocalStorage for browsers",
            description : "The site & more.",
        });
        expect(homeRoute("<title>Only a name</title>").heading).toBe("Only a name");
        expect(homeRoute("<title>A &mdash; B &#8211; C &#x2014; D&nbsp;E</title>").title).toBe("A — B – C — D E");
    });

    it("decodes each named and numeric character reference, and keeps an unknown one", () => {
        expect(unescapeHtml("&lt;a&gt; &amp;amp; &quot;&#39;&apos; &hellip; &eacute; &#233; &#xE9; &#X1F600;")).toBe("<a> &amp; \"'' … é é é \u{1F600}");
        expect(unescapeHtml("&unknown; &#0; &#xD800; &#x110000; & alone")).toBe("&unknown; � � � & alone");
        expect(unescapeHtml("&constructor; &toString;")).toBe("&constructor; &toString;");
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
        expect(routeFiles({ path : "docs/concepts" })).toEqual(["docs/concepts.html", "docs/concepts/index.html"]);
        expect(routeFiles({ path : "" })).toEqual(["index.html"]);
    });

    it("sends a folder without a page to its first page in reading order", async () => {
        const dir = await contentDir();
        await mkdir(path.join(dir, "docs", "guides"), { recursive : true });
        await mkdir(path.join(dir, "explore", "deep", "er"), { recursive : true });
        await writeFile(path.join(dir, "docs", "guides", "b.mdx"), "---\ntitle: B guide\ndescription: D.\norder: 30\n---\nText");
        await writeFile(path.join(dir, "docs", "guides", "a.mdx"), "---\ntitle: A guide\ndescription: D.\norder: 31\n---\nText");
        await writeFile(path.join(dir, "explore", "deep", "er", "page.mdx"), "---\ntitle: Deep page\ndescription: D.\norder: 1\n---\nText");
        const redirects = await folderRedirects(dir);
        expect(redirects.map(redirect => [redirect.path, redirect.target.path])).toEqual([
            ["docs/guides", "docs/guides/b"],
            ["explore", "explore/deep/er/page"],
            ["explore/deep", "explore/deep/er/page"],
            ["explore/deep/er", "explore/deep/er/page"],
        ]);
        const [guides] = redirects;
        if (guides === undefined) throw new Error("No redirect");
        const html = redirectHtml(guides, "/Repo/docs/guides/b", "https://owner.github.io/Repo/docs/guides/b");
        expect(html).toContain(`<meta http-equiv="refresh" content="0; url=/Repo/docs/guides/b" />`);
        expect(html).toContain(`<link rel="canonical" href="https://owner.github.io/Repo/docs/guides/b" />`);
        expect(html).toContain(`<meta name="robots" content="noindex" />`);
        expect(html).toContain(`<a href="/Repo/docs/guides/b">B guide</a>`);
    });
});
