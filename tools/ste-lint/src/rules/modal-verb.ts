import { isClauseStart } from "../text/grammar.js";
import { isNumber, isWord, type Token } from "../text/tokens.js";
import { DETERMINERS } from "../text/words.js";
import { forEachToken, surface, tokenRange, type Rule } from "./rule.js";

// These tables are maps, not object literals, so a word such as "constructor" does not find an Object property.
const SINGLE : ReadonlyMap<string, string> = new Map([
    ["should", "Write \"must\" for an obligation, or \"if\" for a condition (\"If X occurs, ...\")."],
    ["shouldn", "Write \"must not\" for an obligation."],
    ["may", "Write \"can\" for a possibility or a permission, or \"possibly\"."],
    ["might", "Write \"can\" or \"possibly\"."],
    ["would", "Write \"can\", or use a simple tense (\"is\", \"gives\")."],
    ["wouldn", "Write \"cannot\", or use a simple tense (\"is not\")."],
    ["shall", "Write \"must\"."],
]);

const CONTRACTIONS : ReadonlyMap<string, string> = new Map([
    ["shouldn't", "shouldn"],
    ["wouldn't", "wouldn"],
    ["mightn't", "might"],
    ["shan't", "shall"],
    ["mayn't", "may"],
]);

const IMPERATIVE_HELP = "Write the instruction in the imperative (\"Do X\"), or use \"must\".";
const NECESSARY_HELP = "Write the instruction in the imperative (\"Do X\"), or use \"must\" or \"it is necessary to\".";

const WITH_TO : ReadonlyMap<string, string> = new Map([
    ["ought", "Write \"must\"."],
    ["have", IMPERATIVE_HELP],
    ["has", IMPERATIVE_HELP],
    ["had", "Use the simple past tense of the verb, or \"must\"."],
    ["having", "Rewrite the sentence with \"must\" or with the imperative."],
    ["need", NECESSARY_HELP],
    ["needs", NECESSARY_HELP],
    ["needed", "Write \"it was necessary to\", or rewrite the sentence."],
]);

/** True when "May" is the month: "May 2026", "3 May". */
function isMonth(tokens : readonly Token[], index : number) : boolean {
    const token = tokens[index]!;
    if (token.text !== "May") return false;
    return !isClauseStart(tokens, index) || isNumber(tokens[index + 1]) || isNumber(tokens[index - 1]);
}

export const modalVerb : Rule = {
    id : "modal-verb",
    description : "Find modal verbs that are not approved: should, may, might, would, shall, ought to, have to, need to.",
    ste : "3.1, 3.4, 5.3",
    defaultSeverity : "error",
    scope : "word",
    check(unit, context) {
        forEachToken(unit, (tokens, i) => {
            const token = tokens[i]!;
            if (!isWord(token)) return;
            const key = CONTRACTIONS.get(token.lower) ?? token.lower;
            const help = SINGLE.get(key);
            if (help !== undefined) {
                if (key === "may" && isMonth(tokens, i)) return;
                context.report({ ...tokenRange(tokens, i, i + 1), message : `Do not use the modal verb "${token.text}". ${help}` });
                return;
            }
            const withTo = WITH_TO.get(key);
            const next = tokens[i + 1];
            if (withTo === undefined || !isWord(next) || next.lower !== "to") return;
            const previous = tokens[i - 1];
            // "the need to ..." is a noun phrase, not a modal verb.
            if (key.startsWith("need") && isWord(previous) && DETERMINERS.has(previous.lower)) return;
            context.report({ ...tokenRange(tokens, i, i + 2), message : `Do not use "${surface(tokens, i, i + 2)}". ${withTo}` });
        });
    },
};
