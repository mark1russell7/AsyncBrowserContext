import { transformSync, types, type NodePath, type PluginObject, type PluginPass } from "@babel/core";

/** The options of `instrumentScenario`. */
export type InstrumentOptions = {
    /** The module that replaces `async-browser-context`. It also exports the helpers and the trace object. */
    library : string;
    /** The names that a scenario can use without an import, for example `log` and `sleep`. */
    helpers : readonly string[];
};

/** The name of the trace object in the instrumented code. */
export const TRACE = "__trace";
const LIBRARY = "async-browser-context";

function traceCall(method : "at" | "after", line : number, args : types.Expression[] = []) : types.CallExpression {
    return types.callExpression(
        types.memberExpression(types.identifier(TRACE), types.identifier(method)),
        [...args, types.numericLiteral(line)],
    );
}

/** The statements that get no step of their own. A function or class declaration does nothing when it runs. */
function isTraced(path : NodePath<types.Statement>) : boolean {
    return !path.isFunctionDeclaration() && !path.isClassDeclaration() && !path.isEmptyStatement()
        && !path.isImportDeclaration() && !path.isExportDeclaration();
}

function instrumentPlugin(options : InstrumentOptions) : PluginObject<PluginPass> {
    // The plugin changes some nodes in place. This set prevents a second change of the same node.
    const done = new WeakSet<types.Node>();
    return {
        name : "abc-site:instrument-scenario",
        visitor : {
            Program(path) {
                const imports : types.Statement[] = [];
                const rest : types.Statement[] = [];
                for (const statement of path.node.body) {
                    if (types.isImportDeclaration(statement)) {
                        if (statement.source.value === LIBRARY) statement.source = types.stringLiteral(options.library);
                        imports.push(statement);
                    } else {
                        rest.push(statement);
                    }
                }
                const names = [TRACE, ...options.helpers.filter(name => !path.scope.hasBinding(name))];
                const helperImport = types.importDeclaration(
                    names.map(name => types.importSpecifier(types.identifier(name), types.identifier(name))),
                    types.stringLiteral(options.library),
                );
                // The scenario becomes one async function, so that each start makes new variables and new frames.
                const scenario = types.functionDeclaration(types.identifier("scenario"), [], types.blockStatement(rest), false, true);
                path.node.body = [...imports, helperImport, types.exportDefaultDeclaration(scenario)];
                path.node.directives = [];
            },
            Statement(path) {
                const node = path.node;
                if (node.loc == null || done.has(node) || path.listKey !== "body" || !isTraced(path)) return;
                if (!path.parentPath.isBlockStatement()) return;
                done.add(node);
                path.insertBefore(types.expressionStatement(traceCall("at", node.loc.start.line)));
            },
            VariableDeclarator(path) {
                // `const requestId = new AsyncLocalStorage()` gets the option `{ name : "requestId" }`, so the debugger can show the name.
                const { id, init } = path.node;
                if (!types.isIdentifier(id) || !types.isNewExpression(init) || init.arguments.length > 0) return;
                const callee = init.callee;
                const className = types.isIdentifier(callee) ? callee.name : types.isMemberExpression(callee) && types.isIdentifier(callee.property) ? callee.property.name : "";
                if (className !== "AsyncLocalStorage" && className !== "Variable") return;
                init.arguments.push(types.objectExpression([types.objectProperty(types.identifier("name"), types.stringLiteral(id.name))]));
            },
            ArrowFunctionExpression(path) {
                const body = path.node.body;
                if (types.isBlockStatement(body) || body.loc == null) return;
                path.node.body = types.blockStatement([
                    types.expressionStatement(traceCall("at", body.loc.start.line)),
                    types.returnStatement(body),
                ]);
            },
            Loop(path) {
                // Each turn of a loop records a step, also a loop without statements. Thus the playground can stop a loop without an end.
                const node = path.node;
                if (node.loc == null || done.has(node)) return;
                done.add(node);
                const call = types.expressionStatement(traceCall("at", node.loc.start.line));
                if (types.isBlockStatement(node.body)) node.body.body.unshift(call);
                else node.body = types.blockStatement([call, node.body]);
            },
            AwaitExpression(path) {
                const node = path.node;
                if (node.loc == null || done.has(node)) return;
                done.add(node);
                // After the await, the function continues on the same line. The trace records this step.
                path.replaceWith(traceCall("after", node.loc.end.line, [node]));
            },
        },
    };
}

/**
 * This function changes the source of a debugger scenario into a module that
 * records each step:
 *
 * - The import of `async-browser-context` goes to `options.library`, which
 *   wraps the real library and records the frames and the reads.
 * - Before each statement, `__trace.at(line)` records a step.
 * - After each `await`, `__trace.after(value, line)` records the step that
 *   continues the function.
 * - The statements after the imports become the default export, an async
 *   function. Each call starts the scenario again.
 *
 * The Vite plugin of the library transforms the result, as it transforms the
 * other modules of the site.
 */
export function instrumentScenario(source : string, options : InstrumentOptions) : string {
    const result = transformSync(source, {
        babelrc : false,
        configFile : false,
        // With these options, Babel does not read process.env and the file system, so the function also operates in the browser.
        envName : "production",
        cwd : "/",
        root : "/",
        sourceType : "module",
        parserOpts : { allowAwaitOutsideFunction : true },
        plugins : [() => instrumentPlugin(options)],
    });
    if (result?.code == null) throw new Error("The scenario did not compile.");
    return result.code;
}

/** The metadata at the start of a scenario file, in a block comment with `@title` and `@summary` lines. */
export type ScenarioMeta = {
    title : string;
    summary : string;
    /** The position in the list of scenarios. */
    order : number;
};

const HEADER = /^\s*\/\*\*([\s\S]*?)\*\/\s*\n/;

/** This function separates the metadata comment from the code that the debugger shows. */
export function splitScenario(file : string, id : string) : { meta : ScenarioMeta; source : string } {
    const match = HEADER.exec(file);
    if (match === null) throw new Error(`The scenario "${id}" has no metadata comment.`);
    const fields = new Map<string, string>();
    let key : string | undefined;
    for (const raw of (match[1] ?? "").split("\n")) {
        const line = raw.replace(/^\s*\*\s?/, "").trimEnd();
        const field = /^@(\w+)\s*(.*)$/.exec(line);
        if (field !== null) {
            key = field[1] ?? "";
            fields.set(key, field[2] ?? "");
        } else if (key !== undefined && line.trim() !== "") {
            fields.set(key, `${fields.get(key) ?? ""} ${line.trim()}`.trim());
        }
    }
    const title = fields.get("title");
    const summary = fields.get("summary");
    if (title === undefined || summary === undefined) throw new Error(`The scenario "${id}" needs @title and @summary.`);
    return {
        meta : { title, summary, order : Number(fields.get("order") ?? "100") },
        source : file.slice(match[0].length).replace(/\s+$/, "\n"),
    };
}
