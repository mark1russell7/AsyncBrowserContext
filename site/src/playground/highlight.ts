import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import type { CodeToken } from "../components/Code/HighlightedCode";

/** The same themes as the build (refer to `site/build/highlight.ts`). */
const THEMES = { light : "github-light-default", dark : "github-dark-default" } as const;

let highlighter : Promise<HighlighterCore> | undefined;

/** This function loads Shiki with the JavaScript grammar and the two themes, one time. */
export function loadHighlighter() : Promise<HighlighterCore> {
    highlighter ??= createHighlighterCore({
        themes : [import("shiki/themes/github-light-default.mjs"), import("shiki/themes/github-dark-default.mjs")],
        langs : [import("shiki/langs/javascript.mjs")],
        engine : createJavaScriptRegexEngine(),
    });
    return highlighter;
}

/** This function gives the tokens of each line, as the build gives them. Without Shiki, the lines have no colors. */
export function tokenize(shiki : HighlighterCore | undefined, code : string) : CodeToken[][] {
    if (shiki === undefined) return code.split("\n").map(line => (line === "" ? [] : [[line, "", ""]]));
    return shiki.codeToTokensWithThemes(code, { lang : "javascript", themes : THEMES }).map(line => line.map((token) : CodeToken => {
        const light = token.variants["light"];
        const dark = token.variants["dark"];
        const italic = ((light?.fontStyle ?? 0) & 1) === 1;
        return italic ? [token.content, light?.color ?? "", dark?.color ?? "", 1] : [token.content, light?.color ?? "", dark?.color ?? ""];
    }));
}
