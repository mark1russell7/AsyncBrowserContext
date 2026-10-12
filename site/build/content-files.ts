import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parsePageMeta } from "../src/content/frontmatter.ts";
import { createContentRegistry, fallbackTitle, parseContentKey, slugOf } from "../src/content/registry.ts";
import type { ContentRegistry, PageMeta } from "../src/content/types.ts";
import { extractFrontmatter } from "./frontmatter.ts";

/** One MDX page of the content folder, as the build reads it. */
export type ContentFile = {
    /** The path of the file in the content folder, for example "docs/concepts/rules.mdx". */
    file : string;
    /** The route of the page, as the content registry gives it, for example "docs/concepts/rules". "docs/index.mdx" is "docs". */
    route : string;
    /** The section of the page, for example "docs". */
    section : string;
    source : string;
    /** The YAML frontmatter of the source. */
    frontmatter : Record<string, unknown>;
    /** The frontmatter, with the same rules and the same safe values as the content registry (refer to `parsePageMeta`). */
    meta : PageMeta;
    /**
     * True for a draft: a page with `status: draft`, or a page with a
     * frontmatter problem. The app shows a draft with a note. The build keeps
     * it out of the sitemap and the search index, and tells search engines
     * not to index it.
     */
    draft : boolean;
};

/** This function gives the paths of the MDX files in `dir`, relative to `dir`, in path order. */
export async function mdxFiles(dir : string, prefix = "") : Promise<string[]> {
    const files : string[] = [];
    for (const entry of await readdir(dir, { withFileTypes : true })) {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) files.push(...await mdxFiles(path.join(dir, entry.name), relative));
        else if (entry.name.endsWith(".mdx")) files.push(relative);
    }
    return files.sort();
}

/**
 * This function reads each MDX page of the content folder. A file that is not
 * in a section folder is not a page of the app, so it is not in the list.
 */
export async function readContentFiles(contentDir : string) : Promise<ContentFile[]> {
    const pages : ContentFile[] = [];
    for (const file of await mdxFiles(contentDir)) {
        const parsed = parseContentKey(file);
        if (parsed === undefined) continue;
        const source = await readFile(path.join(contentDir, file), "utf8");
        const frontmatter = extractFrontmatter(source);
        const { meta } = parsePageMeta(frontmatter, fallbackTitle(parsed.file));
        const slug = slugOf(parsed.file);
        pages.push({
            file,
            route : slug === "" ? parsed.section : `${parsed.section}/${slug}`,
            section : parsed.section,
            source,
            frontmatter,
            meta,
            draft : meta.status === "draft",
        });
    }
    return pages;
}

/**
 * The content registry of the app, made from the files that the build read.
 * The build uses it for the reading order of the pages. It cannot load a page.
 */
export function contentRegistryOf(pages : readonly ContentFile[]) : ContentRegistry {
    const entries = pages.map(page => ({
        key : page.file,
        frontmatter : page.frontmatter,
        load : () => Promise.reject(new Error(`The build does not load the page ${page.file}.`)),
    }));
    return createContentRegistry(entries, { sourceRoot : "site/content" });
}
