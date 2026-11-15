import { types, type NodePath, type PluginPass } from "@babel/core";
import { isRuntimeFunction } from "./runtime-calls.js";
import type { PluginFactory } from "./skip-runtime.js";

/**
 * This function gives `true` for a directive that marks code of the server in React Server
 * Components: `"use server"`, `"use cache"` and `"use cache: <kind>"`. Next.js reads the same
 * three forms. A server action and a `"use cache"` function must stay native async
 * functions without `this` and `arguments`. In the bundle of the browser, Next.js replaces them
 * with references to the server. On the server, the native `AsyncLocalStorage` keeps the context.
 */
export function isServerDirective(value : string) : boolean {
    return value === "use server" || value === "use cache" || value.startsWith("use cache: ");
}

function hasServerDirectiveIn(directives : readonly types.Directive[]) : boolean {
    return directives.some((directive) => isServerDirective(directive.value.value));
}

/** This function gives `true` if `node` is a function with a server directive in its body. */
export function isServerFunction(node : types.Node) : boolean {
    return types.isFunction(node) && node.body.type === "BlockStatement" && hasServerDirectiveIn(node.body.directives);
}

/** This function gives `true` if the preset must not change `node`: a function of the runtime or a server function. */
export function isUnchangedFunction(node : types.Node) : boolean {
    return isRuntimeFunction(node) || isServerFunction(node);
}

/** The words of a server directive. A file without them has no server code, so the check of its paths is fast. */
const SERVER_WORDS = /use (?:server|cache)/;

/** For each file, `false` if its text has no server directive. */
const mayHaveServerCode = new WeakMap<object, boolean>();

function fileMayHaveServerCode(state : PluginPass | undefined) : boolean {
    const file = state?.file as { code? : unknown } | undefined;
    if (file === undefined) {
        return true;
    }
    let result = mayHaveServerCode.get(file);
    if (result === undefined) {
        // Without the text, for example after transformFromAst, the function examines the paths. Babel then gives "".
        result = typeof file.code !== "string" || file.code === "" || SERVER_WORDS.test(file.code);
        mayHaveServerCode.set(file, result);
    }
    return result;
}

/**
 * This function gives `true` if `path` is server code. Server code is in a program with a
 * server directive, or in a server function, or it is a server function.
 */
export function isServerCode(path : NodePath) : boolean {
    for (let current : NodePath | null = path; current !== null; current = current.parentPath) {
        const node = current.node;
        if (types.isProgram(node)) {
            return hasServerDirectiveIn(node.directives);
        }
        if (isServerFunction(node)) {
            return true;
        }
    }
    return false;
}

/** The keys of a visitor that are not visitor functions. */
const NOT_HANDLERS = new Set(["shouldSkip", "denylist", "blacklist", "noScope", "skipKeys", "_exploded", "_verified"]);

type Handler = (this : PluginPass, path : NodePath, state : PluginPass) => void;

function guarded(handler : unknown) : unknown {
    if (typeof handler !== "function") {
        return handler;
    }
    const original = handler as Handler;
    return function serverCodeSkipped(this : PluginPass, path : NodePath, state : PluginPass) : void {
        if (fileMayHaveServerCode(state) && isServerCode(path)) {
            return;
        }
        original.call(this, path, state);
    };
}

function guardedAll(handlers : unknown) : unknown {
    return Array.isArray(handlers) ? handlers.map(guarded) : guarded(handlers);
}

/**
 * This function gives a plugin that operates as `factory`, but not on server code (refer to
 * `isServerCode`). Each visitor function of the plugin first examines its path.
 *
 * The function does not use `path.skip()`. All the plugins of a Babel pass share one
 * traversal. Thus a skip also stops the other presets in that file, for example
 * `@babel/preset-typescript`. The plugins of this library that start their own traversal skip
 * the server functions in that traversal (`isUnchangedFunction`).
 */
export function withServerCodeSkipped(factory : PluginFactory) : PluginFactory {
    return function serverCodeSkippedPlugin(api, options, dirname) {
        const plugin = factory(api, options, dirname);
        if (plugin.visitor === undefined) {
            return plugin;
        }
        const visitor : Record<string, unknown> = {};
        for (const [key, value] of Object.entries(plugin.visitor)) {
            if (NOT_HANDLERS.has(key)) {
                visitor[key] = value;
            } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
                const { enter, exit } = value as { enter? : unknown; exit? : unknown };
                visitor[key] = {
                    ...value,
                    ...(enter === undefined ? {} : { enter : guardedAll(enter) }),
                    ...(exit === undefined ? {} : { exit : guardedAll(exit) }),
                };
            } else {
                visitor[key] = guardedAll(value);
            }
        }
        return { ...plugin, visitor : visitor as typeof plugin.visitor };
    };
}
