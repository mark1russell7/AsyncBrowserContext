import { CONTENT_SOURCE_ROOT, globContentEntries } from "./glob-source";
import { createContentRegistry } from "./registry";
import type { ContentRegistry } from "./types";

/** The registry of every content page in the site. */
export const siteContent : ContentRegistry = createContentRegistry(globContentEntries(), {
    sourceRoot : CONTENT_SOURCE_ROOT,
});
