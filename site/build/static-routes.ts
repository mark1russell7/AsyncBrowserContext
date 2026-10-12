import { characterEntities } from "character-entities";
import { SITE_NAME } from "../src/app/site.ts";
import { firstPageBelow } from "../src/content/registry.ts";
import { contentRegistryOf, readContentFiles, type ContentFile } from "./content-files.ts";

/** One page that the build writes as its own HTML file. */
export type StaticRoute = {
    /** The path after the base URL, without slashes at the ends, for example "docs/concepts/rules". The home page is "". */
    path : string;
    /** The document title, for example "Context rules – async-browser-context". */
    title : string;
    /** The title of the page without the site name, for example "Context rules". */
    heading : string;
    description? : string;
    /** True for a draft page (refer to `ContentFile.draft`). Search engines must not index it, and it is not in the sitemap. */
    draft? : boolean;
    /** The MDX file of a content page, relative to the content folder, for example "docs/concepts/rules.mdx". */
    file? : string;
};

export function escapeHtml(text : string) : string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The character of a numeric character reference. A code point that HTML does not permit gives U+FFFD, as in a browser. */
function codePointText(codePoint : number) : string {
    const invalid = codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff);
    return String.fromCodePoint(invalid ? 0xfffd : codePoint);
}

/**
 * This function decodes the character references of an HTML text: each
 * named reference of HTML ("&amp;", "&mdash;"), and each numeric reference
 * ("&#8211;", "&#x2013;"). A reference that HTML does not know stays as it is.
 */
export function unescapeHtml(text : string) : string {
    return text.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([A-Za-z][A-Za-z0-9]*));/g, (reference : string, decimal? : string, hex? : string, name? : string) : string => {
        if (decimal !== undefined) return codePointText(Number.parseInt(decimal, 10));
        if (hex !== undefined) return codePointText(Number.parseInt(hex, 16));
        return (name !== undefined && Object.hasOwn(characterEntities, name) ? characterEntities[name] : undefined) ?? reference;
    });
}

/** The static route of a content page. */
function contentRoute(page : ContentFile) : StaticRoute {
    return {
        path : page.route,
        title : `${page.meta.title} – ${SITE_NAME}`,
        heading : page.meta.title,
        ...(page.meta.description === "" ? {} : { description : page.meta.description }),
        ...(page.draft ? { draft : true } : {}),
        file : page.file,
    };
}

/**
 * This function gives the routes of the content pages, as the content
 * registry gives them: "docs/index.mdx" is "docs", and
 * "docs/concepts/rules.mdx" is "docs/concepts/rules". The title is
 * the title in the frontmatter, as the page shows it.
 */
export async function contentRoutes(contentDir : string) : Promise<StaticRoute[]> {
    return (await readContentFiles(contentDir)).map(contentRoute).sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * The route of the home page. The title and the description come from
 * `index.html`, because the home page uses them too. The heading is the text
 * after the first colon of the title, or the full title.
 */
export function homeRoute(template : string) : StaticRoute {
    const title = unescapeHtml(/<title>([\s\S]*?)<\/title>/.exec(template)?.[1]?.trim() ?? SITE_NAME);
    const description = /<meta name="description" content="([^"]*)"/.exec(template)?.[1];
    const colon = title.indexOf(": ");
    return {
        path : "",
        title,
        heading : colon < 0 ? title : title.slice(colon + 2),
        ...(description === undefined ? {} : { description : unescapeHtml(description) }),
    };
}

/** Every page of the site: the home page, then each content page in path order. New MDX files add routes. */
export async function siteRoutes(template : string, contentDir : string) : Promise<StaticRoute[]> {
    return [homeRoute(template), ...await contentRoutes(contentDir)];
}

/**
 * This function gives the HTML of one route: the HTML of the app with the
 * title and the description of the route. The app replaces both when it
 * starts. A search engine and a link preview read them before that.
 */
export function routeHtml(template : string, route : StaticRoute) : string {
    let html = template.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escapeHtml(route.title)}</title>`);
    if (route.description !== undefined) {
        const description = route.description;
        html = html.replace(/<meta name="description" content="[^"]*"\s*\/?>/, () => `<meta name="description" content="${escapeHtml(description)}" />`);
    }
    return html;
}

/** A folder of the content without a page of its own, and the page that the reader goes to. */
export type FolderRedirect = {
    /** The path of the folder, for example "docs/concepts". */
    path : string;
    /** The route of the first page below the folder, in reading order. */
    target : StaticRoute;
};

/**
 * This function gives a redirect for each folder of the content routes that
 * has no page of its own. Without it, GitHub Pages answers "docs/concepts"
 * with a redirect to "docs/concepts/", and that path has no file. The target
 * is the page that the app shows for the folder (refer to `firstPageBelow`).
 */
export async function folderRedirects(contentDir : string) : Promise<FolderRedirect[]> {
    const pages = await readContentFiles(contentDir);
    const registry = contentRegistryOf(pages);
    const routes = new Map(pages.map(page => [page.route, contentRoute(page)]));
    const folders = new Set<string>();
    for (const route of routes.keys()) {
        const segments = route.split("/");
        for (let count = 1; count < segments.length; count += 1) folders.add(segments.slice(0, count).join("/"));
    }
    const redirects : FolderRedirect[] = [];
    for (const folder of [...folders].sort()) {
        if (routes.has(folder)) continue;
        const [section = "", ...rest] = folder.split("/");
        const first = firstPageBelow(registry, section, rest.join("/"));
        const target = first === undefined ? undefined : routes.get(first.path.slice(1));
        if (target !== undefined) redirects.push({ path : folder, target });
    }
    return redirects;
}

/**
 * The HTML file of a folder redirect. The browser goes to the target at once.
 * Search engines get the target as the canonical URL, and do not index the folder.
 */
export function redirectHtml(redirect : FolderRedirect, targetHref : string, canonicalUrl : string) : string {
    const href = escapeHtml(targetHref);
    return [
        `<!doctype html>`,
        `<html lang="en">`,
        `    <head>`,
        `        <meta charset="UTF-8" />`,
        `        <title>${escapeHtml(redirect.target.title)}</title>`,
        `        <meta name="robots" content="noindex" />`,
        `        <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`,
        `        <meta http-equiv="refresh" content="0; url=${href}" />`,
        `    </head>`,
        `    <body>`,
        `        <p>Go to <a href="${href}">${escapeHtml(redirect.target.heading)}</a>.</p>`,
        `    </body>`,
        `</html>`,
        ``,
    ].join("\n");
}

/**
 * The files of one route. GitHub Pages serves "rules.html" for the path
 * "rules". A route that is also a folder, for example "docs/concepts",
 * also gets "docs/concepts/index.html", for the path with a slash at the end.
 * The home page is "index.html".
 */
export function routeFiles(route : Pick<StaticRoute, "path">) : string[] {
    return route.path === "" ? ["index.html"] : [`${route.path}.html`, `${route.path}/index.html`];
}
