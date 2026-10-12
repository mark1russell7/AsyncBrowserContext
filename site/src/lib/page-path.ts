/**
 * The path of a page without the name of its HTML file. GitHub Pages also
 * serves a page at the name of its file, for example "/docs.html" for
 * "/docs", and "/docs/index.html" for "/docs/". The router knows only the
 * path without the file name.
 *
 * - "/AsyncBrowserContext/docs.html" gives "/AsyncBrowserContext/docs".
 * - "/AsyncBrowserContext/index.html" gives "/AsyncBrowserContext/".
 * - Each other path stays the same.
 */
export function pathWithoutHtmlFile(pathname : string) : string {
    if (pathname.endsWith("/index.html")) return pathname.slice(0, -"index.html".length);
    if (pathname.endsWith(".html") && !pathname.endsWith("/.html")) return pathname.slice(0, -".html".length);
    return pathname;
}
