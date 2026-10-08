/**
 * This function normalizes the `SITE_BASE` value (for example `AsyncBrowserContext` or
 * `/AsyncBrowserContext`) to a path that starts and ends with a slash, as Vite needs. An
 * empty value gives `/`.
 * A full URL (for example a CDN address) only gets a slash at the end.
 */
export function normalizeBase(value : string | undefined) : string {
    const trimmed = (value ?? "").trim();
    if (trimmed === "" || trimmed === "/") return "/";
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
    const leading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    return leading.endsWith("/") ? leading : `${leading}/`;
}
