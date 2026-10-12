import { types, type PluginObject, type PluginPass } from "@babel/core";
import { addNamed } from "@babel/helper-module-imports";

/** The options of the plugin. */
export interface AsyncGeneratorHelpersOptions {
    /** The module that exports the async generator functions of the runtime. */
    readonly runtime : string;
}

/**
 * The Babel helpers of async generators, and the export of the runtime for each one. The
 * runtime gives all four, so the markers of the body (`OverloadYield`) are always the class of
 * the runtime. Without this, another plugin (for example `@babel/plugin-transform-runtime`) can
 * give `awaitAsyncGenerator` with the class of `@babel/runtime`. Then the driver operates each
 * `await` as a `yield`.
 */
const REPLACED_HELPERS : Readonly<Record<string, string>> = {
    wrapAsyncGenerator : "asyncGenerator",
    OverloadYield : "OverloadYield",
    awaitAsyncGenerator : "awaitAsyncGenerator",
    asyncGeneratorDelegate : "asyncGeneratorDelegate",
};

type HelperGenerator = (name : string) => types.Expression | undefined;

/**
 * The Babel plugin that gives the async generators to the driver of the runtime. It sets the
 * `helperGenerator` of the file, as `@babel/plugin-transform-runtime` does. Thus, the helpers of
 * `@babel/plugin-transform-async-generator-functions` become imports from the runtime.
 *
 * The plugin sets the generator in `Program` enter, after the `pre` methods of all plugins. A
 * preset that comes before this preset in the list operates later, and its `pre` method can set
 * a generator too. This plugin keeps that generator for the other helpers.
 */
export function asyncGeneratorHelpersPlugin(_api : unknown, options : object) : PluginObject<PluginPass> {
    const { runtime } = options as AsyncGeneratorHelpersOptions;
    return {
        name : "async-browser-context/async-generator-helpers",
        visitor : {
            Program(programPath, state) {
                const file = state.file;
                const previous = file.get("helperGenerator") as HelperGenerator | undefined;
                const imports = new Map<string, types.Expression>();
                const generator : HelperGenerator = (name) => {
                    const exported = REPLACED_HELPERS[name];
                    if (exported === undefined) {
                        return previous?.(name);
                    }
                    let local = imports.get(exported);
                    if (local === undefined) {
                        local = addNamed(programPath, exported, runtime, { nameHint : exported }) as types.Expression;
                        imports.set(exported, local);
                    }
                    return types.cloneNode(local);
                };
                file.set("helperGenerator", generator);
            },
        },
    };
}
