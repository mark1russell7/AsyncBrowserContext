import { transformAsync } from "@babel/core";
import type { Plugin } from "vite";
import preset, { DEFAULT_RUNTIME, METADATA_KEY } from "../babel/preset.js";

/** A pattern of module IDs: a regular expression or a function. */
export type ModuleFilter = RegExp | ((id : string) => boolean);

/** The options of the Vite plugin. */
export interface AsyncContextPluginOptions {
    /**
     * The modules to transform. The default is all JavaScript and TypeScript
     * modules, also the modules in `node_modules`, and the JavaScript of Vue,
     * Svelte, Astro and MDX components. This filter can only select from these
     * modules: the plugin does not transform styles.
     */
    readonly include? : ModuleFilter | undefined;
    /** The modules not to transform. */
    readonly exclude? : ModuleFilter | undefined;
    /**
     * The runtime module. It must export the six names of `async-browser-context/runtime`.
     * The default is `async-browser-context/runtime`.
     */
    readonly runtime? : string | undefined;
    /**
     * Give the name of each async function to the callback hooks. The default
     * is `true`. Refer to the option `names` of the Babel preset.
     */
    readonly names? : boolean | undefined;
    /**
     * Also transform the modules of server-side rendering. The default is
     * `false`, because on Node.js the native `AsyncLocalStorage` keeps the
     * context.
     */
    readonly ssr? : boolean | undefined;
}

const SCRIPT = /\.[cm]?[jt]sx?$/;
/** The component files that other Vite plugins compile to JavaScript before this plugin operates. */
const COMPONENT = /\.(?:vue|svelte|astro|mdx)$/;
/** The parts of a component that are styles, not JavaScript, for example `App.vue?vue&type=style&lang.css`. */
const STYLE_QUERY = /[?&](?:type=style|lang\.(?:css|scss|sass|less|styl|stylus|pcss|postcss|sss))(?:&|$)/;
/** A module without these words has no async function, generator or `for await`. */
const MIGHT_CHANGE = /\basync\b|\byield\b|function\s*\*/;
/** The runtime of this library. The plugin must not transform it. */
const OWN_RUNTIME = /[\\/]async-browser-context[\\/]dist[\\/]/;
/** The marks of a CommonJS module. */
const COMMONJS = /\brequire\s*\(|\bmodule\.exports\b|\bexports\.[A-Za-z_$]/;

function matches(filter : ModuleFilter, id : string) : boolean {
    return filter instanceof RegExp ? filter.test(id) : filter(id);
}

/**
 * This function gives the source type for Babel. Vite serves each module as an ES module, also
 * a worker or a file with only a dynamic `import()`. With "unambiguous", Babel reads such a file
 * as a script and adds a `require()` of the runtime, which a browser does not have. Thus only a
 * `.cjs` or `.cts` file, or a file with CommonJS marks, gets "unambiguous". Babel then reads it
 * as a script, unless it has a static import or export. A text of the code that looks like an
 * import, for example in a string, does not change this.
 */
function sourceTypeOf(file : string, code : string) : "module" | "unambiguous" {
    return /\.c[jt]s$/.test(file) || COMMONJS.test(code) ? "unambiguous" : "module";
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
    // One presets array for all modules, so the configuration cache of Babel operates
    const presets : NonNullable<NonNullable<Parameters<typeof transformAsync>[1]>["presets"]> = [[preset, { runtime, names : options.names }]];
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
                if (!(SCRIPT.test(file) || COMPONENT.test(file)) || STYLE_QUERY.test(id) || OWN_RUNTIME.test(file)) {
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
                    sourceType : sourceTypeOf(file, code),
                    sourceMaps : true,
                    // The map of Vite describes the code that this plugin gets, not a map file of the module
                    inputSourceMap : false,
                    // Large modules, for example the dependency bundles of Vite, keep their format
                    compact : false,
                    presets,
                });
                // Without the options ignore and only, Babel gives a result with code. With sourceMaps, it also gives a map.
                const { code : output, map, metadata } = result as { code : string; map : object; metadata : Record<string, unknown> };
                if (metadata[METADATA_KEY] !== true) {
                    return null;
                }
                // A source map in JSON text satisfies both Rollup and Rolldown
                return { code : output, map : JSON.stringify(map) };
            },
        },
    };
}
