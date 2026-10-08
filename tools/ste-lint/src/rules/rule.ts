import type { ResolvedConfig } from "../config.js";
import type { Lexicon } from "../lexicon.js";
import type { Token } from "../text/tokens.js";
import type { RuleId, Severity } from "../types.js";
import type { ProseUnit, Sentence } from "../units.js";
import type { WordListMatcher } from "./word-list-matcher.js";

/**
 * Which units a rule examines. Headings and table cells get only the
 * "word" rules. Paragraphs and list items get all rules.
 */
export type RuleScope = "word" | "sentence" | "paragraph";

export type Report = {
    /** The file offset of the first character of the problem. */
    readonly start : number;
    /** The file offset after the last character of the problem. */
    readonly end : number;
    readonly message : string;
    /** The severity of this finding, when it is not the default severity of the rule (for example a word list entry). */
    readonly severity? : Severity;
};

export type RuleContext = {
    readonly config : ResolvedConfig;
    readonly lexicon : Lexicon;
    readonly wordList : WordListMatcher;
    report(report : Report) : void;
};

export type Rule = {
    readonly id : RuleId;
    /** One sentence that tells what the rule finds. */
    readonly description : string;
    /** The related ASD-STE100 rule numbers. */
    readonly ste : string;
    readonly defaultSeverity : Severity;
    readonly scope : RuleScope;
    check(unit : ProseUnit, context : RuleContext) : void;
};

/** The surface text of `tokens[from]` to `tokens[to - 1]`, with one space between tokens that had space between them. */
export function surface(tokens : readonly Token[], from : number, to : number) : string {
    let text = "";
    for (let i = from; i < to; i++) {
        const token = tokens[i]!;
        const value = token.kind === "code" && token.placeholder !== null ? placeholderText(token) : token.text;
        text += (i > from && token.spaceBefore ? " " : "") + value;
    }
    return text;
}

function placeholderText(token : Token) : string {
    const placeholder = token.placeholder!;
    switch (placeholder.kind) {
        case "code": return `\`${placeholder.text}\``;
        case "quote": return `"${placeholder.text}"`;
        case "link": return `{${placeholder.text}}`;
        default: return placeholder.text;
    }
}

/** A report for the tokens `from` to `to - 1` of a sentence. */
export function tokenRange(tokens : readonly Token[], from : number, to : number) : { start : number; end : number } {
    return { start : tokens[from]!.start, end : tokens[to - 1]!.end };
}

/** This function gives each token of each sentence of the unit to `visit`. */
export function forEachToken(unit : ProseUnit, visit : (tokens : readonly Token[], index : number, sentence : Sentence) => void) : void {
    for (const sentence of unit.sentences) {
        for (let i = 0; i < sentence.tokens.length; i++) visit(sentence.tokens, i, sentence);
    }
}
