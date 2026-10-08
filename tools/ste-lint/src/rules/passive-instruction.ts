import { findPassives } from "../text/grammar.js";
import { surface, tokenRange, type Rule } from "./rule.js";

/**
 * The rule examines these constructions:
 *
 * - An obligation in the passive voice ("must be set", "has to be called",
 *   "needs to be installed") in any sentence. This is an instruction in a
 *   passive form.
 * - Any passive ("is cleared", "are triggered by CI") in a procedural
 *   sentence: an imperative sentence or an item of an ordered list. A
 *   participle after "be" in a condition clause ("if the file is deleted",
 *   "make sure that the server is started") shows a state, so the rule
 *   ignores it.
 */
export const passiveInstruction : Rule = {
    id : "passive-instruction",
    description : "Find the passive voice in instructions. An instruction uses the active voice and the imperative.",
    ste : "3.4, 3.6, 5.3",
    defaultSeverity : "warning",
    scope : "sentence",
    check(unit, context) {
        for (const sentence of unit.sentences) {
            const procedural = sentence.instruction || unit.list?.ordered === true;
            for (const passive of findPassives(sentence.tokens)) {
                if (!passive.obligation && !(procedural && !passive.inCondition)) continue;
                const from = passive.start;
                const to = passive.participle + 1;
                const phrase = surface(sentence.tokens, from, to);
                const message = passive.obligation
                    ? `"${phrase}" is an instruction in the passive voice. Write the instruction in the imperative, for example "Set the value before you start the monitor."`
                    : `"${phrase}" is in the passive voice. In an instruction, use the active voice: write the imperative, or tell who or what does the action.`;
                context.report({ ...tokenRange(sentence.tokens, from, to), message });
            }
        }
    },
};
