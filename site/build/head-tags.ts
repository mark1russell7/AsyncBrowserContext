import { routeUrl } from "./site-url.ts";
import { escapeHtml, type StaticRoute } from "./static-routes.ts";

/** Facts about the site and the library, for the head tags of each page. */
export type SiteFacts = {
    /** The absolute URL of the site, with a slash at the end. */
    url : string;
    name : string;
    /** The description of the library, from the root `package.json`. */
    softwareDescription : string;
    repository : string;
    /** The SPDX ID of the license, for example "MIT". */
    license : string;
    version? : string;
    author? : string;
};

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/** The language and the platforms of the library, for the structured data. */
const PROGRAMMING_LANGUAGE = "TypeScript";
const RUNTIME_PLATFORMS = ["Web browsers", "Node.js"];

/** The file of the Open Graph image of a route, in the build output: "og/index.png" for the home page. */
export function ogImageFile(route : StaticRoute) : string {
    return `og/${route.path === "" ? "index" : route.path}.png`;
}

/** "docs" gives "Docs", and "getting-started" gives "Getting started", as the navigation shows section names. */
export function sectionLabel(segment : string) : string {
    const words = segment.replace(/[-_]+/g, " ").trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The text alternative of the Open Graph image of a route. */
export function ogImageAlt(route : StaticRoute, site : SiteFacts) : string {
    return route.path === ""
        ? `${site.name}: ${route.heading}. A tree of context frames on graph paper.`
        : `${route.heading}, a page of the ${site.name} site. A tree of context frames on graph paper.`;
}

export type Crumb = { name : string; path : string };

/**
 * The breadcrumb trail of a route: the home page, each parent route that
 * exists, and the route. A section page (one segment) has the section name.
 * A route with more segments has its title.
 */
export function breadcrumbs(route : StaticRoute, routes : readonly StaticRoute[], site : SiteFacts) : Crumb[] {
    const byPath = new Map(routes.map(candidate => [candidate.path, candidate]));
    const crumbs : Crumb[] = [{ name : site.name, path : "" }];
    if (route.path === "") return crumbs;
    const segments = route.path.split("/");
    for (let count = 1; count <= segments.length; count += 1) {
        const prefix = segments.slice(0, count).join("/");
        const found = prefix === route.path ? route : byPath.get(prefix);
        if (!found) continue;
        crumbs.push({ name : count === 1 ? sectionLabel(prefix) : found.heading, path : prefix });
    }
    return crumbs;
}

function licenseUrl(spdx : string) : string {
    return `https://opensource.org/licenses/${encodeURIComponent(spdx)}`;
}

/**
 * The schema.org data of a route, as JSON-LD. The home page gets the site and
 * the library. Each other page gets an article and its breadcrumbs.
 */
export function structuredData(route : StaticRoute, routes : readonly StaticRoute[], site : SiteFacts) : Record<string, unknown> {
    const websiteId = `${site.url}#website`;
    const softwareId = `${site.url}#software`;
    if (route.path === "") {
        return {
            "@context" : "https://schema.org",
            "@graph" : [
                {
                    "@type" : "WebSite",
                    "@id" : websiteId,
                    url : site.url,
                    name : site.name,
                    ...(route.description === undefined ? {} : { description : route.description }),
                    inLanguage : "en",
                },
                {
                    "@type" : "SoftwareSourceCode",
                    "@id" : softwareId,
                    name : site.name,
                    description : site.softwareDescription,
                    url : site.url,
                    codeRepository : site.repository,
                    programmingLanguage : PROGRAMMING_LANGUAGE,
                    runtimePlatform : RUNTIME_PLATFORMS,
                    license : licenseUrl(site.license),
                    ...(site.version === undefined ? {} : { version : site.version }),
                    ...(site.author === undefined ? {} : { author : { "@type" : "Person", name : site.author } }),
                },
            ],
        };
    }
    const url = routeUrl(site.url, route.path);
    return {
        "@context" : "https://schema.org",
        "@graph" : [
            {
                "@type" : "TechArticle",
                "@id" : `${url}#article`,
                headline : route.heading,
                ...(route.description === undefined ? {} : { description : route.description }),
                url,
                mainEntityOfPage : url,
                image : routeUrl(site.url, ogImageFile(route)),
                inLanguage : "en",
                isPartOf : { "@type" : "WebSite", "@id" : websiteId, name : site.name, url : site.url },
                about : { "@type" : "SoftwareSourceCode", "@id" : softwareId, name : site.name, codeRepository : site.repository },
            },
            {
                "@type" : "BreadcrumbList",
                itemListElement : breadcrumbs(route, routes, site).map((crumb, index) => ({
                    "@type" : "ListItem",
                    position : index + 1,
                    name : crumb.name,
                    item : routeUrl(site.url, crumb.path),
                })),
            },
        ],
    };
}

/** JSON for a script element. Each "<" becomes an escape, so the text cannot close the element. */
export function jsonForScript(value : unknown) : string {
    const escape = (character : string) : string => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`;
    return JSON.stringify(value).replace(/[<>&]/g, escape).replace(new RegExp(`[${String.fromCharCode(0x2028, 0x2029)}]`, "g"), escape);
}

/**
 * The head tags of a route: the canonical URL, Open Graph, the Twitter card,
 * the sitemap and the JSON-LD data. The title and the description are
 * already in the template (refer to `routeHtml`).
 */
export function headTags(route : StaticRoute, routes : readonly StaticRoute[], site : SiteFacts, fallbackDescription : string) : string {
    const url = routeUrl(site.url, route.path);
    const image = routeUrl(site.url, ogImageFile(route));
    const description = route.description ?? fallbackDescription;
    const title = route.path === "" ? route.title : route.heading;
    const alt = ogImageAlt(route, site);
    const meta = (attribute : "name" | "property", key : string, value : string) : string =>
        `<meta ${attribute}="${key}" content="${escapeHtml(value)}" />`;
    const tags = [
        `<link rel="canonical" href="${escapeHtml(url)}" />`,
        meta("property", "og:type", route.path === "" ? "website" : "article"),
        meta("property", "og:site_name", site.name),
        meta("property", "og:title", title),
        meta("property", "og:description", description),
        meta("property", "og:url", url),
        meta("property", "og:image", image),
        meta("property", "og:image:type", "image/png"),
        meta("property", "og:image:width", String(OG_IMAGE_WIDTH)),
        meta("property", "og:image:height", String(OG_IMAGE_HEIGHT)),
        meta("property", "og:image:alt", alt),
        ...(route.path === "" ? [] : [meta("property", "article:section", sectionLabel(route.path.split("/")[0] ?? ""))]),
        meta("name", "twitter:card", "summary_large_image"),
        meta("name", "twitter:title", title),
        meta("name", "twitter:description", description),
        meta("name", "twitter:image", image),
        meta("name", "twitter:image:alt", alt),
        `<link rel="sitemap" type="application/xml" href="${escapeHtml(routeUrl(site.url, "sitemap.xml"))}" />`,
        `<script type="application/ld+json">${jsonForScript(structuredData(route, routes, site))}</script>`,
    ];
    return tags.map(tag => `        ${tag}`).join("\n");
}
