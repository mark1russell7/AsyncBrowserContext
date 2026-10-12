function escapeXml(text : string) : string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** One page in the sitemap: its absolute URL and, if known, the date of its last change in ISO 8601 format. */
export type SitemapEntry = { url : string; lastmod? : string | undefined };

/**
 * The sitemap of the site (https://www.sitemaps.org/protocol.html): one
 * entry for each absolute URL. The URLs must be below the folder of the
 * sitemap, so the build writes the file at the root of the site.
 */
export function sitemapXml(pages : readonly SitemapEntry[]) : string {
    const seen = new Set<string>();
    const entries : string[] = [];
    for (const { url, lastmod } of pages) {
        if (seen.has(url)) continue;
        seen.add(url);
        const lines = [`        <loc>${escapeXml(url)}</loc>`, ...(lastmod === undefined ? [] : [`        <lastmod>${escapeXml(lastmod)}</lastmod>`])];
        entries.push(`    <url>\n${lines.join("\n")}\n    </url>`);
    }
    return [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
        ...entries,
        `</urlset>`,
        ``,
    ].join("\n");
}
