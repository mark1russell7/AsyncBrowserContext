import { transformAsync } from "@babel/core";
import type { Plugin } from "vite";
import preset, { DEFAULT_RUNTIME, METADATA_KEY } from "../babel/preset.js";

/** A pattern of module IDs: a regular expression or a function. */
export type ModuleFilter = RegExp | ((id : string) => boolean);

/** The options of the Vite plugin. */
export interface AsyncContextPluginOptions {
    /**
     * The modules to transform. The default is all JavaScript and TypeScript
     * modules, also the modules in `node_modules`.
     */
    readonly include? : ModuleFilter | undefined;
    /** The modules not to transform. */
    readonly exclude? : ModuleFilter | undefined;
    /** The runtime module. The default is `async-browser-context/runtime`. */
    readonly runtime? : string | undefined;
    /**
     * Also transform the modules of server-side rendering. The default is
     * `false`, because on Node.js the native `AsyncLocalStorage` keeps the
     * context.
     */
    readonly ssr? : boolean | undefined;
}

const SCRIPT = /\.[cm]?[jt]sx?$/;
/** A module without these words has no async function, generator or `for await`. */
const MIGHT_CHANGE = /\basync\b|\byield\b|function\s*\*/;
/** The runtime of this library. The plugin must not transform it. */
const OWN_RUNTIME = /[\\/]async-browser-context[\\/]dist[\\/]/;

function matches(filter : ModuleFilter, id : string) : boolean {
    return filter instanceof RegExp ? filter.test(id) : filter(id);
}

/**
 * The Vite plugin of `async-browser-context`. It applies the Babel preset to
 * the modules of the application and of its dependencies. Thus, the context
 * stays through `await` also in dependencies.
 *
 * The plugin operates after the other plugins (`enforce: "post"`), so it gets
 * JavaScript, after TypeScript and JSX are compiled.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from "vite";
 * import { asyncContext } from "async-browser-context/vite";
 *
 * export default defineConfig({ plugins : [asyncContext()] });
 * ```
 */
export function asyncContext(options : AsyncContextPluginOptions = {}) : Plugin {
    const runtime = options.runtime ?? DEFAULT_RUNTIME;
    return {
        name : "async-browser-context",
        enforce : "post",
        transform : {
            filter : { code : MIGHT_CHANGE },
            async handler(code, id, transformOptions) {
                if (transformOptions?.ssr === true && options.ssr !== true) {
                    return null;
                }
                if (id.startsWith("\0")) {
                    return null;
                }
                const file = id.split("?", 1)[0] ?? id;
                if (!SCRIPT.test(file) || OWN_RUNTIME.test(file)) {
                    return null;
                }
                if (options.include !== undefined && !matches(options.include, file)) {
                    return null;
                }
                if (options.exclude !== undefined && matches(options.exclude, file)) {
                    return null;
                }
                if (!MIGHT_CHANGE.test(code)) {
                    return null;
                }
                const result = await transformAsync(code, {
                    filename : file,
                    babelrc : false,
                    configFile : false,
                    sourceType : "unambiguous",
                    sourceMaps : true,
                    presets : [[preset, { runtime }]],
                });
                const changed = (result?.metadata as Record<string, unknown> | undefined)?.[METADATA_KEY] === true;
                if (result?.code == null || !changed) {
                    return null;
                }
                // A source map in JSON text satisfies both Rollup and Rolldown
                return { code : result.code, map : result.map == null ? null : JSON.stringify(result.map) };
            },
        },
    };
}
