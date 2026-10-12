import type { PluginItem, PresetAPI, PresetObject } from "@babel/core";
import asyncGeneratorFunctions from "@babel/plugin-transform-async-generator-functions";
import asyncToGenerator from "@babel/plugin-transform-async-to-generator";
import explicitResourceManagement from "@babel/plugin-transform-explicit-resource-management";
import { asyncGeneratorHelpersPlugin } from "./async-generator-helpers.js";
import { bindGeneratorsPlugin } from "./bind-generators.js";
import { nameCoroutinesPlugin } from "./name-coroutines.js";
import { skipRuntimePlugin, withRuntimeSkipped, type PluginFactory } from "./skip-runtime.js";
import { staticMembersPlugin } from "./static-members.js";

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

/** The plugin of Babel for async generators, without a change of the functions of the runtime (skip-runtime.ts). */
const asyncGeneratorFunctionsOutsideRuntime = withRuntimeSkipped(asyncGeneratorFunctions as unknown as PluginFactory);

/** The default runtime module. */
export const DEFAULT_RUNTIME = "async-browser-context/runtime";

/**
 * The Babel preset of `async-browser-context`. It changes the code so that the
 * context stays through `await` and `yield`. It does not change the runtime
 * of the library, also when it transforms `node_modules`.
 *
 * 1. A plugin of this library skips the native async functions of the
 *    runtime, which a directive marks.
 * 2. A plugin of this library binds each sync generator to the context of
 *    its creation.
 * 3. A plugin of this library gives the name of each async function to
 *    `coroutine`, for the callback hooks. The option `names: false` removes
 *    this step.
 * 4. A plugin of this library moves the static class members with async arrow
 *    functions into static private methods. Thus `this` and `super` stay
 *    correct (static-members.ts).
 * 5. A plugin of this library gives the async generators to the helpers of the
 *    runtime, in place of the Babel helpers.
 * 6. `@babel/plugin-transform-explicit-resource-management` changes `using` and
 *    `await using` declarations, with Babel 7.23.9 and later.
 * 7. `@babel/plugin-transform-async-generator-functions` changes async
 *    generators and `for await` loops.
 * 8. `@babel/plugin-transform-async-to-generator` changes each async function
 *    into a generator that the `coroutine` function of the runtime operates.
 *
 * The preset operates with Babel 7.22 and later and with Babel 8. Put it last
 * in the `presets` list: Babel uses the presets in reverse order.
 */
export default function asyncBrowserContextPreset(api : PresetAPI, options : PresetOptions = {}) : PresetObject {
    api.assertVersion("^7.22.0 || ^8.0.0");
    const runtime = options.runtime ?? DEFAULT_RUNTIME;
    const names : PluginItem[] = options.names === false ? [] : [[nameCoroutinesPlugin, { runtime }]];
    // The async transform keeps an `await using` declaration, which is a SyntaxError in a generator
    const resources : PluginItem[] = supportsResourceManagement(api.version) ? [explicitResourceManagement] : [];
    return {
        plugins : [
            skipRuntimePlugin,
            [bindGeneratorsPlugin, { runtime }],
            ...names,
            staticMembersPlugin,
            [asyncGeneratorHelpersPlugin, { runtime }],
            ...resources,
            asyncGeneratorFunctionsOutsideRuntime,
            [asyncToGenerator, { module : runtime, method : "coroutine" }],
        ],
    };
}

/** This function gives `true` for a version of Babel that the plugin of explicit resource management accepts: 7.23.9 or later. */
export function supportsResourceManagement(version : string | undefined) : boolean {
    if (typeof version !== "string") {
        return false;
    }
    const [major = 0, minor = 0, patch = 0] = version.split(/[.+-]/).map(Number);
    return major > 7 || (major === 7 && (minor > 23 || (minor === 23 && patch >= 9)));
}
