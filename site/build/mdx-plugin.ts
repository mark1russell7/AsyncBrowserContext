import mdx from "@mdx-js/rollup";
import rehypeShiki from "@shikijs/rehype";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSlug from "rehype-slug";
import type { Plugin } from "vite";
import { CODE_LANGUAGES, CODE_THEMES } from "./highlight.ts";
import { isFrontmatterRequest } from "./frontmatter.ts";
import { REMARK_PLUGINS } from "./mdx-pipeline.ts";
import { rehypeExportToc } from "./rehype-export-toc.ts";

/**
 * This plugin compiles `.mdx` pages. Each page module exports:
 * - `default`: the page component
 * - `frontmatter`: the YAML frontmatter
 * - `toc`: the `h2` and `h3` headings
 *
 * The wrapper skips `page.mdx?frontmatter` requests, which
 * `mdxFrontmatterPlugin` serves.
 */
export function mdxPlugin() : Plugin {
    const inner = mdx({
        remarkPlugins : REMARK_PLUGINS,
        rehypePlugins : [
            // Each code block gets the colors of the light and the dark theme as CSS variables.
            [rehypeShiki, { themes : CODE_THEMES, defaultColor : false, langs : CODE_LANGUAGES, fallbackLanguage : "text" }],
            // The search index also gives the headings the IDs of rehype-slug (refer to `mdx-pipeline.ts`).
            rehypeSlug,
            rehypeExportToc,
            [rehypeAutolinkHeadings, { behavior : "wrap", properties : { className : ["heading-anchor"] } }],
        ],
    });

    return {
        name : "abc-site:mdx",
        enforce : "pre",
        config(config, env) {
            inner.config(config, env);
        },
        async transform(code, id) {
            if (isFrontmatterRequest(id)) return undefined;
            const result = await inner.transform(code, id);
            if (result === undefined) return undefined;
            return { code : result.code, ...(result.map === undefined ? {} : { map : result.map }) };
        },
    };
}
