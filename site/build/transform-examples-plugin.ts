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
 */
export function transformExamplesPlugin() : Plugin {
    return {
        name : "abc-site:transform-examples",
        resolveId(id) {
            return id === TRANSFORM_EXAMPLES_ID ? RESOLVED_ID : null;
        },
        async load(id) {
            if (id !== RESOLVED_ID) return null;
            const examples = await transformExamples();
            return { code : `export default ${JSON.stringify(examples)};\n`, map : null };
        },
    };
}
