/**
 * Prose extraction from Markdown and MDX files.
 */

import type { ExtractedBlock } from "../units.js";
import { parseBlocks, type ProseBlock } from "./blocks.js";
import { isBlank, sliceLine, splitLines, type Line } from "./lines.js";
import { SuppressionCollector, type DirectiveProblem, type Suppression } from "./suppressions.js";

export type Extraction = {
    readonly blocks : readonly ExtractedBlock[];
    readonly suppressions : readonly Suppression[];
    /** The directive comments with problems, for example an unknown rule ID. */
    readonly problems : readonly DirectiveProblem[];
};

/** This function removes a UTF-8 byte order mark at the start of the file. */
export function stripBom(lines : readonly Line[]) : readonly Line[] {
    const first = lines[0];
    if (first === undefined || first.text.charCodeAt(0) !== 0xFEFF) return lines;
    return [sliceLine(first, 1), ...lines.slice(1)];
}

/**
 * This function removes YAML (`---`) or TOML (`+++`) front matter at the
 * start of the file. A `---` line with a blank line after it is a thematic
 * break, not front matter.
 */
export function stripFrontMatter(lines : readonly Line[]) : readonly Line[] {
    const first = lines[0]?.text.trimEnd();
    if (first !== "---" && first !== "+++") return lines;
    if (first === "---" && (lines[1] === undefined || isBlank(lines[1].text))) return lines;
    for (let i = 1; i < lines.length; i++) {
        const text = lines[i]!.text.trimEnd();
        if (text === first || (first === "---" && text === "...")) return lines.slice(i + 1);
    }
    return lines;
}

/** The file offsets of the first and the last character of a block. */
export function blockRange(block : ProseBlock) : { start : number; end : number } {
    const first = block.lines[0]!;
    const last = block.lines[block.lines.length - 1]!;
    return { start : first.offset, end : last.offset + last.text.length };
}

/** This function extracts the prose blocks and the suppressions of a Markdown or MDX file. */
export function extractMarkdown(text : string, options : { readonly mdx : boolean }) : Extraction {
    const lines = stripFrontMatter(stripBom(splitLines(text)));
    const collector = new SuppressionCollector();
    const blocks : ExtractedBlock[] = [];
    const origin = { source : options.mdx ? "mdx" as const : "markdown" as const, tsdocSection : null, tsdocTag : null };
    for (const block of parseBlocks(lines, options)) {
        if (block.kind === "directive") {
            collector.directive(block);
            continue;
        }
        const range = block.suppressionRange ?? blockRange(block);
        collector.block(range.start, range.end);
        blocks.push({ block, origin });
    }
    return { blocks, suppressions : collector.finish(text.length), problems : collector.problems };
}
