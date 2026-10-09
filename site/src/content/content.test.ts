import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { siteContent } from "./site-content";

/** The pages that the site must have. */
const REQUIRED : Readonly<Record<string, readonly string[]>> = {
    docs : [
        "",
        "getting-started",
        "concepts/contexts-and-frames",
        "concepts/rules",
        "concepts/transform",
        "concepts/patched-apis",
        "concepts/limits",
        "api",
        "guides/request-tracing",
        "guides/logging",
        "guides/error-reports",
        "guides/react",
        "guides/testing-with-vitest",
        "design",
        "contributing/writing-style",
    ],
    explore : ["", "debugger", "timeline", "transform", "events", "diagrams"],
    testing : ["", "results", "performance"],
};

const allPages = siteContent.sections().flatMap(section => siteContent.pages(section));

describe("site content", () => {
    it("has valid frontmatter on every page", () => {
        expect(siteContent.problems()).toEqual([]);
    });

    it("has every required page", () => {
        for (const [section, slugs] of Object.entries(REQUIRED)) {
            for (const slug of slugs) {
                expect(siteContent.page(section, slug), `${section}/${slug}`).toBeDefined();
            }
        }
    });

    it("gives each page in a section a different order", () => {
        for (const section of siteContent.sections()) {
            const orders = siteContent.pages(section).map(page => page.meta.order);
            expect(new Set(orders).size, section).toBe(orders.length);
        }
    });

    it.each(allPages.map(page => [page.path, page] as const))("compiles %s with a component and a table of contents", async (_path, page) => {
        const module = await page.load();
        expect(typeof module.default).toBe("function");
        expect(Array.isArray(module.toc)).toBe(true);
        for (const entry of module.toc ?? []) {
            expect(entry.id).toMatch(/^[a-z0-9-]+$/);
            expect([2, 3]).toContain(entry.depth);
            expect(entry.text.length).toBeGreaterThan(0);
        }
        expect(module.frontmatter).toMatchObject({ title : page.meta.title });
    });

    it("links each internal link to a page of the site", async () => {
        const paths = new Set(allPages.map(page => page.path));
        const contentDir = fileURLToPath(new URL("../../content", import.meta.url));
        const files = (await readdir(contentDir, { recursive : true })).filter(file => file.endsWith(".mdx"));
        const problems : string[] = [];
        for (const file of files) {
            const source = await readFile(path.join(contentDir, file), "utf8");
            for (const match of source.matchAll(/\]\((\/[^)#\s]*)(#[^)\s]*)?\)/g)) {
                const target = match[1]!.replace(/\/$/, "");
                if (target !== "" && !paths.has(target)) problems.push(`${file}: ${match[1]!}`);
            }
        }
        expect(problems).toEqual([]);
    });
});
