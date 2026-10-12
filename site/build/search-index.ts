import type { Root } from "hast";
import { readContentFiles } from "./content-files.ts";
import { sectionLabel } from "./head-tags.ts";
import { readPageTrees } from "./mdx-pipeline.ts";
import { collectToc, expressionText, textOf } from "./rehype-export-toc.ts";

/** One heading of a page, with the ID that `rehype-slug` gives it. */
export type SearchHeading = { text : string; id : string };

/** One page in the search index. */
export type SearchEntry = {
    /** The route after the base URL, for example "docs/concepts/rules". */
    path : string;
    /** The section of the page, for example "Docs". */
    section : string;
    title : string;
    description : string;
    headings : SearchHeading[];
    /** The text of the page without Markdown, JSX and frontmatter: first the prose, then the code blocks. */
    text : string;
};

/** The most characters of prose for each page. */
const TEXT_LIMIT = 20_000;
/** The most characters of code for each page. The code comes after the prose, so it has its own limit. */
const CODE_LIMIT = 8000;

/** The HTML elements that are part of a line of text. Each other element is a block, and its text is a separate word. */
const INLINE_ELEMENTS = new Set(["a", "abbr", "b", "bdi", "bdo", "cite", "code", "data", "del", "dfn", "em", "i", "ins", "kbd", "mark", "q", "s", "samp", "small", "span", "strong", "sub", "sup", "time", "u", "var", "wbr"]);

/** The attributes of a JSX element that the page shows as text, for example the title of a callout. */
const TEXT_ATTRIBUTES = new Set(["title", "caption"]);
/** The attributes of a JSX element that contain code, for example the source of a diagram (refer to `remark-mermaid.ts`). */
const CODE_ATTRIBUTES = new Set(["chart"]);

type TreeNode = {
    type : string;
    tagName? : string;
    value? : unknown;
    name? : string | null;
    attributes? : Array<{ type : string; name? : string; value? : unknown }>;
    children? : TreeNode[];
    data? : unknown;
};

/** The text of the page: the prose (headings, paragraphs, lists, tables and the text in JSX elements), and the code blocks. */
export type PageText = { prose : string; code : string };

function clean(parts : readonly string[]) : string {
    return parts.join("").replace(/\s+/g, " ").trim();
}

/**
 * This function gives the text of an MDX page from its HTML tree (hast).
 * The MDX compiler parsed the JSX, so the attributes of an element are not
 * text, except the title, the caption and the diagram source. Imports,
 * exports and other JavaScript are not text. A code block goes into `code`,
 * with all its lines.
 */
export function pageText(tree : Root) : PageText {
    const prose : string[] = [];
    const code : string[] = [];
    const visit = (node : TreeNode) : void => {
        switch (node.type) {
            case "text":
                prose.push(String(node.value ?? ""));
                return;
            case "mdxjsEsm":
            case "comment":
            case "doctype":
                return;
            case "mdxFlowExpression":
            case "mdxTextExpression":
                prose.push(expressionText(node));
                return;
            default:
                break;
        }
        if (node.type === "element" && node.tagName === "pre") {
            code.push(" ", textOf(node as Root), " ");
            return;
        }
        const inline = node.type === "mdxJsxTextElement" || (node.type === "element" && INLINE_ELEMENTS.has(node.tagName ?? ""));
        if (!inline) prose.push(" ");
        if (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") {
            for (const attribute of node.attributes ?? []) {
                if (attribute.type !== "mdxJsxAttribute" || typeof attribute.value !== "string") continue;
                if (TEXT_ATTRIBUTES.has(attribute.name ?? "")) prose.push(" ", attribute.value, " ");
                else if (CODE_ATTRIBUTES.has(attribute.name ?? "")) code.push(" ", attribute.value, " ");
            }
        }
        for (const child of node.children ?? []) visit(child);
        if (!inline) prose.push(" ");
    };
    visit(tree as TreeNode);
    return { prose : clean(prose), code : clean(code) };
}

/** The `text` of a search entry: the prose, then the code. Each part has its own limit. */
export function searchText({ prose, code } : PageText) : string {
    return [prose.slice(0, TEXT_LIMIT), code.slice(0, CODE_LIMIT)].filter(part => part !== "").join(" ");
}

/**
 * This function makes the search index of all the MDX pages in `contentDir`.
 * It compiles each page as the site does, so the headings have the IDs and the
 * text of the table of contents. Draft pages are not in the index (refer to
 * `ContentFile.draft`).
 */
export async function buildSearchIndex(contentDir : string) : Promise<SearchEntry[]> {
    const pages = (await readContentFiles(contentDir)).filter(page => !page.draft);
    const trees = await readPageTrees(pages.map(page => ({ source : page.source, path : page.file })), tree => ({
        headings : collectToc(tree).map(({ text, id }) => ({ text, id })),
        text : searchText(pageText(tree)),
    }));
    return pages.map((page, index) => ({
        path : page.route,
        section : sectionLabel(page.section),
        title : page.meta.title,
        description : page.meta.description,
        headings : trees[index]?.headings ?? [],
        text : trees[index]?.text ?? "",
    }));
}
