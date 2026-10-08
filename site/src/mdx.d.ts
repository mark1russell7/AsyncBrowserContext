/**
 * Types of the `.mdx` page modules (see build/mdx-plugin.ts). The content
 * registry loads pages with `import.meta.glob`, so it does not need this
 * declaration; a direct `import Page from "./page.mdx"` does.
 */
declare module "*.mdx" {
    import type { MDXComponents } from "mdx/types";
    import type { ComponentType } from "react";

    export const frontmatter : Record<string, unknown>;
    export const toc : ReadonlyArray<{ id : string; depth : 2 | 3; text : string }>;

    const MDXContent : ComponentType<{ components? : MDXComponents }>;
    export default MDXContent;
}
