import { Variable } from "async-browser-context";
import { useEffect, useRef, useState } from "react";
import styles from "./Explore.module.css";

type Registration = "listener" | "onclick";

/** One click that a handler got. */
type LogEntry = {
    id : number;
    handler : string;
    /** Who dispatched the event: the browser (a trusted event) or code in a context. */
    dispatcher : string;
    expected : string;
    seen : string;
};

const NO_VALUE = "(root)";

/**
 * The demonstration of rule C13. The reader adds a listener in context A and
 * sets `onclick` in context B. The browser dispatches a click of the reader.
 * Thus, each handler gets the context of its registration.
 * A dispatch from context C gives C to each handler.
 */
export function EventRuleDemo() {
    const targetRef = useRef<HTMLButtonElement>(null);
    const variableRef = useRef(new Variable<string>({ name : "requestId" }));
    const dispatcherRef = useRef<{ label : string; context : string | undefined }>({ label : "", context : undefined });
    const nextId = useRef(1);
    const [registered, setRegistered] = useState<ReadonlySet<Registration>>(new Set());
    const [log, setLog] = useState<LogEntry[]>([]);
    const cleanups = useRef<(() => void)[]>([]);

    useEffect(() => () => {
        for (const cleanup of cleanups.current) cleanup();
        cleanups.current = [];
    }, []);

    const handle = (handler : string, registeredIn : string) => (event : Event) : void => {
        const variable = variableRef.current;
        const seen = variable.get() ?? NO_VALUE;
        const dispatcher = event.isTrusted ? "the browser (your click)" : dispatcherRef.current.label;
        const expected = event.isTrusted || dispatcherRef.current.context === undefined ? registeredIn : dispatcherRef.current.context;
        const entry : LogEntry = { id : nextId.current++, handler, dispatcher, expected, seen };
        setLog(entries => [entry, ...entries].slice(0, 12));
    };

    const register = (kind : Registration) : void => {
        const target = targetRef.current;
        if (!target || registered.has(kind)) return;
        const variable = variableRef.current;
        if (kind === "listener") {
            const listener = handle("Listener (added in context A)", "A");
            variable.run("A", () => target.addEventListener("click", listener));
            cleanups.current.push(() => target.removeEventListener("click", listener));
        } else {
            variable.run("B", () => {
                target.onclick = handle("onclick (set in context B)", "B");
            });
            cleanups.current.push(() => { target.onclick = null; });
        }
        setRegistered(previous => new Set([...previous, kind]));
    };

    const dispatchFromCode = (context : string | undefined) : void => {
        const target = targetRef.current;
        if (!target) return;
        if (context === undefined) {
            dispatcherRef.current = { label : "code in the root context", context : undefined };
            target.click();
        } else {
            dispatcherRef.current = { label : `code in context ${context}`, context };
            variableRef.current.run(context, () => target.click());
        }
        dispatcherRef.current = { label : "", context : undefined };
    };

    return (
        <div className={styles.widget}>
            <div className={styles.toolbar}>
                <button type="button" className="button" disabled={registered.has("listener")} onClick={() => register("listener")}>
                    1. Add a listener in context A
                </button>
                <button type="button" className="button" disabled={registered.has("onclick")} onClick={() => register("onclick")}>
                    2. Set onclick in context B
                </button>
            </div>
            <div className={styles.toolbar}>
                <button ref={targetRef} type="button" className={`button ${styles.target}`} data-variant="primary">
                    3. Click this button
                </button>
                <button type="button" className="button" onClick={() => dispatchFromCode("C")}>
                    Dispatch a click from context C
                </button>
                <button type="button" className="button" onClick={() => dispatchFromCode(undefined)}>
                    Dispatch a click from the root context
                </button>
            </div>
            {log.length === 0 ? (
                <p className={styles.meta}>Add the handlers, then click the button. Each click adds a line here.</p>
            ) : (
                <ol className={styles.log} aria-live="polite" aria-label="Clicks">
                    {log.map(entry => (
                        <li key={entry.id} className={styles.logEntry} data-status={entry.seen === entry.expected ? "correct" : "wrong"}>
                            <strong>{entry.handler}</strong>: dispatched by {entry.dispatcher}. The handler got{" "}
                            <code>{entry.seen}</code>. The rule gives <code>{entry.expected}</code>.
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
}

export default EventRuleDemo;
