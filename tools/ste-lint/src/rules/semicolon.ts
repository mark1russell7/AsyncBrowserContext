import { forEachToken, tokenRange, type Rule } from "./rule.js";

export const semicolon : Rule = {
    id : "semicolon",
    description : "Find semicolons in prose. Semicolons in code spans are not prose.",
    ste : "8.1",
    defaultSeverity : "error",
    scope : "word",
    check(unit, context) {
        forEachToken(unit, (tokens, i) => {
            const token = tokens[i]!;
            if (token.kind !== "punct" || (token.text !== ";" && token.text !== "；")) return;
            context.report({
                ...tokenRange(tokens, i, i + 1),
                message : "Do not use a semicolon. Write two sentences, or use a comma and \"and\" or \"but\". For a list of items, use a vertical list.",
            });
        });
    },
};
