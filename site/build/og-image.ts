import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH, sectionLabel, type SiteFacts } from "./head-tags.ts";
import { escapeHtml, type StaticRoute } from "./static-routes.ts";

/** The text of one Open Graph image. */
export type OgCard = {
    /** The line above the title, for example "Docs / Concepts". */
    eyebrow : string;
    title : string;
    description : string;
    siteName : string;
    /** The site address without the protocol, for example "owner.github.io/repository". */
    address : string;
};

/** The web fonts of the image, as `src` values of `@font-face`. */
export type OgFonts = {
    sans : readonly string[];
    mono : readonly string[];
};

/** The light theme colors of `styles/tokens.css`. */
const COLORS = {
    page : "#f5f6f9",
    surface : "#ffffff",
    ink : "#151c2e",
    inkSecondary : "#454f67",
    inkMuted : "#5f6880",
    ruleStrong : "#aeb6c7",
    grid : "#e7eaf1",
    accent : "#2346c4",
    accentWash : "#e7ecfd",
    mark : "#c2301f",
    markWash : "#fbe9e6",
};

/** The text of the image of a route. The home page gets the name of the library and its license. */
export function ogCard(route : StaticRoute, site : SiteFacts, fallbackDescription : string) : OgCard {
    const url = new URL(site.url);
    const address = `${url.host}${url.pathname}`.replace(/\/$/, "");
    const segments = route.path.split("/").filter(segment => segment !== "");
    const eyebrow = route.path === ""
        ? `TypeScript library · ${site.license} license`
        : segments.slice(0, Math.max(1, segments.length - 1)).map(sectionLabel).join(" / ");
    return {
        eyebrow,
        title : route.heading,
        description : route.description ?? fallbackDescription,
        siteName : site.name,
        address,
    };
}

function fontFaces(family : string, sources : readonly string[]) : string {
    return sources.map(source => `@font-face{font-family:"${family}";src:${source};font-weight:200 800;font-style:normal;font-display:block}`).join("\n");
}

/** The site mark (refer to `src/app/BrandMark.tsx`), larger. */
const BRAND_MARK = `<svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="1.5" y="1.5" width="21" height="21" rx="4" fill="none" stroke="${COLORS.inkMuted}" stroke-width="1.5"/>
    <rect x="5.5" y="5.5" width="13" height="13" rx="3" fill="none" stroke="${COLORS.ink}" stroke-width="1.5"/>
    <circle cx="12" cy="12" r="3.2" fill="${COLORS.accent}"/>
</svg>`;

type FrameBox = { x : number; y : number; width : number; height : number; name : string; sets : string; kind : "root" | "frame" | "current" | "later" };

function frameBox(box : FrameBox) : string {
    const centerX = box.x + box.width / 2;
    const stroke = box.kind === "current" ? COLORS.accent : COLORS.ruleStrong;
    const dash = box.kind === "root" ? ` stroke-dasharray="7 5"` : box.kind === "later" ? ` stroke-dasharray="2 5" stroke-linecap="round"` : "";
    const ring = box.kind === "current"
        ? `<rect x="${box.x - 4}" y="${box.y - 4}" width="${box.width + 8}" height="${box.height + 8}" rx="12" fill="none" stroke="${COLORS.accentWash}" stroke-width="6"/>`
        : "";
    const badge = box.kind === "current"
        ? `<rect x="${centerX - 38}" y="${box.y + 66}" width="76" height="22" rx="11" fill="${COLORS.accent}"/>
           <text x="${centerX}" y="${box.y + 81.5}" text-anchor="middle" class="badge">Current</text>`
        : "";
    return `<g${box.kind === "later" ? ` opacity="0.5"` : ""}>
        ${ring}
        <rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="8" fill="${COLORS.surface}" stroke="${stroke}" stroke-width="2"${dash}/>
        <text x="${centerX}" y="${box.y + 29}" text-anchor="middle" class="name">${escapeHtml(box.name)}</text>
        <text x="${centerX}" y="${box.y + 52}" text-anchor="middle" class="sets">${escapeHtml(box.sets)}</text>
        ${badge}
    </g>`;
}

/**
 * The motif of the image: a tree of context frames, as the frame tree page
 * shows it. Frame C continues after an await, and it gets the value of
 * `user` from frame A, its nearest frame that sets `user`.
 */
function frameTree() : string {
    const edge = (path : string, extra = "") : string =>
        `<path d="${path}" fill="none" stroke="${COLORS.inkMuted}" stroke-width="1.75" marker-end="url(#arrow)"${extra}/>`;
    return `<svg width="400" height="506" viewBox="0 0 400 506" aria-hidden="true">
        <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0L10 5L0 10Z" fill="${COLORS.inkMuted}"/>
            </marker>
        </defs>
        ${edge("M200 124V160H104V192")}
        ${edge("M200 160H296V192")}
        ${edge("M104 268V334")}
        ${edge("M296 268V334", ` stroke-dasharray="2 5" stroke-linecap="round" opacity="0.5"`)}
        <rect x="74" y="289" width="60" height="24" rx="12" fill="${COLORS.markWash}" stroke="${COLORS.mark}" stroke-width="1.25"/>
        <text x="104" y="305.5" text-anchor="middle" class="await">await</text>
        ${frameBox({ x : 110, y : 54, width : 180, height : 70, name : "Root frame", sets : "no values", kind : "root" })}
        ${frameBox({ x : 24, y : 196, width : 160, height : 72, name : "Frame A", sets : "user = \"ana\"", kind : "frame" })}
        ${frameBox({ x : 216, y : 196, width : 160, height : 72, name : "Frame B", sets : "user = \"ben\"", kind : "frame" })}
        ${frameBox({ x : 24, y : 338, width : 160, height : 98, name : "Frame C", sets : "trace = 7f3", kind : "current" })}
        ${frameBox({ x : 216, y : 338, width : 160, height : 72, name : "Frame D", sets : "a later step", kind : "later" })}
        <text x="200" y="478" text-anchor="middle" class="caption">user.get() <tspan class="caption-arrow">===</tspan> <tspan class="caption-value">"ana"</tspan></text>
    </svg>`;
}

/**
 * The HTML page that the build renders to a PNG file of 1200 × 630 pixels.
 * It uses the colors and the fonts of the site. A script makes the title
 * smaller until it fits in three lines and in the width of the column. Then
 * it sets `data-ready` on the body.
 */
export function ogImageHtml(card : OgCard, fonts : OgFonts) : string {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
${fontFaces("Atkinson Hyperlegible Next", fonts.sans)}
${fontFaces("Atkinson Hyperlegible Mono", fonts.mono)}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${OG_IMAGE_WIDTH}px; height: ${OG_IMAGE_HEIGHT}px; overflow: hidden; }
body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 400px;
    gap: 56px;
    padding: 62px 62px 62px 72px;
    background: ${COLORS.page};
    color: ${COLORS.ink};
    font-family: "Atkinson Hyperlegible Next", sans-serif;
    -webkit-font-smoothing: antialiased;
}
.text { display: grid; grid-template-rows: auto 1fr auto; min-width: 0; }
.brand { display: flex; align-items: center; gap: 14px; font-size: 29px; font-weight: 800; letter-spacing: -0.02em; }
.main { min-width: 0; align-self: center; padding-bottom: 4px; }
.eyebrow { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; color: ${COLORS.accent}; font-family: "Atkinson Hyperlegible Mono", monospace; font-size: 22px; font-weight: 600; }
.eyebrow::before { content: ""; width: 28px; height: 3px; border-radius: 2px; background: ${COLORS.accent}; }
.title { font-size: 72px; font-weight: 800; line-height: 1.05; letter-spacing: -0.03em; text-wrap: balance; }
.description {
    display: -webkit-box;
    margin-top: 24px;
    overflow: hidden;
    color: ${COLORS.inkSecondary};
    font-size: 27px;
    line-height: 1.42;
    text-wrap: pretty;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
}
.address { display: flex; align-items: center; gap: 12px; padding-top: 18px; border-top: 1.5px solid ${COLORS.ruleStrong}; color: ${COLORS.inkMuted}; font-family: "Atkinson Hyperlegible Mono", monospace; font-size: 21px; }
.panel {
    position: relative;
    overflow: hidden;
    border: 1.5px solid ${COLORS.ruleStrong};
    border-radius: 12px;
    background-color: ${COLORS.surface};
    background-image: linear-gradient(${COLORS.grid} 1px, transparent 1px), linear-gradient(90deg, ${COLORS.grid} 1px, transparent 1px);
    background-size: 20px 20px;
    background-position: -1px -1px;
}
.panel svg { position: absolute; inset: 0; }
.name { fill: ${COLORS.ink}; font-size: 19px; font-weight: 700; }
.sets { fill: ${COLORS.inkSecondary}; font-family: "Atkinson Hyperlegible Mono", monospace; font-size: 15px; }
.badge { fill: ${COLORS.surface}; font-size: 13px; font-weight: 700; letter-spacing: 0.02em; }
.await { fill: ${COLORS.mark}; font-family: "Atkinson Hyperlegible Mono", monospace; font-size: 14px; font-weight: 600; }
.caption { fill: ${COLORS.inkSecondary}; font-family: "Atkinson Hyperlegible Mono", monospace; font-size: 17px; }
.caption-arrow { fill: ${COLORS.inkMuted}; }
.caption-value { fill: ${COLORS.accent}; font-weight: 700; }
</style>
</head>
<body>
    <div class="text">
        <div class="brand">${BRAND_MARK}<span>${escapeHtml(card.siteName)}</span></div>
        <div class="main">
            <p class="eyebrow">${escapeHtml(card.eyebrow)}</p>
            <h1 class="title">${escapeHtml(card.title)}</h1>
            <p class="description">${escapeHtml(card.description)}</p>
        </div>
        <div class="address">${escapeHtml(card.address)}</div>
    </div>
    <div class="panel">${frameTree()}</div>
    <script>
        document.fonts.ready.then(function () {
            var title = document.querySelector(".title");
            var size = 72;
            while (size > 40 && (title.getBoundingClientRect().height > size * 1.05 * 3 + 2 || title.scrollWidth > title.clientWidth)) {
                size -= 2;
                title.style.fontSize = size + "px";
            }
            document.body.setAttribute("data-ready", "true");
        });
    </script>
</body>
</html>
`;
}
