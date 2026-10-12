/**
 * This function gives the absolute URL of the published site, with a slash
 * at the end. The value comes from the `SITE_URL` environment variable
 * (refer to `.github/workflows/pages.yml`). Without it, the function uses
 * `fallback`: the `homepage` of the root `package.json`.
 */
export function resolveSiteUrl(value : string | undefined, fallback : string) : string {
    const text = (value ?? "").trim() || fallback.trim();
    let url : URL;
    try {
        url = new URL(text);
    } catch {
        throw new Error(`SITE_URL must be an absolute URL, for example https://owner.github.io/repository/. The value is "${text}".`);
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new Error(`SITE_URL must start with https:// or http://. The value is "${text}".`);
    }
    url.search = "";
    url.hash = "";
    if (!url.pathname.endsWith("/")) url.pathname = `${url.pathname}/`;
    return url.href;
}

/**
 * The absolute URL of a route. The route "" gives the site URL. The route
 * "docs/api" gives "<site URL>docs/api", with no slash at the end. The links
 * of the app use the same form.
 */
export function routeUrl(siteUrl : string, routePath : string) : string {
    return new URL(encodedRoute(routePath), siteUrl).href;
}

function encodedRoute(routePath : string) : string {
    return routePath.split("/").filter(segment => segment !== "").map(encodeURIComponent).join("/");
}

/**
 * The link of a route below the base of Vite (refer to `normalizeBase`),
 * for example "/AsyncBrowserContext/docs/api". The links of the app use the same form.
 */
export function routeHref(base : string, routePath : string) : string {
    return `${base.endsWith("/") ? base : `${base}/`}${encodedRoute(routePath)}`;
}
