import { isWord } from "../text/tokens.js";
import { forEachToken, tokenRange, type Rule } from "./rule.js";

// A map, not an object literal, so that a word such as "constructor" does not find an Object property.
const HELP : ReadonlyMap<string, { readonly name : string; readonly help : string }> = new Map([
    ["e.g", { name : "e.g.", help : "Write \"for example\"." }],
    ["eg", { name : "eg.", help : "Write \"for example\"." }],
    ["i.e", { name : "i.e.", help : "Write \"that is\", or write a separate sentence." }],
    ["ie", { name : "ie.", help : "Write \"that is\", or write a separate sentence." }],
    ["etc", { name : "etc.", help : "Give all the items, or write \"for example\" before the items." }],
    ["vs", { name : "vs.", help : "Write \"compared to\", \"and\" or \"or\"." }],
    ["viz", { name : "viz.", help : "Write \"that is\" or \"for example\"." }],
    ["cf", { name : "cf.", help : "Write \"compare with\" or \"refer to\"." }],
]);

/** Abbreviations that are a problem only with a period after them, because the letters alone can be another word. */
const NEEDS_PERIOD = new Set(["eg", "ie", "cf"]);

export const latinAbbreviation : Rule = {
    id : "latin-abbreviation",
    description : "Find Latin abbreviations: e.g., i.e., etc., vs., viz., cf. and et al.",
    ste : "GR-6",
    defaultSeverity : "error",
    scope : "word",
    check(unit, context) {
        forEachToken(unit, (tokens, i) => {
            const token = tokens[i]!;
            if (!isWord(token)) return;
            const next = tokens[i + 1];
            const period = next !== undefined && next.kind === "punct" && next.text === "." && !next.spaceBefore;
            const end = period ? i + 2 : i + 1;
            if (token.lower === "et" && isWord(next) && next.lower === "al") {
                const after = tokens[i + 2];
                const withPeriod = after !== undefined && after.text === "." && !after.spaceBefore;
                context.report({ ...tokenRange(tokens, i, withPeriod ? i + 3 : i + 2), message : "Do not use \"et al.\". Write \"and others\", or give the names." });
                return;
            }
            const entry = HELP.get(token.lower);
            if (entry === undefined) return;
            // "VS" in capital letters is a name (for example "VS Code"), not "versus".
            if (token.lower === "vs" && token.text === "VS") return;
            if (NEEDS_PERIOD.has(token.lower) && (!period || token.text !== token.lower)) return;
            context.report({ ...tokenRange(tokens, i, end), message : `Do not use the Latin abbreviation "${entry.name}". ${entry.help}` });
        });
    },
};
