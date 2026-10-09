import path from "node:path";
import type { Plugin } from "vite";
import { buildSearchIndex, mdxFiles } from "./search-index.ts";

/** The ID of the module that gives the search index. */
export const SEARCH_INDEX_ID = "virtual:search-index";
const RESOLVED_ID = `\0${SEARCH_INDEX_ID}`;

/**
 * This plugin serves `virtual:search-index`: the title, the description, the
 * headings and the text of each MDX page. The search dialog loads it when the
 * reader opens the dialog the first time.
 */
export function searchPlugin() : Plugin {
    let contentDir = "";
    return {
        name : "abc-site:search-index",
        configResolved(config) {
            contentDir = path.join(config.root, "content");
        },
        resolveId(id) {
            return id === SEARCH_INDEX_ID ? RESOLVED_ID : null;
        },
        async load(id) {
            if (id !== RESOLVED_ID) return null;
            for (const file of await mdxFiles(contentDir)) this.addWatchFile(path.join(contentDir, file));
            const entries = await buildSearchIndex(contentDir);
            return { code : `export default ${JSON.stringify(entries)};\n`, map : null };
        },
    };
}
