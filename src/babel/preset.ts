import type { PresetAPI, PresetObject } from "@babel/core";
import asyncGeneratorFunctions from "@babel/plugin-transform-async-generator-functions";
import asyncToGenerator from "@babel/plugin-transform-async-to-generator";
import { bindGeneratorsPlugin } from "./bind-generators.js";

export { METADATA_KEY } from "./bind-generators.js";

/** The options of the preset. */
export interface PresetOptions {
    /**
     * The module that exports the runtime functions `coroutine` and
     * `bindGenerator`. The default is `async-browser-context/runtime`.
     */
    readonly runtime? : string | undefined;
}

/** The default runtime module. */
export const DEFAULT_RUNTIME = "async-browser-context/runtime";

/**
 * The Babel preset of `async-browser-context`. It changes the code so that the
 * context stays through `await` and `yield`:
 *
 * 1. A plugin of this library binds each generator to the context of its
 *    creation.
 * 2. `@babel/plugin-transform-async-generator-functions` changes async
 *    generators and `for await` loops.
 * 3. `@babel/plugin-transform-async-to-generator` changes each async function
 *    into a generator that the `coroutine` function of the runtime runs.
 *
 * The preset operates with Babel 7.22 and later and with Babel 8. Put it last
 * in the `presets` list: Babel runs the presets in reverse order.
 */
export default function asyncBrowserContextPreset(api : PresetAPI, options : PresetOptions = {}) : PresetObject {
    api.assertVersion("^7.22.0 || ^8.0.0");
    const runtime = options.runtime ?? DEFAULT_RUNTIME;
    return {
        plugins : [
            [bindGeneratorsPlugin, { runtime }],
            asyncGeneratorFunctions,
            [asyncToGenerator, { module : runtime, method : "coroutine" }],
        ],
    };
}
