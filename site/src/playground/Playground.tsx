import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { CodeToken } from "../components/Code/HighlightedCode";
import { ContextDebugger, type DebuggerSource } from "../debugger/ContextDebugger";
import type { ContextMode } from "../debugger/instrumented";
import { scenarioById, scenarios, traceScenario, type DebuggerScenario } from "../debugger/run";
import type { Trace } from "../debugger/trace";
import { CodeEditor } from "./CodeEditor";
import styles from "./Playground.module.css";

const HASH_KEY = "code=";
const FIRST_SCENARIO = "two-requests";

/** Babel and Shiki are large. The page loads them when the reader starts to edit, or when a link contains code. */
const loadCompiler = () => import("./compiler");
const loadHighlight = () => import("./highlight");

type Tokenize = (code : string) => CodeToken[][];

function encode(code : string) : string {
    const bytes = new TextEncoder().encode(code);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decode(text : string) : string | undefined {
    try {
        const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
        return new TextDecoder().decode(Uint8Array.from(binary, character => character.charCodeAt(0)));
    } catch {
        return undefined;
    }
}

/** The code in the address of the page, from a link that the "Copy a link" button made. */
function codeFromAddress() : string | undefined {
    if (typeof location === "undefined") return undefined;
    const hash = location.hash.slice(1);
    return hash.startsWith(HASH_KEY) ? decode(hash.slice(HASH_KEY.length)) : undefined;
}

/** The lines without colors, until Shiki is ready. */
function plainLines(code : string) : CodeToken[][] {
    return code.split("\n").map(line => (line === "" ? [] : [[line, "", ""]]));
}

/** A scenario of the build as a source of the debugger. The build already instrumented and highlighted it. */
function scenarioSource(scenario : DebuggerScenario) : DebuggerSource {
    return { id : `scenario-${scenario.id}`, title : "playground.js", lines : scenario.lines, trace : mode => traceScenario(scenario, mode) };
}

type CompileProblem = { message : string; line? : number | undefined };

type RunState =
    | { kind : "ready"; source : DebuggerSource }
    | { kind : "error"; problem : CompileProblem }
    | { kind : "compiling" };

let runs = 0;

/**
 * The playground: an editor and the context debugger. The page compiles the
 * code with the instrumentation of the debugger and the Babel preset of the
 * library, in the browser. Then it starts the code with the real library.
 * Code that is equal to a scenario uses the scenario of the build, so the
 * page needs Babel only for changed code.
 */
export function Playground() {
    const linked = useMemo(() => codeFromAddress(), []);
    const [code, setCode] = useState(() => linked ?? scenarioById(FIRST_SCENARIO).source);
    const [tokenize, setTokenize] = useState<Tokenize>();
    const [run, setRun] = useState<RunState>(() => (linked === undefined ? { kind : "ready", source : scenarioSource(scenarioById(FIRST_SCENARIO)) } : { kind : "compiling" }));
    const [copied, setCopied] = useState(false);
    const helpId = useId();
    const exampleId = useId();
    const loading = useRef(false);

    /** This function starts to load Shiki and Babel, one time. */
    const prepare = useCallback(() => {
        if (loading.current) return;
        loading.current = true;
        loadHighlight().then(async (module) => {
            const shiki = await module.loadHighlighter();
            setTokenize(() => (source : string) => module.tokenize(shiki, source));
        }).catch(() => undefined);
        loadCompiler().catch(() => undefined);
    }, []);

    /** The highlighted lines of `source`: the lines of the build for an unchanged scenario, else the lines of Shiki. */
    const linesOf = useCallback((source : string) : CodeToken[][] => {
        const scenario = scenarios.find(candidate => candidate.source === source);
        if (scenario) return scenario.lines.map(line => [...line]);
        return tokenize === undefined ? plainLines(source) : tokenize(source);
    }, [tokenize]);

    const lines = useMemo(() => linesOf(code), [linesOf, code]);

    const start = useCallback(async (source : string) => {
        const scenario = scenarios.find(candidate => candidate.source === source);
        if (scenario) {
            setRun({ kind : "ready", source : scenarioSource(scenario) });
            return;
        }
        prepare();
        setRun({ kind : "compiling" });
        const compiler = await loadCompiler();
        let compiled : string;
        try {
            compiled = compiler.compilePlayground(source);
        } catch (error) {
            const problem = error as { message? : string; line? : number };
            setRun({ kind : "error", problem : { message : String(problem.message ?? error), line : problem.line } });
            return;
        }
        runs++;
        const traces = new Map<ContextMode, Promise<Trace>>();
        setRun({
            kind : "ready",
            source : {
                id : `playground-${runs}`,
                title : "playground.js",
                lines : linesOf(source),
                trace(mode) {
                    let trace = traces.get(mode);
                    if (trace === undefined) {
                        trace = compiler.tracePlayground(compiled, mode);
                        traces.set(mode, trace);
                    }
                    return trace;
                },
            },
        });
    }, [linesOf, prepare]);

    // Code from a link must compile at the start.
    useEffect(() => {
        if (linked !== undefined) void start(linked);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const copyLink = () => {
        const address = `${location.origin}${location.pathname}#${HASH_KEY}${encode(code)}`;
        history.replaceState(null, "", address);
        navigator.clipboard?.writeText(address).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
        }, () => undefined);
    };

    const problem = run.kind === "error" ? run.problem : undefined;
    return (
        <div className={styles.playground} onFocus={prepare} onPointerEnter={prepare}>
            <div className={styles.toolbar}>
                <label className={styles.field} htmlFor={exampleId}>
                    Start from
                    <select id={exampleId} defaultValue="" onChange={(event) => { if (event.target.value) setCode(scenarioById(event.target.value).source); }}>
                        <option value="" disabled>a scenario</option>
                        {scenarios.map(scenario => <option key={scenario.id} value={scenario.id}>{scenario.title}</option>)}
                    </select>
                </label>
                <span className={styles.toolbarEnd}>
                    <button type="button" className="button" onClick={copyLink}>{copied ? "Copied" : "Copy a link"}</button>
                    <button type="button" className="button" data-variant="primary" onClick={() => void start(code)}>Run the code</button>
                </span>
            </div>
            <CodeEditor value={code} onChange={setCode} onRun={() => void start(code)} lines={lines} errorLine={problem?.line} label="The code of the playground" describedBy={helpId} />
            <p id={helpId} className={styles.help}>
                Press <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to start the code. The Tab key indents: press <kbd>Esc</kbd> and then <kbd>Tab</kbd> to move out of the editor.
                The code can use <code>log()</code>, <code>sleep(ms)</code>, <code>fetchUser(id)</code> and <code>save(value)</code> without an import.
            </p>
            {problem ? (
                <p className={styles.error} role="alert">
                    {problem.line === undefined ? null : <strong>Line {problem.line}: </strong>}{problem.message}
                </p>
            ) : null}
            {run.kind === "ready" ? <ContextDebugger source={run.source} /> : null}
            {run.kind === "compiling" ? <p className={styles.loading} data-loading="true">The page compiles the code.</p> : null}
        </div>
    );
}

export default Playground;
