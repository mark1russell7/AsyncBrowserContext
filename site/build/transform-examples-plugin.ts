import type { Plugin } from "vite";
import { TRANSFORM_INPUTS, transformExamples, type TransformExample } from "./transform-examples.ts";

/** The ID of the module that the transform viewer imports. */
export const TRANSFORM_EXAMPLES_ID = "virtual:transform-examples";
const RESOLVED_ID = `\0${TRANSFORM_EXAMPLES_ID}`;

/** The examples of `virtual:transform-examples?only=<id>`. An unknown ID gives an error, not an empty list. */
export function selectExamples(examples : readonly TransformExample[], only : string | null) : TransformExample[] {
    if (only === null) return [...examples];
    const selected = examples.filter(example => example.id === only);
    if (selected.length === 0) {
        throw new Error(`${TRANSFORM_EXAMPLES_ID} has no example "${only}". The examples are: ${examples.map(example => example.id).join(", ")}.`);
    }
    return selected;
}

/**
 * This plugin serves `virtual:transform-examples`. The module exports the
 * examples of the transform viewer, with the output of the Babel preset of the
 * library. The plugin makes the output when the site builds, so the page does
 * not load Babel.
 *
 * `virtual:transform-examples?only=<id>` gives only one example, for a page
 * that shows one example, for example the home page. The plugin transforms
 * the examples one time for each build, also when two modules use them.
 */
export function transformExamplesPlugin() : Plugin {
    let examples : Promise<TransformExample[]> | undefined;
    const allExamples = () : Promise<TransformExample[]> => {
        if (examples === undefined) {
            const attempt = transformExamples(TRANSFORM_INPUTS);
            examples = attempt;
            // After an error, the next load tries again.
            attempt.catch(() => {
                if (examples === attempt) examples = undefined;
            });
        }
        return examples;
    };
    return {
        name : "abc-site:transform-examples",
        buildStart() {
            examples = undefined;
        },
        resolveId(id) {
            return id === TRANSFORM_EXAMPLES_ID || id.startsWith(`${TRANSFORM_EXAMPLES_ID}?`) ? `\0${id}` : null;
        },
        async load(id) {
            if (id !== RESOLVED_ID && !id.startsWith(`${RESOLVED_ID}?`)) return null;
            const only = new URLSearchParams(id.slice(RESOLVED_ID.length + 1)).get("only");
            return { code : `export default ${JSON.stringify(selectExamples(await allExamples(), only))};\n`, map : null };
        },
    };
}
