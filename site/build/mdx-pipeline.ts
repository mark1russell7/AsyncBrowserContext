import { createProcessor, type ProcessorOptions } from "@mdx-js/mdx";
import type { Root } from "hast";
import rehypeSlug from "rehype-slug";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMdxFrontmatter from "remark-mdx-frontmatter";
import { remarkMermaid } from "./remark-mermaid.ts";

/**
 * The remark plugins of the pages (refer to `mdx-plugin.ts`). The search
 * index uses the same plugins, so it sees the same tree as the page.
 */
export const REMARK_PLUGINS : NonNullable<ProcessorOptions["remarkPlugins"]> = [
    remarkFrontmatter,
    [remarkMdxFrontmatter, { name : "frontmatter" }],
    remarkGfm,
    remarkMermaid,
];

/**
 * This function compiles each MDX source with the remark plugins of the
 * pages and `rehype-slug`, as `mdx-plugin.ts` does. Then it gives the HTML
 * tree (hast) of each source to `read`, and gives the results in the same
 * order. Thus the headings have the IDs and the text of the page.
 */
export async function readPageTrees<T>(sources : readonly { source : string; path : string }[], read : (tree : Root) => T) : Promise<T[]> {
    const results : T[] = [];
    const processor = createProcessor({
        remarkPlugins : REMARK_PLUGINS,
        rehypePlugins : [rehypeSlug, () => (tree : Root) => {
            results.push(read(tree));
        }],
    });
    for (const [index, { source, path }] of sources.entries()) {
        await processor.process({ value : source, path });
        if (results.length !== index + 1) throw new Error(`The MDX compiler gave no tree for ${path}.`);
    }
    return results;
}
