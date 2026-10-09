import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { SITE_NAME } from "../src/app/site.ts";
import { extractFrontmatter } from "./frontmatter.ts";

/** One page that the build writes as its own HTML file. */
export type StaticRoute = {
    /** The path after the base URL, without slashes at the ends, for example "docs/concepts/rules". The home page is "". */
    path : string;
    /** The document title, for example "Context rules – async-browser-context". */
    title : string;
    /** The title of the page without the site name, for example "Context rules". */
    heading : string;
    description? : string;
};

export function escapeHtml(text : string) : string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function unescapeHtml(text : string) : string {
    return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

async function mdxFiles(dir : string, prefix = "") : Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes : true });
    const files : string[] = [];
    for (const entry of entries) {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) files.push(...await mdxFiles(path.join(dir, entry.name), relative));
        else if (entry.name.endsWith(".mdx")) files.push(relative);
    }
    return files;
}

/**
 * This function gives the routes of the content pages, as the content
 * registry gives them: "docs/index.mdx" is "docs", and
 * "docs/concepts/rules.mdx" is "docs/concepts/rules". The title is
 * the title in the frontmatter, as the page shows it.
 */
export async function contentRoutes(contentDir : string) : Promise<StaticRoute[]> {
    const routes : StaticRoute[] = [];
    for (const file of await mdxFiles(contentDir)) {
        const meta = extractFrontmatter(await readFile(path.join(contentDir, file), "utf8"));
        const route = file.replace(/\.mdx$/, "").replace(/(^|\/)index$/, "");
        const heading = typeof meta["title"] === "string" ? meta["title"] : route;
        routes.push({
            path : route,
            title : `${heading} – ${SITE_NAME}`,
            heading,
            ...(typeof meta["description"] === "string" ? { description : meta["description"] } : {}),
        });
    }
    return routes.sort((a, b) => a.path.localeCompare(b.path));
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

/**
 * The files of one route. GitHub Pages serves "rules.html" for the path
 * "rules". A route that is also a folder, for example "docs/concepts",
 * also gets "docs/concepts/index.html", for the path with a slash at the end.
 * The home page is "index.html".
 */
export function routeFiles(route : StaticRoute) : string[] {
    return route.path === "" ? ["index.html"] : [`${route.path}.html`, `${route.path}/index.html`];
}
