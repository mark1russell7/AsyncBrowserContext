import { PRERENDERED_ATTRIBUTE } from "../src/lib/readiness.ts";
import { escapeHtml, routeHtml, type StaticRoute } from "./static-routes.ts";

/** The HTML of a page after the browser rendered it. */
export type Snapshot = {
    /** The HTML in the root element. */
    body : string;
    /** The stylesheet links and module preload links that the app added to the head. */
    links : string[];
    /** The SVG attributes with a theme color, as [attribute, value] pairs. */
    colorAttributes : Array<[string, string]>;
};

/** The SVG attributes that can have a theme color. Each is also a CSS property. */
export const COLOR_ATTRIBUTES = ["fill", "stroke", "stop-color", "flood-color", "lighting-color", "color"] as const;

/** The empty root element of the app, in index.html. */
const EMPTY_ROOT = `<div id="root"></div>`;

/**
 * The CSS for a prerendered page. The theme script shows a stored theme
 * before the first frame, but the HTML of the theme button shows the system
 * theme. Thus, the button is hidden until the app shows its own HTML.
 */
const SNAPSHOT_CSS = `:root[data-theme] [${PRERENDERED_ATTRIBUTE}] [data-theme-toggle]{visibility:hidden}`;

/**
 * The color tokens of the light theme from `styles/tokens.css`, as
 * [color, token] pairs, for example ["#2a78d6", "--series-1"]. A color that
 * two tokens have is not in the list.
 */
export function colorTokens(tokensCss : string) : Array<[string, string]> {
    const block = /:root\s*\{([^}]*)\}/.exec(tokensCss)?.[1] ?? "";
    const byColor = new Map<string, string[]>();
    for (const match of block.matchAll(/(--[\w-]+)\s*:\s*#([0-9a-f]{6}|[0-9a-f]{3})\s*;/gi)) {
        const digits = match[2]!.toLowerCase();
        const color = `#${digits.length === 3 ? digits.replace(/./g, "$&$&") : digits}`;
        byColor.set(color, [...byColor.get(color) ?? [], match[1]!]);
    }
    return [...byColor].filter(([, names]) => names.length === 1).map(([color, names]) => [color, names[0]!]);
}

/**
 * This function replaces each color of a token with `var(<token>)`, in a
 * style attribute or in a style sheet. It knows "#rgb", "#rrggbb" and
 * "rgb(r, g, b)". The prerender also uses it in the browser, so it uses
 * nothing from outside its body.
 */
export function replaceTokenColors(text : string, tokens : ReadonlyArray<readonly [string, string]>) : string {
    const names = new Map(tokens);
    return text.replace(
        /(?<![\w#(-])#([0-9a-f]{6}|[0-9a-f]{3})(?![\w-])|\brgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*(?:[,/]\s*1(?:\.0*)?\s*)?\)/gi,
        (match : string, digits : string | undefined, red : string | undefined, green : string | undefined, blue : string | undefined) : string => {
            let color : string;
            if (digits === undefined) {
                color = `#${[red, green, blue].map(part => Number(part).toString(16).padStart(2, "0")).join("")}`;
            } else {
                color = `#${(digits.length === 3 ? digits.replace(/./g, "$&$&") : digits).toLowerCase()}`;
            }
            const name = names.get(color);
            return name === undefined ? match : `var(${name})`;
        },
    );
}

/**
 * CSS rules that give the SVG attributes of the snapshot the colors of the
 * current theme. An SVG attribute cannot contain `var()`, so a rule with the
 * specificity zero of `:where()` sets the CSS property. The style element
 * comes before the style sheets of the site, so each other rule wins, as it
 * wins over the attribute.
 */
export function colorRules(attributes : ReadonlyArray<readonly [string, string]>, tokens : ReadonlyArray<readonly [string, string]>) : string[] {
    const rules = new Set<string>();
    for (const [attribute, value] of attributes) {
        if (!(COLOR_ATTRIBUTES as readonly string[]).includes(attribute) || /["\\]/.test(value)) continue;
        const replaced = replaceTokenColors(value.trim(), tokens);
        if (replaced === value.trim() || !/^var\(--[\w-]+\)$/.test(replaced)) continue;
        rules.add(`:where([${PRERENDERED_ATTRIBUTE}] [${attribute}="${value}"]){${attribute}:${replaced}}`);
    }
    return [...rules].sort();
}

function hrefOf(tag : string) : string | undefined {
    return /\shref="([^"]*)"/.exec(tag)?.[1];
}

export type PageParts = {
    route : StaticRoute;
    /** The head tags of the route (refer to `headTags`). */
    head : string;
    snapshot? : Snapshot;
    tokens? : ReadonlyArray<readonly [string, string]>;
};

/**
 * The HTML file of a route. It is the template with the title, the
 * description and the head tags of the route. The root element contains the
 * prerendered HTML. Without a snapshot, the root element stays empty.
 */
export function pageHtml(template : string, { route, head, snapshot, tokens = [] } : PageParts) : string {
    if (!template.includes(EMPTY_ROOT)) throw new Error(`index.html must contain ${EMPTY_ROOT}.`);
    let html = routeHtml(template, route);
    if (snapshot === undefined) return html.replace(/<\/title>/, () => `</title>\n${head}`);

    const css = [SNAPSHOT_CSS, ...colorRules(snapshot.colorAttributes, tokens)].join("\n");
    html = html.replace(/<\/title>/, () => `</title>\n${head}\n        <style data-prerender>\n${css}\n        </style>`);
    const links = snapshot.links.filter((link, index, all) => {
        const href = hrefOf(link);
        return href !== undefined && !template.includes(`href="${href}"`) && all.findIndex(other => hrefOf(other) === href) === index;
    });
    if (links.length > 0) html = html.replace(/\n?\s*<\/head>/, () => `\n${links.map(link => `        ${link}`).join("\n")}\n    </head>`);
    // The attribute value is the route, so the app can find HTML of a different route (refer to `mountApp`).
    return html.replace(EMPTY_ROOT, () => `<div id="root" ${PRERENDERED_ATTRIBUTE}="${escapeHtml(route.path)}">${snapshot.body}</div>`);
}
