import type { Plugin } from "vite";

/** The font files that each page uses at the first paint: the Latin text font and the Latin code font. */
const PRELOAD = [/atkinson-hyperlegible-next-latin-wght-normal-[\w-]+\.woff2$/, /atkinson-hyperlegible-mono-latin-wght-normal-[\w-]+\.woff2$/];

/**
 * This plugin adds `<link rel="preload">` for the two main font files to the
 * HTML of the build. Thus the browser loads the fonts with the CSS, and the
 * first text shows in its font earlier.
 */
export function fontPreloadPlugin() : Plugin {
    let base = "/";
    return {
        name : "abc-site:font-preload",
        apply : "build",
        configResolved(config) {
            base = config.base;
        },
        transformIndexHtml : {
            order : "post",
            handler(_html, context) {
                const files = Object.keys(context.bundle ?? {}).filter(file => PRELOAD.some(pattern => pattern.test(file)));
                return files.map(file => ({
                    tag : "link",
                    attrs : { rel : "preload", as : "font", type : "font/woff2", crossorigin : "", href : `${base}${file}` },
                    injectTo : "head-prepend" as const,
                }));
            },
        },
    };
}
