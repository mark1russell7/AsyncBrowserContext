import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { colorRules, colorTokens, pageHtml, replaceTokenColors, type Snapshot } from "./snapshot";
import type { StaticRoute } from "./static-routes";

const TEMPLATE = `<!doctype html>
<html lang="en">
    <head>
        <meta name="description" content="The site." />
        <title>abc</title>
        <link rel="stylesheet" crossorigin href="/base/assets/index.css">
    </head>
    <body>
        <div id="root"></div>
    </body>
</html>`;

const ROUTE : StaticRoute = { path : "docs/api", title : "API – abc", heading : "API", description : "Each class." };
const TOKENS : Array<[string, string]> = [["#2a78d6", "--series-1"], ["#ffffff", "--color-surface"], ["#2346c4", "--color-accent"]];

describe("color tokens", () => {
    it("reads the colors of the light theme, and leaves out a color that two tokens have", () => {
        const css = `:root {\n  --a: #2A78D6;\n  --b: #fff;\n  --c: #111111;\n  --d: #111111;\n  --font: "x";\n}\n:root[data-theme="dark"] { --a: #3987e5; }`;
        expect(colorTokens(css)).toEqual([["#2a78d6", "--a"], ["#ffffff", "--b"]]);
    });

    it("finds each color of styles/tokens.css one time", async () => {
        const tokens = colorTokens(await readFile(new URL("../src/styles/tokens.css", import.meta.url), "utf8"));
        expect(tokens).toContainEqual(["#2a78d6", "--series-1"]);
        expect(tokens).toContainEqual(["#2346c4", "--color-accent"]);
        expect(new Set(tokens.map(([color]) => color)).size).toBe(tokens.length);
    });

    it("replaces hex and rgb() colors of tokens, and nothing else", () => {
        expect(replaceTokenColors("stroke: rgb(35, 70, 196); fill: #FFF", TOKENS)).toBe("stroke: var(--color-accent); fill: var(--color-surface)");
        expect(replaceTokenColors("color:rgb(42 120 214);background:#2a78d6", TOKENS)).toBe("color:var(--series-1);background:var(--series-1)");
        expect(replaceTokenColors("fill: #123456; stroke: url(#ffffff); color: #2a78d680", TOKENS)).toBe("fill: #123456; stroke: url(#ffffff); color: #2a78d680");
        expect(replaceTokenColors("#mermaid-1 .node{fill:#2a78d6}", TOKENS)).toBe("#mermaid-1 .node{fill:var(--series-1)}");
    });

    it("works with no outside value, so the prerender can run it in the browser", () => {
        const copy = new Function(`return (${replaceTokenColors.toString()})`)() as typeof replaceTokenColors;
        expect(copy("fill: #2a78d6", TOKENS)).toBe("fill: var(--series-1)");
    });

    it("makes CSS rules with no specificity for the SVG attributes with a token color", () => {
        expect(colorRules([["fill", "#2a78d6"], ["stroke", "rgb(35, 70, 196)"], ["fill", "#123456"], ["stroke", "var(--color-ink)"], ["d", "#2a78d6"]], TOKENS)).toEqual([
            ":where([data-prerendered] [fill=\"#2a78d6\"]){fill:var(--series-1)}",
            ":where([data-prerendered] [stroke=\"rgb(35, 70, 196)\"]){stroke:var(--color-accent)}",
        ]);
    });
});

describe("page HTML", () => {
    const snapshot : Snapshot = {
        body : `<main><h1>API</h1><p>Costs $1, $& and $' are text.</p></main>`,
        links : [
            `<link rel="stylesheet" crossorigin href="/base/assets/index.css">`,
            `<link rel="stylesheet" crossorigin="" href="/base/assets/Explore.css">`,
            `<link rel="modulepreload" as="script" crossorigin="" href="/base/assets/Explore.js">`,
            `<link rel="stylesheet" crossorigin="" href="/base/assets/Explore.css">`,
        ],
        colorAttributes : [["fill", "#2a78d6"]],
    };

    it("puts the head tags after the title, and keeps the root element empty without a snapshot", () => {
        const html = pageHtml(TEMPLATE, { route : ROUTE, head : `        <link rel="canonical" href="x" />` });
        expect(html).toContain(`<title>API – abc</title>\n        <link rel="canonical" href="x" />`);
        expect(html).toContain(`<div id="root"></div>`);
        expect(html).not.toContain("data-prerender");
    });

    it("puts the snapshot into the root element, with the route, and the text stays as it is", () => {
        const html = pageHtml(TEMPLATE, { route : ROUTE, head : "", snapshot, tokens : TOKENS });
        expect(html).toContain(`<div id="root" data-prerendered="docs/api"><main><h1>API</h1><p>Costs $1, $& and $' are text.</p></main></div>`);
    });

    it("adds the style sheets of the page one time each, after the style sheet of the template", () => {
        const html = pageHtml(TEMPLATE, { route : ROUTE, head : "", snapshot, tokens : TOKENS });
        expect(html.match(/index\.css/g)).toHaveLength(1);
        expect(html.match(/Explore\.css/g)).toHaveLength(1);
        expect(html.indexOf("index.css")).toBeLessThan(html.indexOf("Explore.css"));
        expect(html.indexOf("Explore.js")).toBeLessThan(html.indexOf("</head>"));
    });

    it("adds the color rules before the style sheets, so the other rules win", () => {
        const html = pageHtml(TEMPLATE, { route : ROUTE, head : "", snapshot, tokens : TOKENS });
        expect(html).toContain(`:where([data-prerendered] [fill="#2a78d6"]){fill:var(--series-1)}`);
        expect(html).toContain("[data-theme-toggle]{visibility:hidden}");
        expect(html.indexOf("<style data-prerender>")).toBeLessThan(html.indexOf("index.css"));
    });

    it("refuses a template without an empty root element", () => {
        expect(() => pageHtml(TEMPLATE.replace(`<div id="root"></div>`, `<div id="app"></div>`), { route : ROUTE, head : "" })).toThrow(/<div id="root"><\/div>/);
    });
});
