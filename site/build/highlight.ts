import { createHighlighter, type BundledLanguage, type Highlighter } from "shiki";

/** The themes of the code on the site: one for the light theme and one for the dark theme. */
export const CODE_THEMES = { light : "github-light-default", dark : "github-dark-default" } as const;

/** The languages that the code blocks of the site use. */
export const CODE_LANGUAGES : BundledLanguage[] = ["javascript", "typescript", "jsx", "tsx", "json", "bash", "shellscript", "html", "css", "yaml", "diff"];

/** One token of highlighted code: the text, the light color, the dark color, and `1` for italic text. */
export type CodeToken = readonly [text : string, light : string, dark : string, italic? : 1];

let highlighter : Promise<Highlighter> | undefined;

/** This function gives the one highlighter of the build. Shiki loads the grammars and the themes one time. */
export function getHighlighter() : Promise<Highlighter> {
    highlighter ??= createHighlighter({ themes : Object.values(CODE_THEMES), langs : CODE_LANGUAGES });
    return highlighter;
}

/** This function gives the tokens of each line of `code`. The site shows them without Shiki in the browser. */
export async function highlightLines(code : string, lang : BundledLanguage = "javascript") : Promise<CodeToken[][]> {
    const shiki = await getHighlighter();
    const lines = shiki.codeToTokensWithThemes(code, { lang, themes : CODE_THEMES });
    return lines.map(line => line.map((token) : CodeToken => {
        const light = token.variants["light"];
        const dark = token.variants["dark"];
        const italic = ((light?.fontStyle ?? 0) & 1) === 1;
        return italic
            ? [token.content, light?.color ?? "", dark?.color ?? "", 1]
            : [token.content, light?.color ?? "", dark?.color ?? ""];
    }));
}
