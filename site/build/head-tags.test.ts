import { describe, expect, it } from "vitest";
import { breadcrumbs, headTags, jsonForScript, ogImageFile, sectionLabel, structuredData, type SiteFacts } from "./head-tags";
import type { StaticRoute } from "./static-routes";

const SITE : SiteFacts = {
    url : "https://owner.github.io/Repo/",
    name : "async-browser-context",
    softwareDescription : "AsyncLocalStorage for browsers.",
    repository : "https://github.com/owner/Repo",
    license : "MIT",
    version : "1.2.3",
    author : "Mark Russell",
};

const HOME : StaticRoute = { path : "", title : "async-browser-context: AsyncLocalStorage for browsers", heading : "AsyncLocalStorage for browsers", description : "The home." };
const DOCS : StaticRoute = { path : "docs", title : "Overview – async-browser-context", heading : "Overview", description : "The docs." };
const RULES : StaticRoute = { path : "docs/concepts/rules", title : "Context rules – async-browser-context", heading : "Context rules", description : "The 13 \"rules\" <here>." };
const ROUTES = [HOME, DOCS, RULES];

/** The JSON-LD object in the head tags. */
function jsonLd(tags : string) : unknown {
    const text = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(tags)?.[1];
    if (text === undefined) throw new Error("No JSON-LD");
    return JSON.parse(text);
}

describe("head tags", () => {
    it("gives a content page its canonical URL, Open Graph, the Twitter card and the sitemap", () => {
        const tags = headTags(RULES, ROUTES, SITE, "Fallback.");
        const url = "https://owner.github.io/Repo/docs/concepts/rules";
        const image = "https://owner.github.io/Repo/og/docs/concepts/rules.png";
        expect(tags).toContain(`<link rel="canonical" href="${url}" />`);
        expect(tags).toContain(`<meta property="og:url" content="${url}" />`);
        expect(tags).toContain(`<meta property="og:type" content="article" />`);
        expect(tags).toContain(`<meta property="og:site_name" content="async-browser-context" />`);
        expect(tags).toContain(`<meta property="og:title" content="Context rules" />`);
        expect(tags).toContain(`<meta property="og:description" content="The 13 &quot;rules&quot; &lt;here&gt;." />`);
        expect(tags).toContain(`<meta property="og:image" content="${image}" />`);
        expect(tags).toContain(`<meta property="og:image:width" content="1200" />`);
        expect(tags).toContain(`<meta property="og:image:height" content="630" />`);
        expect(tags).toMatch(/<meta property="og:image:alt" content="Context rules, [^"]+" \/>/);
        expect(tags).toContain(`<meta property="article:section" content="Docs" />`);
        expect(tags).toContain(`<meta name="twitter:card" content="summary_large_image" />`);
        expect(tags).toContain(`<meta name="twitter:image" content="${image}" />`);
        expect(tags).toContain(`<link rel="sitemap" type="application/xml" href="https://owner.github.io/Repo/sitemap.xml" />`);
    });

    it("gives the home page the full title, the type website and the site URL", () => {
        const tags = headTags(HOME, ROUTES, SITE, "Fallback.");
        expect(tags).toContain(`<link rel="canonical" href="https://owner.github.io/Repo/" />`);
        expect(tags).toContain(`<meta property="og:type" content="website" />`);
        expect(tags).toContain(`<meta property="og:title" content="async-browser-context: AsyncLocalStorage for browsers" />`);
        expect(tags).toContain(`<meta property="og:image" content="https://owner.github.io/Repo/og/index.png" />`);
        expect(tags).not.toContain("article:section");
    });

    it("uses the fallback description for a page without a description", () => {
        const tags = headTags({ path : "docs/x", title : "X – abc", heading : "X" }, ROUTES, SITE, "Fallback.");
        expect(tags).toContain(`<meta property="og:description" content="Fallback." />`);
        expect(tags).toContain(`<meta name="twitter:description" content="Fallback." />`);
    });

    it("gives the home page a WebSite and a SoftwareSourceCode", () => {
        expect(jsonLd(headTags(HOME, ROUTES, SITE, "Fallback."))).toEqual(structuredData(HOME, ROUTES, SITE));
        expect(structuredData(HOME, ROUTES, SITE)).toEqual({
            "@context" : "https://schema.org",
            "@graph" : [
                {
                    "@type" : "WebSite",
                    "@id" : "https://owner.github.io/Repo/#website",
                    url : "https://owner.github.io/Repo/",
                    name : "async-browser-context",
                    description : "The home.",
                    inLanguage : "en",
                },
                {
                    "@type" : "SoftwareSourceCode",
                    "@id" : "https://owner.github.io/Repo/#software",
                    name : "async-browser-context",
                    description : "AsyncLocalStorage for browsers.",
                    url : "https://owner.github.io/Repo/",
                    codeRepository : "https://github.com/owner/Repo",
                    programmingLanguage : "TypeScript",
                    runtimePlatform : ["Web browsers", "Node.js"],
                    license : "https://opensource.org/licenses/MIT",
                    version : "1.2.3",
                    author : { "@type" : "Person", name : "Mark Russell" },
                },
            ],
        });
    });

    it("gives a content page a TechArticle and a BreadcrumbList", () => {
        const graph = (structuredData(RULES, ROUTES, SITE) as { "@graph" : Array<Record<string, unknown>> })["@graph"];
        expect(graph[0]).toMatchObject({
            "@type" : "TechArticle",
            headline : "Context rules",
            url : "https://owner.github.io/Repo/docs/concepts/rules",
            image : "https://owner.github.io/Repo/og/docs/concepts/rules.png",
        });
        expect(graph[1]).toEqual({
            "@type" : "BreadcrumbList",
            itemListElement : [
                { "@type" : "ListItem", position : 1, name : "async-browser-context", item : "https://owner.github.io/Repo/" },
                { "@type" : "ListItem", position : 2, name : "Docs", item : "https://owner.github.io/Repo/docs" },
                { "@type" : "ListItem", position : 3, name : "Context rules", item : "https://owner.github.io/Repo/docs/concepts/rules" },
            ],
        });
    });

    it("puts only the parent routes that exist into the breadcrumbs", () => {
        expect(breadcrumbs(RULES, ROUTES, SITE).map(crumb => crumb.path)).toEqual(["", "docs", "docs/concepts/rules"]);
        const concepts : StaticRoute = { path : "docs/concepts", title : "Concepts – abc", heading : "Concepts" };
        expect(breadcrumbs(RULES, [...ROUTES, concepts], SITE).map(crumb => crumb.name))
            .toEqual(["async-browser-context", "Docs", "Concepts", "Context rules"]);
        expect(breadcrumbs(DOCS, ROUTES, SITE).map(crumb => crumb.name)).toEqual(["async-browser-context", "Docs"]);
        expect(breadcrumbs(HOME, ROUTES, SITE)).toEqual([{ name : "async-browser-context", path : "" }]);
    });

    it("escapes the JSON so that a text cannot close the script element", () => {
        const text = jsonForScript({ value : "</script><script>alert(1)</script> &  " });
        expect(text).not.toContain("<");
        expect(text).not.toContain(" ");
        expect(JSON.parse(text)).toEqual({ value : "</script><script>alert(1)</script> &  " });
    });

    it("names the image files and the sections", () => {
        expect(ogImageFile(HOME)).toBe("og/index.png");
        expect(ogImageFile(RULES)).toBe("og/docs/concepts/rules.png");
        expect(sectionLabel("docs")).toBe("Docs");
        expect(sectionLabel("getting-started")).toBe("Getting started");
    });
});
