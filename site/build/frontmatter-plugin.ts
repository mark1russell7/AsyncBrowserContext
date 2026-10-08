import { readFile } from "node:fs/promises";
import type { Plugin } from "vite";
import { extractFrontmatter, isFrontmatterRequest, stripQuery } from "./frontmatter.ts";

/**
 * This plugin serves `page.mdx?frontmatter` as a small module that exports
 * only the frontmatter of the page. The content registry imports these
 * modules eagerly, so each page component can stay in its own lazy chunk.
 */
export function mdxFrontmatterPlugin() : Plugin {
    return {
        name : "abc-site:mdx-frontmatter",
        enforce : "pre",
        async load(id) {
            if (!isFrontmatterRequest(id)) return null;
            const file = stripQuery(id);
            this.addWatchFile(file);
            const source = await readFile(file, "utf8");
            return { code : `export default ${JSON.stringify(extractFrontmatter(source))};\n`, map : null };
        },
    };
}
