import { isWord } from "../text/tokens.js";
import { forEachToken, tokenRange, type Rule } from "./rule.js";

const GENDERED = new Set([
    "he", "she", "his", "her", "him", "hers", "himself", "herself",
    "he's", "she's", "he'd", "she'd", "he'll", "she'll",
]);

export const genderedPronoun : Rule = {
    id : "gendered-pronoun",
    description : "Find gendered pronouns: he, she, his, her, him, hers, himself and herself.",
    ste : "GR-3, GR-7",
    defaultSeverity : "error",
    scope : "word",
    check(unit, context) {
        forEachToken(unit, (tokens, i) => {
            const token = tokens[i]!;
            if (!isWord(token) || !GENDERED.has(token.lower)) return;
            context.report({
                ...tokenRange(tokens, i, i + 1),
                message : `Do not use the gendered pronoun "${token.text}". Write "they" or "it", or write the noun again.`,
            });
        });
    },
};

const SINGULAR = new Set(["i", "me", "my", "mine", "myself", "i'm", "i've", "i'll", "i'd"]);
const PLURAL = new Set(["our", "ours", "ourselves"]);

export const firstPerson : Rule = {
    id : "first-person",
    description : "Find first-person pronouns other than \"we\": I, me, my, our and us. Use \"we\" only for the organization that writes the text.",
    ste : "GR-3",
    defaultSeverity : "warning",
    scope : "word",
    check(unit, context) {
        forEachToken(unit, (tokens, i) => {
            const token = tokens[i]!;
            if (!isWord(token)) return;
            const lower = token.lower;
            let message : string | null = null;
            if (SINGULAR.has(lower)) {
                message = `Do not use "${token.text}". Write "you" for the reader, or "we" for the organization that writes the text.`;
            } else if (PLURAL.has(lower)) {
                message = `Do not use "${token.text}". Write the name of the project or the product, or rewrite the sentence with "we" as the subject.`;
            } else if (lower === "us" && token.text !== "US") {
                message = "Do not use \"us\". Rewrite the sentence with \"we\" as the subject.";
            } else if (lower === "let's") {
                message = "Do not use \"let's\". Write the instruction in the imperative.";
            }
            if (message !== null) context.report({ ...tokenRange(tokens, i, i + 1), message });
        });
    },
};
