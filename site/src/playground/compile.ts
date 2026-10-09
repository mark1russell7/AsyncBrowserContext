import { parseSync, transformSync, types, type NodePath, type PluginObject, type PluginPass } from "@babel/core";
import preset from "../../../src/babel/preset";
import { instrumentScenario } from "../../build/instrument";
import { HELPER_NAMES } from "../debugger/helper-names";

/** The property of `globalThis` that gives the classes, the helpers and the runtime to the code of the playground. */
export const PLAYGROUND_GLOBAL = "__abcPlayground";

const LIBRARY = "async-browser-context";
const TRACED_LIBRARY = "abc:library";
const RUNTIME = "abc:runtime";

/** With these options, Babel does not read process.env and the file system, so it operates in the browser. */
const BABEL_OPTIONS = { babelrc : false, configFile : false, envName : "production", cwd : "/", root : "/", sourceType : "module" } as const;

/** A problem in the code of the playground, with the line of the problem if Babel gives it. */
export class CompileError extends Error {
    override name = "CompileError";
    constructor(message : string, readonly line? : number, readonly column? : number) {
        super(message);
    }
}

/** This function makes a `CompileError` from an error of Babel: the first line of the message, without the file name. */
function fromBabelError(error : unknown) : CompileError {
    if (error instanceof CompileError) return error;
    const babel = error as { message? : string; loc? : { line : number; column : number } };
    const message = String(babel.message ?? error).split("\n")[0]?.replace(/^unknown file: /, "").replace(/ \(\d+:\d+\)$/, "") ?? "The code has an error.";
    return new CompileError(message, babel.loc?.line, babel.loc?.column);
}

/** The playground can import only the library, and the code cannot export. */
function checkModuleSyntax(source : string) : void {
    const file = parseSync(source, { ...BABEL_OPTIONS, parserOpts : { allowAwaitOutsideFunction : true } });
    for (const statement of file?.program.body ?? []) {
        const line = statement.loc?.start.line;
        if (types.isImportDeclaration(statement)) {
            if (statement.source.value !== LIBRARY) {
                throw new CompileError(`The playground cannot import "${statement.source.value}". Import only from "${LIBRARY}".`, line);
            }
            if (!statement.specifiers.every(specifier => types.isImportSpecifier(specifier))) {
                throw new CompileError(`Use named imports, for example: import { AsyncLocalStorage } from "${LIBRARY}".`, line);
            }
        } else if (types.isExportDeclaration(statement)) {
            throw new CompileError("The code of the playground cannot export.", line);
        }
    }
}

/** This plugin changes each import of the traced library and of the runtime into a read of `globalThis.__abcPlayground`. */
function globalImportsPlugin() : PluginObject<PluginPass> {
    return {
        name : "abc-site:playground-global-imports",
        visitor : {
            ImportDeclaration(path : NodePath<types.ImportDeclaration>) {
                const properties = path.node.specifiers.filter(specifier => types.isImportSpecifier(specifier)).map((specifier) => {
                    const imported = types.isIdentifier(specifier.imported) ? specifier.imported.name : specifier.imported.value;
                    return types.objectProperty(types.identifier(imported), types.identifier(specifier.local.name), false, imported === specifier.local.name);
                });
                const global = types.memberExpression(types.identifier("globalThis"), types.identifier(PLAYGROUND_GLOBAL));
                path.replaceWith(types.variableDeclaration("const", [types.variableDeclarator(types.objectPattern(properties), global)]));
            },
        },
    };
}

/**
 * This function compiles the code of the playground in three steps:
 *
 * 1. The instrumentation of the debugger (refer to `site/build/instrument.ts`).
 * 2. The Babel preset of the library, the same preset as in a real application.
 * 3. A change of the imports into reads of a global object. The page loads
 *    the result as a module from a blob URL, so the module cannot import.
 *
 * The result is a module. Its default export starts the code.
 */
export function compilePlayground(source : string) : string {
    try {
        checkModuleSyntax(source);
        const instrumented = instrumentScenario(source, { library : TRACED_LIBRARY, helpers : HELPER_NAMES });
        const transformed = transformSync(instrumented, { ...BABEL_OPTIONS, presets : [[preset, { runtime : RUNTIME }]] })?.code ?? "";
        return transformSync(transformed, { ...BABEL_OPTIONS, plugins : [() => globalImportsPlugin()] })?.code ?? "";
    } catch (error) {
        throw fromBabelError(error);
    }
}
