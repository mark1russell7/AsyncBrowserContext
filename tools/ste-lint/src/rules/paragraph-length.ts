import type { Rule } from "./rule.js";

export const paragraphLength : Rule = {
    id : "paragraph-length",
    description : "A paragraph can have no more than 6 sentences.",
    ste : "6.6",
    defaultSeverity : "warning",
    scope : "paragraph",
    check(unit, context) {
        const limit = context.config.limits.paragraphSentences;
        const count = unit.sentences.length;
        if (count <= limit) return;
        context.report({
            start : unit.start,
            end : unit.end,
            message : `This paragraph has ${count} sentences. Use no more than ${limit} sentences in a paragraph. Divide it into two paragraphs, each with one topic.`,
        });
    },
};
