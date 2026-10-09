import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { asyncContext } from "../src/vite/plugin.ts";
import { debuggerPlugin } from "./build/debugger-plugin.ts";
import { normalizeBase } from "./build/base.ts";
import { mdxFrontmatterPlugin } from "./build/frontmatter-plugin.ts";
import { mdxPlugin } from "./build/mdx-plugin.ts";
import { spaFallbackPlugin } from "./build/spa-fallback-plugin.ts";
import { transformExamplesPlugin } from "./build/transform-examples-plugin.ts";

const siteDir = fileURLToPath(new URL(".", import.meta.url));

/** The Babel packages import node:path and node:assert. In the browser, the playground gives them these modules. */
export const BABEL_BROWSER_ALIASES = [
    { find : /^(node:)?path$/, replacement : "pathe" },
    { find : /^(node:)?assert$/, replacement : path.resolve(siteDir, "src/playground/assert-shim.ts") },
];
const librarySource = (file : string) : string => path.resolve(siteDir, "..", "src", file);

/** The site files that the library transforms. The module of the "untransformed dependency" demo stays as it is. */
function isSiteModule(id : string) : boolean {
    const normalized = id.replace(/\\/g, "/");
    return (normalized.includes("/site/src/") || normalized.includes("/site/content/"))
        && !normalized.includes("/untransformed-dependency");
}

export default defineConfig({
    // Set SITE_BASE to deploy below a path, as GitHub Pages does: SITE_BASE=AsyncBrowserContext
    // gives /AsyncBrowserContext/. (Git Bash on Windows changes "/x" into a Windows path, so
    // there use the form without slashes.)
    base : normalizeBase(process.env["SITE_BASE"]),
    plugins : [
        mdxFrontmatterPlugin(),
        mdxPlugin(),
        react({ include : /\.(mdx|js|jsx|ts|tsx)$/ }),
        transformExamplesPlugin(),
        debuggerPlugin(),
        // The site uses the library on itself: the demos run the real runtime in the page.
        asyncContext({ include : isSiteModule }),
        spaFallbackPlugin(),
    ],
    resolve : {
        alias : [
            { find : /^async-browser-context\/runtime$/, replacement : librarySource("runtime.ts") },
            { find : /^async-browser-context$/, replacement : librarySource("index.ts") },
            // Vitest runs the Node.js tests of the site with this config, and they need the real node:path.
            ...(process.env["VITEST"] === undefined ? BABEL_BROWSER_ALIASES : []),
        ],
    },
    optimizeDeps : {
        // Pre-bundle the large libraries that load lazily, so the dev server
        // (and Vitest browser mode) does not reload the page when they load.
        include : [
            "react",
            "react-dom",
            "react-dom/client",
            "react-router",
            "react-router/dom",
            "@observablehq/plot",
            "mermaid",
        ],
    },
    build : {
        target : "es2022",
        // Mermaid is large; it loads only on pages that show a diagram.
        chunkSizeWarningLimit : 1500,
    },
});
