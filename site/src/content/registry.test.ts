import { describe, expect, it, vi } from "vitest";
import { createContentRegistry, folderLabel, parseContentKey, slugOf } from "./registry";
import type { ContentEntry, ContentModule } from "./types";

const module : ContentModule = { default : () => null, toc : [] };

function entry(key : string, title : string, order : number, extra : Record<string, unknown> = {}) : ContentEntry {
    return {
        key : `../../content/${key}`,
        frontmatter : { title, description : `${title}.`, order, ...extra },
        load : () => Promise.resolve(module),
    };
}

const entries : ContentEntry[] = [
    entry("docs/index.mdx", "Overview", 1),
    entry("docs/getting-started.mdx", "Getting started", 2),
    entry("docs/concepts/event-loop.mdx", "The event loop", 10),
    entry("docs/concepts/page-lifecycle.mdx", "Page lifecycle", 11),
    entry("docs/monitors/index.mdx", "All monitors", 20),
    entry("docs/monitors/drift-lag.mdx", "DriftLag", 21),
    entry("docs/architecture.mdx", "Architecture", 40),
    entry("docs/operations/grafana-stack.mdx", "Grafana stack", 50),
    entry("thesis/index.mdx", "Thesis", 1),
];

describe("parseContentKey", () => {
    it("splits a glob key into the section and the file", () => {
        expect(parseContentKey("../../content/docs/concepts/event-loop.mdx")).toEqual({ section : "docs", file : "concepts/event-loop" });
        expect(parseContentKey("/content/thesis/index.mdx")).toEqual({ section : "thesis", file : "index" });
    });

    it("rejects a file that is not in a section folder", () => {
        expect(parseContentKey("../../content/loose.mdx")).toBeUndefined();
    });
});

describe("slugOf and folderLabel", () => {
    it("removes index from the path", () => {
        expect(slugOf("index")).toBe("");
        expect(slugOf("monitors/index")).toBe("monitors");
        expect(slugOf("concepts/event-loop")).toBe("concepts/event-loop");
    });

    it("makes a label from a folder name", () => {
        expect(folderLabel("getting-started")).toBe("Getting started");
        expect(folderLabel("concepts")).toBe("Concepts");
    });
});

describe("createContentRegistry", () => {
    const registry = createContentRegistry(entries, { sourceRoot : "packages/site/content" });

    it("finds pages by section and slug", () => {
        const page = registry.page("docs", "concepts/event-loop");
        expect(page?.path).toBe("/docs/concepts/event-loop");
        expect(page?.sourcePath).toBe("packages/site/content/docs/concepts/event-loop.mdx");
        expect(page?.group).toBe("concepts");
        expect(registry.page("docs", "")?.meta.title).toBe("Overview");
        expect(registry.page("docs", "/monitors/")?.meta.title).toBe("All monitors");
        expect(registry.page("docs", "missing")).toBeUndefined();
    });

    it("lists the sections", () => {
        expect(registry.sections()).toEqual(["docs", "thesis"]);
    });

    it("orders the sidebar by order, with each folder as one group", () => {
        const sidebar = registry.sidebar("docs").map(item => (item.kind === "page" ? item.page.meta.title : `[${item.label}]`));
        expect(sidebar).toEqual(["Overview", "Getting started", "[Concepts]", "[Monitors]", "Architecture", "[Operations]"]);
    });

    it("reads the pages in sidebar order", () => {
        expect(registry.pages("docs").map(page => page.slug)).toEqual([
            "",
            "getting-started",
            "concepts/event-loop",
            "concepts/page-lifecycle",
            "monitors",
            "monitors/drift-lag",
            "architecture",
            "operations/grafana-stack",
        ]);
    });

    it("gives the previous and the next page", () => {
        const page = registry.page("docs", "monitors")!;
        const { previous, next } = registry.neighbors(page);
        expect(previous?.slug).toBe("concepts/page-lifecycle");
        expect(next?.slug).toBe("monitors/drift-lag");
        expect(registry.neighbors(registry.page("docs", "")!).previous).toBeUndefined();
    });

    it("has no problems for valid entries", () => {
        expect(registry.problems()).toEqual([]);
    });

    it("loads a page module only once", async () => {
        const load = vi.fn(() => Promise.resolve(module));
        const single = createContentRegistry([{ ...entry("docs/a.mdx", "A", 1), load }], { sourceRoot : "content" });
        const page = single.page("docs", "a")!;
        expect(page.load()).toBe(page.load());
        await page.load();
        expect(load).toHaveBeenCalledTimes(1);
    });

    it("reports invalid frontmatter and duplicate paths", () => {
        const broken = createContentRegistry([
            { key : "../../content/docs/a.mdx", frontmatter : { title : "A" }, load : () => Promise.resolve(module) },
            entry("docs/b.mdx", "B", 1),
            entry("docs/b/index.mdx", "B again", 2),
        ], { sourceRoot : "content" });
        const messages = broken.problems().map(problem => `${problem.sourcePath}: ${problem.message}`);
        expect(messages).toContain("content/docs/a.mdx: Add a `description` (text).");
        expect(messages).toContain("content/docs/a.mdx: Add an `order` (a number).");
        expect(messages.some(message => message.includes("The path /docs/b is also the path of"))).toBe(true);
        expect(broken.page("docs", "a")?.meta.status).toBe("draft");
    });
});
