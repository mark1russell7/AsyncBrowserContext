import type { ContentEntry, ContentModule } from "./types";

/** The content folder, from the repository root. */
export const CONTENT_SOURCE_ROOT = "site/content";

// The frontmatter loads eagerly through `?frontmatter` (see build/frontmatter-plugin.ts).
// Each page component loads lazily, in its own chunk.
const frontmatters = import.meta.glob<unknown>("../../content/**/*.mdx", {
    eager : true,
    query : "?frontmatter",
    import : "default",
});
const modules = import.meta.glob<ContentModule>("../../content/**/*.mdx");

/** Every `.mdx` file in `site/content`. To add a page, add a file. */
export function globContentEntries() : ContentEntry[] {
    return Object.entries(modules).map(([key, load]) => ({ key, frontmatter : frontmatters[key], load }));
}
