import type { PluginItem, PresetAPI, PresetObject } from "@babel/core";
import asyncGeneratorFunctions from "@babel/plugin-transform-async-generator-functions";
import asyncToGenerator from "@babel/plugin-transform-async-to-generator";
import { bindGeneratorsPlugin } from "./bind-generators.js";
import { nameCoroutinesPlugin } from "./name-coroutines.js";

export { METADATA_KEY } from "./bind-generators.js";

/** The options of the preset. */
export interface PresetOptions {
    /**
     * The module that exports the runtime functions `coroutine` and
     * `bindGenerator`. The default is `async-browser-context/runtime`.
     */
    readonly runtime? : string | undefined;
    /**
     * Give the name of each async function to `coroutine`, for the callback
     * hooks. The default is `true`. With `false`, the hooks get no name for the
     * steps after an `await`. The code is then smaller by 0.1 to 1.6 percent
     * of its gzip size (`pnpm bench:size`).
     */
    readonly names? : boolean | undefined;
}

/** The default runtime module. */
export const DEFAULT_RUNTIME = "async-browser-context/runtime";

/**
 * The Babel preset of `async-browser-context`. It changes the code so that the
 * context stays through `await` and `yield`:
 *
 * 1. A plugin of this library binds each generator to the context of its
 *    creation.
 * 2. A plugin of this library gives the name of each async function to
 *    `coroutine`, for the callback hooks. The option `names: false` removes
 *    this step.
 * 3. `@babel/plugin-transform-async-generator-functions` changes async
 *    generators and `for await` loops.
 * 4. `@babel/plugin-transform-async-to-generator` changes each async function
 *    into a generator that the `coroutine` function of the runtime operates.
 *
 * The preset operates with Babel 7.22 and later and with Babel 8. Put it last
 * in the `presets` list: Babel uses the presets in reverse order.
 */
export default function asyncBrowserContextPreset(api : PresetAPI, options : PresetOptions = {}) : PresetObject {
    api.assertVersion("^7.22.0 || ^8.0.0");
    const runtime = options.runtime ?? DEFAULT_RUNTIME;
    const names : PluginItem[] = options.names === false ? [] : [[nameCoroutinesPlugin, { runtime }]];
    return {
        plugins : [
            [bindGeneratorsPlugin, { runtime }],
            ...names,
            asyncGeneratorFunctions,
            [asyncToGenerator, { module : runtime, method : "coroutine" }],
        ],
    };
}
