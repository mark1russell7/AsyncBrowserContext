import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { ContextMode } from "../debugger/instrumented";
import { describeLookup, laneColor } from "../debugger/layout";
import { scenarioById, traceScenario } from "../debugger/run";
import type { FrameInfo, Lane, Trace } from "../debugger/trace";
import { FrameGraph } from "../debugger/views";
import styles from "./Home.module.css";

/** This hook starts one scenario with each mode and gives the traces when all are ready. */
function useTraces(id : string, modes : readonly ContextMode[]) : Trace[] | undefined {
    const [traces, setTraces] = useState<Trace[]>();
    const key = modes.join(",");
    useEffect(() => {
        let live = true;
        const scenario = scenarioById(id);
        Promise.all(key.split(",").map(mode => traceScenario(scenario, mode as ContextMode))).then((result) => { if (live) setTraces(result); }, () => undefined);
        return () => { live = false; };
    }, [id, key]);
    return traces;
}

const laneStyle = (lanes : ReadonlyMap<string, Lane>, id : string) => ({ "--lane" : laneColor(lanes.get(id)) } as CSSProperties);

/**
 * The console of the scenario "Two requests at the same time", with a global
 * variable and with the library. The page starts the two runs. The lines are
 * not static text.
 */
export function CompareConsoles() {
    const traces = useTraces("two-requests", ["global-kept", "library"]);
    if (traces === undefined) return <div className={styles.compareLoading} data-loading="true">The two runs start.</div>;
    const [global, library] = traces as [Trace, Trace];
    const lanes = new Map(library.lanes.map(lane => [lane.id, lane]));
    const wrong = global.logs.filter((log, index) => log.text !== library.logs[index]?.text).length;
    return (
        <div className={styles.compareGrid}>
            <figure className={styles.consoleCard} data-kind="global">
                <figcaption>
                    <span className={styles.consoleTitle}>A global variable</span>
                    <span className={styles.consoleNote} data-status="wrong">{wrong} of {global.logs.length} lines have the ID of the other request</span>
                </figcaption>
                <ol>
                    {global.logs.map((log, index) => {
                        const correct = log.text === library.logs[index]?.text;
                        return (
                            <li key={index} data-status={correct ? "correct" : "wrong"}>
                                <span className={styles.consoleIcon} aria-label={correct ? "Correct" : "Wrong"}>{correct ? "✓" : "✗"}</span>
                                <code>{log.text}</code>
                            </li>
                        );
                    })}
                </ol>
            </figure>
            <figure className={styles.consoleCard} data-kind="library">
                <figcaption>
                    <span className={styles.consoleTitle}>async-browser-context</span>
                    <span className={styles.consoleNote} data-status="correct">Each line has the ID of its request</span>
                </figcaption>
                <ol>
                    {library.logs.map((log, index) => (
                        <li key={index} data-status="correct" style={laneStyle(lanes, log.lane)}>
                            <span className={styles.consoleIcon} aria-label="Correct">✓</span>
                            <code><i aria-hidden="true" />{log.text}</code>
                        </li>
                    ))}
                </ol>
            </figure>
        </div>
    );
}

/** The frame graph of the scenario "Nested contexts" at the read with the longest search. */
export function FrameSnapshot() {
    const traces = useTraces("nested", ["library"]);
    const trace = traces?.[0];
    const view = useMemo(() => {
        if (trace === undefined) return undefined;
        const lanes = new Map(trace.lanes.map(lane => [lane.id, lane]));
        const frames = new Map<string, FrameInfo>(trace.frames.map(frame => [frame.id, frame]));
        let best = trace.steps[0];
        for (const step of trace.steps) {
            const longest = Math.max(0, ...step.lookups.map(lookup => lookup.path.length));
            const bestLongest = Math.max(0, ...(best?.lookups.map(lookup => lookup.path.length) ?? []));
            if (longest > bestLongest) best = step;
        }
        return { lanes, frames, index : best?.index ?? 0, lookup : best?.lookups.find(lookup => lookup.path.length > 1) };
    }, [trace]);
    if (trace === undefined || view === undefined) return <div className={styles.snapshotLoading} data-loading="true">The scenario starts.</div>;
    return (
        <figure className={styles.snapshot}>
            <div className={styles.snapshotGraph}>
                <FrameGraph trace={trace} index={view.index} lanes={view.lanes} frames={view.frames} />
            </div>
            {view.lookup ? <figcaption>{describeLookup(view.lookup, view.frames)}</figcaption> : null}
        </figure>
    );
}
