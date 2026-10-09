import { describe, expect, it } from "vitest";
import type { SiteFacts } from "./head-tags";
import { ogCard, ogImageHtml } from "./og-image";
import { prerenderEnabled } from "./spa-fallback-plugin";

const SITE : SiteFacts = {
    url : "https://owner.github.io/Repo/",
    name : "async-browser-context",
    softwareDescription : "The library.",
    repository : "https://github.com/owner/Repo",
    license : "MIT",
};

describe("Open Graph images", () => {
    it("gives a content page its sections, its title and its description", () => {
        expect(ogCard({ path : "docs/concepts/rules", title : "Context rules – abc", heading : "Context rules", description : "The rules." }, SITE, "Fallback."))
            .toEqual({ eyebrow : "Docs / Concepts", title : "Context rules", description : "The rules.", siteName : "async-browser-context", address : "owner.github.io/Repo" });
        expect(ogCard({ path : "docs", title : "Overview – abc", heading : "Overview" }, SITE, "Fallback."))
            .toMatchObject({ eyebrow : "Docs", description : "Fallback." });
    });

    it("gives the home page the kind of project and its license", () => {
        expect(ogCard({ path : "", title : "abc: x", heading : "x" }, SITE, "Fallback.").eyebrow).toBe("TypeScript library · MIT license");
    });

    it("escapes the text and uses the fonts of the site", () => {
        const html = ogImageHtml(
            { eyebrow : "Docs", title : "<b>Bold</b> & co", description : "1 < 2", siteName : "abc", address : "a.b/c" },
            { sans : ["url(sans.woff2)"], mono : ["url(mono.woff2)"] },
        );
        expect(html).toContain("&lt;b&gt;Bold&lt;/b&gt; &amp; co");
        expect(html).toContain("1 &lt; 2");
        expect(html).toContain(`@font-face{font-family:"Atkinson Hyperlegible Next";src:url(sans.woff2)`);
        expect(html).toContain(`@font-face{font-family:"Atkinson Hyperlegible Mono";src:url(mono.woff2)`);
        expect(html).toContain("width: 1200px; height: 630px;");
    });
});

describe("prerender switch", () => {
    it("is on unless SITE_PRERENDER is 0, false, no or off", () => {
        expect(prerenderEnabled(undefined)).toBe(true);
        expect(prerenderEnabled("1")).toBe(true);
        for (const value of ["0", "false", "NO", " off "]) expect(prerenderEnabled(value)).toBe(false);
    });
});
