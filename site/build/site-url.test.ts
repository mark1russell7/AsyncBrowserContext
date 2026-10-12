import { describe, expect, it } from "vitest";
import { resolveSiteUrl, routeHref, routeUrl } from "./site-url";
import { sitemapXml } from "./sitemap";

const FALLBACK = "https://mark1russell7.github.io/AsyncBrowserContext/";

describe("site URL", () => {
    it("uses SITE_URL, with a slash at the end and a host in lower case", () => {
        expect(resolveSiteUrl("https://Owner.github.io/Repo", FALLBACK)).toBe("https://owner.github.io/Repo/");
        expect(resolveSiteUrl(" https://example.com ", FALLBACK)).toBe("https://example.com/");
        expect(resolveSiteUrl("https://example.com/docs/?a=1#top", FALLBACK)).toBe("https://example.com/docs/");
    });

    it("uses the fallback when SITE_URL is not set or empty", () => {
        expect(resolveSiteUrl(undefined, FALLBACK)).toBe(FALLBACK);
        expect(resolveSiteUrl("  ", FALLBACK)).toBe(FALLBACK);
    });

    it("refuses a value that is not an absolute http or https URL", () => {
        expect(() => resolveSiteUrl("AsyncBrowserContext", FALLBACK)).toThrow(/absolute URL/);
        expect(() => resolveSiteUrl("ftp://example.com/", FALLBACK)).toThrow(/https:\/\//);
    });

    it("gives the absolute URL of a route, as the links of the app give it", () => {
        expect(routeUrl(FALLBACK, "")).toBe(FALLBACK);
        expect(routeUrl(FALLBACK, "docs/concepts/rules")).toBe("https://mark1russell7.github.io/AsyncBrowserContext/docs/concepts/rules");
        expect(routeUrl(FALLBACK, "/docs/")).toBe("https://mark1russell7.github.io/AsyncBrowserContext/docs");
        expect(routeUrl(FALLBACK, "docs/a b")).toBe("https://mark1russell7.github.io/AsyncBrowserContext/docs/a%20b");
    });
});

describe("sitemap", () => {
    it("lists each URL one time, with escapes", () => {
        const xml = sitemapXml([{ url : "https://example.com/" }, { url : "https://example.com/a?b=1&c=2" }, { url : "https://example.com/" }]);
        expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
        expect(xml.match(/<url>/g)).toHaveLength(2);
        expect(xml).toContain("<loc>https://example.com/</loc>");
        expect(xml).toContain("<loc>https://example.com/a?b=1&amp;c=2</loc>");
        expect(xml).not.toContain("<lastmod>");
        expect(xml.trimEnd().endsWith("</urlset>")).toBe(true);
    });

    it("gives the date of the last change of a page when it is known", () => {
        const xml = sitemapXml([{ url : "https://example.com/a", lastmod : "2026-10-12T17:06:00+02:00" }, { url : "https://example.com/b", lastmod : undefined }]);
        expect(xml).toContain("    <url>\n        <loc>https://example.com/a</loc>\n        <lastmod>2026-10-12T17:06:00+02:00</lastmod>\n    </url>");
        expect(xml).toContain("    <url>\n        <loc>https://example.com/b</loc>\n    </url>");
    });
});

describe("route links", () => {
    it("gives the link of a route below the base of Vite", () => {
        expect(routeHref("/AsyncBrowserContext/", "docs/concepts/rules")).toBe("/AsyncBrowserContext/docs/concepts/rules");
        expect(routeHref("/", "docs/a b")).toBe("/docs/a%20b");
        expect(routeHref("https://cdn.example.com/x/", "")).toBe("https://cdn.example.com/x/");
    });
});
