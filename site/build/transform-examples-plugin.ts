import type { Plugin } from "vite";
import { transformExamples } from "./transform-examples.ts";

/** The ID of the module that the transform viewer imports. */
export const TRANSFORM_EXAMPLES_ID = "virtual:transform-examples";
const RESOLVED_ID = `\0${TRANSFORM_EXAMPLES_ID}`;

/**
 * This plugin serves `virtual:transform-examples`. The module exports the
 * examples of the transform viewer, with the output of the Babel preset of the
 * library. The plugin makes the output when the site builds, so the page does
 * not load Babel.
 *
 * `virtual:transform-examples?only=<id>` gives only one example, for a page
 * that shows one example, for example the home page.
 */
export function transformExamplesPlugin() : Plugin {
    return {
        name : "abc-site:transform-examples",
        resolveId(id) {
            return id === TRANSFORM_EXAMPLES_ID || id.startsWith(`${TRANSFORM_EXAMPLES_ID}?`) ? `\0${id}` : null;
        },
        async load(id) {
            if (id !== RESOLVED_ID && !id.startsWith(`${RESOLVED_ID}?`)) return null;
            const only = new URLSearchParams(id.slice(RESOLVED_ID.length + 1)).get("only");
            const examples = (await transformExamples()).filter(example => only === null || example.id === only);
            return { code : `export default ${JSON.stringify(examples)};\n`, map : null };
        },
    };
}
