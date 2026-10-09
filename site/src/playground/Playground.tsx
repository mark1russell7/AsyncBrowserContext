import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { HighlighterCore } from "shiki/core";
import { ContextDebugger, type DebuggerSource } from "../debugger/ContextDebugger";
import type { ContextMode } from "../debugger/instrumented";
import { scenarioById, scenarios } from "../debugger/run";
import type { Trace } from "../debugger/trace";
import { CodeEditor } from "./CodeEditor";
import { CompileError, compilePlayground } from "./compile";
import { loadHighlighter, tokenize } from "./highlight";
import { tracePlayground } from "./run";
import styles from "./Playground.module.css";

const HASH_KEY = "code=";

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

type RunState =
    | { kind : "ready"; source : DebuggerSource }
    | { kind : "error"; error : CompileError };

let runs = 0;

/**
 * The playground: an editor and the context debugger. The page compiles the
 * code with the instrumentation of the debugger and the Babel preset of the
 * library, in the browser. Then it starts the code with the real library.
 */
export function Playground() {
    const [code, setCode] = useState(() => codeFromAddress() ?? scenarioById("two-requests").source);
    const [shiki, setShiki] = useState<HighlighterCore>();
    const [highlighterDone, setHighlighterDone] = useState(false);
    const [run, setRun] = useState<RunState>();
    const [copied, setCopied] = useState(false);
    const helpId = useId();
    const exampleId = useId();
    const started = useRef(false);

    useEffect(() => {
        loadHighlighter().then(setShiki, () => undefined).finally(() => setHighlighterDone(true));
    }, []);

    const lines = useMemo(() => tokenize(shiki, code), [shiki, code]);

    const start = useCallback((source : string) => {
        let compiled : string;
        try {
            compiled = compilePlayground(source);
        } catch (error) {
            setRun({ kind : "error", error : error instanceof CompileError ? error : new CompileError(String(error)) });
            return;
        }
        runs++;
        const traces = new Map<ContextMode, Promise<Trace>>();
        setRun({
            kind : "ready",
            source : {
                id : `playground-${runs}`,
                title : "playground.js",
                lines : tokenize(shiki, source),
                trace(mode) {
                    let trace = traces.get(mode);
                    if (trace === undefined) {
                        trace = tracePlayground(compiled, mode);
                        traces.set(mode, trace);
                    }
                    return trace;
                },
            },
        });
    }, [shiki]);

    // The first run starts when the highlighter is ready, so that the code panel of the debugger has colors.
    useEffect(() => {
        if (started.current || !highlighterDone) return;
        started.current = true;
        start(code);
    }, [highlighterDone, start, code]);

    const copyLink = () => {
        const address = `${location.origin}${location.pathname}#${HASH_KEY}${encode(code)}`;
        history.replaceState(null, "", address);
        navigator.clipboard?.writeText(address).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
        }, () => undefined);
    };

    const error = run?.kind === "error" ? run.error : undefined;
    return (
        <div className={styles.playground}>
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
                    <button type="button" className="button" data-variant="primary" onClick={() => start(code)}>Run the code</button>
                </span>
            </div>
            <CodeEditor value={code} onChange={setCode} onRun={() => start(code)} lines={lines} errorLine={error?.line} label="The code of the playground" describedBy={helpId} />
            <p id={helpId} className={styles.help}>
                Press <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to start the code. The Tab key indents: press <kbd>Esc</kbd> and then <kbd>Tab</kbd> to move out of the editor.
                The code can use <code>log()</code>, <code>sleep(ms)</code>, <code>fetchUser(id)</code> and <code>save(value)</code> without an import.
            </p>
            {error ? (
                <p className={styles.error} role="alert">
                    {error.line === undefined ? null : <strong>Line {error.line}: </strong>}{error.message}
                </p>
            ) : null}
            {run?.kind === "ready" ? <ContextDebugger source={run.source} /> : run === undefined ? <p className={styles.loading} data-loading="true">The playground loads.</p> : null}
        </div>
    );
}

export default Playground;
