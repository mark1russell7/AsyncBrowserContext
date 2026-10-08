import { isNumber, isWord } from "../text/tokens.js";
import { UNITS } from "../text/words.js";
import { forEachToken, tokenRange, type Rule } from "./rule.js";

/** Words after "about a" or "about an" that make a quantity: "about a second", "about an hour". */
const QUANTITY_AFTER_ARTICLE = new Set([
    "dozen", "few", "hundred", "thousand", "million", "billion", "third", "quarter", "half", "factor", "tenth",
]);

export const aboutQuantity : Rule = {
    id : "about-quantity",
    description : "Find \"about\" before a number or a quantity, where the word means \"approximately\".",
    ste : "1.3, 9.2",
    defaultSeverity : "error",
    scope : "word",
    check(unit, context) {
        forEachToken(unit, (tokens, i) => {
            const token = tokens[i]!;
            if (!isWord(token) || token.lower !== "about") return;
            const next = tokens[i + 1];
            const after = tokens[i + 2];
            const quantity = isNumber(next)
                || (next !== undefined && next.text === "~")
                || (isWord(next) && /^\d/.test(next.text))
                || (isWord(next) && (next.lower === "a" || next.lower === "an") && isWord(after) && (QUANTITY_AFTER_ARTICLE.has(after.lower) || UNITS.has(after.lower)));
            if (!quantity) return;
            context.report({
                ...tokenRange(tokens, i, i + 1),
                message : "Do not use \"about\" for a quantity. Write \"approximately\". Use \"about\" only for a topic, for example \"about the monitor\".",
            });
        });
    },
};
