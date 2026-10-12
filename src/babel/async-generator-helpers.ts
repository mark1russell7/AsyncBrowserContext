import { types, type PluginObject, type PluginPass } from "@babel/core";
import { addNamed } from "@babel/helper-module-imports";

/** The options of the plugin. */
export interface AsyncGeneratorHelpersOptions {
    /** The module that exports `asyncGenerator` and `OverloadYield`. */
    readonly runtime : string;
}

/** The Babel helpers that the runtime replaces, and the export of the runtime for each one. */
const REPLACED_HELPERS : Readonly<Record<string, string>> = {
    wrapAsyncGenerator : "asyncGenerator",
    OverloadYield : "OverloadYield",
};

type HelperGenerator = (name : string) => types.Expression | undefined;

/**
 * The Babel plugin that gives the async generators to the driver of the runtime. It sets the
 * `helperGenerator` of the file, as `@babel/plugin-transform-runtime` does. Thus, the helpers
 * `wrapAsyncGenerator` and `OverloadYield` of `@babel/plugin-transform-async-generator-functions`
 * become imports of `asyncGenerator` and `OverloadYield` from the runtime. The helpers `awaitAsyncGenerator` and `asyncGeneratorDelegate` stay in the
 * file, and they make the `OverloadYield` values of the runtime.
 *
 * The plugin keeps a `helperGenerator` of an earlier plugin for the other helpers.
 */
export function asyncGeneratorHelpersPlugin(_api : unknown, options : object) : PluginObject<PluginPass> {
    const { runtime } = options as AsyncGeneratorHelpersOptions;
    return {
        name : "async-browser-context/async-generator-helpers",
        pre(file : PluginPass["file"]) {
            const previous = file.get("helperGenerator") as HelperGenerator | undefined;
            const imports = new Map<string, types.Expression>();
            const generator : HelperGenerator = (name) => {
                const exported = REPLACED_HELPERS[name];
                if (exported === undefined) {
                    return previous?.(name);
                }
                let local = imports.get(exported);
                if (local === undefined) {
                    local = addNamed(file.path, exported, runtime, { nameHint : exported }) as types.Expression;
                    imports.set(exported, local);
                }
                return types.cloneNode(local);
            };
            file.set("helperGenerator", generator);
        },
    };
}
