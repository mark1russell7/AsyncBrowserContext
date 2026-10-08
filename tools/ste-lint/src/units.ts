/**
 * Prose units: the blocks of text that the rules examine, with their tokens
 * and sentences.
 */

import type { Lexicon } from "./lexicon.js";
import type { ListContext, ProseBlock } from "./source/blocks.js";
import { normalizeInline } from "./source/inline.js";
import { isInstruction } from "./text/grammar.js";
import { countWords, splitSentences } from "./text/sentences.js";
import { isCounted, tokenize, type Token } from "./text/tokens.js";

export type TsdocSection = "summary" | "remarks" | "tag";

/** Where a block comes from. */
export type BlockOrigin = {
    readonly source : "markdown" | "mdx" | "tsdoc" | "jsx";
    /** For a doc comment: the summary, the `@remarks` section, or the text of another block tag. */
    readonly tsdocSection : TsdocSection | null;
    /** For a doc comment: the block tag, for example `@param`, or null for the summary. */
    readonly tsdocTag : string | null;
};

export type ExtractedBlock = {
    readonly block : ProseBlock;
    readonly origin : BlockOrigin;
};

export type Sentence = {
    /** All tokens of the sentence, with the punctuation. */
    readonly tokens : readonly Token[];
    /** The STE word count. */
    readonly words : number;
    /** The tokens in each top-level parenthesis. Each one counts as a separate sentence. */
    readonly parentheticals : readonly (readonly Token[])[];
    /** True when the sentence is an instruction (imperative). */
    readonly instruction : boolean;
    readonly start : number;
    readonly end : number;
};

export type UnitKind = ProseBlock["kind"];

export type ProseUnit = {
    readonly kind : UnitKind;
    readonly origin : BlockOrigin;
    readonly list : ListContext | null;
    readonly tokens : readonly Token[];
    readonly sentences : readonly Sentence[];
    readonly start : number;
    readonly end : number;
};

/** This function makes a prose unit from a block. The result is null when the block has no words. */
export function buildUnit(extracted : ExtractedBlock, lexicon : Lexicon) : ProseUnit | null {
    const { block, origin } = extracted;
    const inline = normalizeInline(block.lines, { mdx : origin.source === "mdx" || origin.source === "jsx", tsdoc : origin.source === "tsdoc" });
    return unitFromTokens(tokenize(inline), block, origin, lexicon);
}

/** This function makes a prose unit from the tokens of a block. */
export function unitFromTokens(tokens : readonly Token[], block : Pick<ProseBlock, "kind" | "list">, origin : BlockOrigin, lexicon : Lexicon) : ProseUnit | null {
    if (!tokens.some(isCounted)) return null;
    const ranges = block.kind === "paragraph" ? splitSentences(tokens) : [{ from : 0, to : tokens.length }];
    const sentences : Sentence[] = ranges.map((range) => {
        const sentenceTokens = tokens.slice(range.from, range.to);
        const count = countWords(sentenceTokens, { properNouns : lexicon.properNounPhrases });
        return {
            tokens : sentenceTokens,
            words : count.words,
            parentheticals : count.parentheticals,
            instruction : block.kind === "paragraph" && isInstruction(sentenceTokens, { verbs : lexicon.verbs }),
            start : sentenceTokens[0]!.start,
            end : sentenceTokens[sentenceTokens.length - 1]!.end,
        };
    });
    return {
        kind : block.kind,
        origin,
        list : block.list,
        tokens,
        sentences,
        start : tokens[0]!.start,
        end : tokens[tokens.length - 1]!.end,
    };
}
