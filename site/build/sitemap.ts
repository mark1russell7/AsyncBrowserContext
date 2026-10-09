function escapeXml(text : string) : string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/**
 * The sitemap of the site (https://www.sitemaps.org/protocol.html): one
 * entry for each absolute URL. The URLs must be below the folder of the
 * sitemap, so the build writes the file at the root of the site.
 */
export function sitemapXml(urls : readonly string[]) : string {
    const entries = [...new Set(urls)].map(url => `    <url>\n        <loc>${escapeXml(url)}</loc>\n    </url>`);
    return [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
        ...entries,
        `</urlset>`,
        ``,
    ].join("\n");
}
