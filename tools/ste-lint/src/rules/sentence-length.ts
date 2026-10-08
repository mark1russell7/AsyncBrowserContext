import { countWords } from "../text/sentences.js";
import type { Rule } from "./rule.js";

export const sentenceLength : Rule = {
    id : "sentence-length",
    description : "An instruction can have no more than 20 words. A description can have no more than 25 words.",
    ste : "5.1, 6.3, 8.4-8.7",
    defaultSeverity : "error",
    scope : "sentence",
    check(unit, context) {
        const { instructionWords, descriptionWords } = context.config.limits;
        for (const sentence of unit.sentences) {
            const limit = sentence.instruction ? instructionWords : descriptionWords;
            if (sentence.words > limit) {
                const message = sentence.instruction
                    ? `This instruction has ${sentence.words} words. Use no more than ${limit} words in an instruction. Divide it into shorter sentences.`
                    : `This sentence has ${sentence.words} words. Use no more than ${limit} words in a descriptive sentence. Divide it into shorter sentences.`;
                context.report({ start : sentence.start, end : sentence.end, message });
            }
            for (const inner of sentence.parentheticals) {
                const words = countWords(inner, { properNouns : context.lexicon.properNounPhrases }).words;
                if (words > descriptionWords) {
                    context.report({
                        start : inner[0]!.start,
                        end : inner[inner.length - 1]!.end,
                        message : `The text in parentheses has ${words} words. It counts as a separate sentence. Use no more than ${descriptionWords} words, or write it as a sentence after this one.`,
                    });
                }
            }
        }
    },
};
