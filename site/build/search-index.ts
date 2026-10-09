import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import GithubSlugger from "github-slugger";
import { extractFrontmatter } from "./frontmatter.ts";

/** One heading of a page, with the ID that `rehype-slug` gives it. */
export type SearchHeading = { text : string; id : string };

/** One page in the search index. */
export type SearchEntry = {
    /** The route after the base URL, for example "docs/concepts/rules". */
    path : string;
    /** The section of the page, for example "Docs". */
    section : string;
    title : string;
    description : string;
    headings : SearchHeading[];
    /** The text of the page without Markdown, JSX and frontmatter. */
    text : string;
};

/** The most characters of text for each page. */
const TEXT_LIMIT = 8000;
const FRONTMATTER = /^﻿?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;
const FENCE = /^\s*(```|~~~)/;

/** This function removes the inline marks of Markdown: code, links, emphasis. */
function inlineText(markdown : string) : string {
    return markdown
        .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/[`*_]/g, "")
        .trim();
}

/** This function gives the `h2` and `h3` headings of an MDX source, outside code blocks. */
export function headingsOf(source : string) : SearchHeading[] {
    const slugger = new GithubSlugger();
    const headings : SearchHeading[] = [];
    let inFence = false;
    for (const line of source.replace(FRONTMATTER, "").split(/\r?\n/)) {
        if (FENCE.test(line)) {
            inFence = !inFence;
            continue;
        }
        const match = inFence ? null : /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
        if (match === null) continue;
        const text = inlineText(match[2] ?? "");
        // rehype-slug gives each heading of the page an ID, also an h1 or h4.
        const id = slugger.slug(text);
        if ((match[1] ?? "").length === 2 || (match[1] ?? "").length === 3) headings.push({ text, id });
    }
    return headings;
}

/** This function changes an MDX source into plain text: no frontmatter, imports, JSX or Markdown marks. */
export function plainText(source : string) : string {
    return source
        .replace(FRONTMATTER, "")
        .replace(/^\s*(import|export)\s.*$/gm, " ")
        .replace(/^\s*(```|~~~).*$/gm, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/^\s*\|?\s*-{3,}.*$/gm, " ")
        .replace(/[`*_>#|]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, TEXT_LIMIT);
}

/** This function gives the paths of the MDX files in `dir`, relative to `dir`. */
export async function mdxFiles(dir : string, prefix = "") : Promise<string[]> {
    const files : string[] = [];
    for (const entry of await readdir(dir, { withFileTypes : true })) {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) files.push(...await mdxFiles(path.join(dir, entry.name), relative));
        else if (entry.name.endsWith(".mdx")) files.push(relative);
    }
    return files.sort();
}

/** This function makes the search index of all the MDX pages in `contentDir`. Draft pages are not in it. */
export async function buildSearchIndex(contentDir : string) : Promise<SearchEntry[]> {
    const entries : SearchEntry[] = [];
    for (const file of await mdxFiles(contentDir)) {
        const source = await readFile(path.join(contentDir, file), "utf8");
        const meta = extractFrontmatter(source);
        if (meta["status"] === "draft") continue;
        const route = file.replace(/\.mdx$/, "").replace(/(^|\/)index$/, "");
        const first = route.split("/")[0] ?? "";
        entries.push({
            path : route,
            section : first.charAt(0).toUpperCase() + first.slice(1),
            title : typeof meta["title"] === "string" ? meta["title"] : route,
            description : typeof meta["description"] === "string" ? meta["description"] : "",
            headings : headingsOf(source),
            text : plainText(source),
        });
    }
    return entries;
}
