import { parse } from "yaml";

/** The query that asks for only the frontmatter of an MDX file: `page.mdx?frontmatter`. */
export const FRONTMATTER_QUERY = "frontmatter";

/** This function gives the module ID without its query. */
export function stripQuery(id : string) : string {
    const index = id.indexOf("?");
    return index < 0 ? id : id.slice(0, index);
}

/** True if a module ID asks for the frontmatter of an MDX file. */
export function isFrontmatterRequest(id : string) : boolean {
    const index = id.indexOf("?");
    if (index < 0) return false;
    return stripQuery(id).endsWith(".mdx") && new URLSearchParams(id.slice(index + 1)).has(FRONTMATTER_QUERY);
}

const FRONTMATTER_RE = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function isRecord(value : unknown) : value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * This function reads the YAML frontmatter at the start of an MDX source. It
 * gives an empty object if the source has no frontmatter. The rules are the
 * same as the rules of `remark-frontmatter`: the block must be the first
 * thing in the file.
 */
export function extractFrontmatter(source : string) : Record<string, unknown> {
    const match = FRONTMATTER_RE.exec(source);
    if (!match) return {};
    const data : unknown = parse(match[1] ?? "");
    return isRecord(data) ? data : {};
}
