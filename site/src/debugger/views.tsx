import { Fragment, useId, useMemo, useRef, type CSSProperties, type PointerEvent } from "react";
import type { DebuggerScenario } from "virtual:debugger-scenarios";
import { describeStep, edgePath, frameState, laneColor, layoutFrames, NODE_HEIGHT, NODE_WIDTH } from "./layout";
import type { FrameInfo, Lane, Trace } from "./trace";
import styles from "./Debugger.module.css";

/** A style object with CSS custom properties. */
type Vars = CSSProperties & Record<`--${string}`, string>;

const laneStyle = (lane : Lane | undefined) : Vars => ({ "--lane" : laneColor(lane) });

export type ViewProps = {
    trace : Trace;
    index : number;
    lanes : ReadonlyMap<string, Lane>;
    frames : ReadonlyMap<string, FrameInfo>;
};

/** The code of the scenario. The line of the current step has the color of its lane. The marks at the left show the lanes of each line until this step. */
export function CodeView({ scenario, trace, index, lanes } : ViewProps & { scenario : DebuggerScenario }) {
    const step = trace.steps[index];
    const visited = useMemo(() => {
        const map = new Map<number, string[]>();
        for (const item of trace.steps.slice(0, index + 1)) {
            const list = map.get(item.line) ?? [];
            if (!list.includes(item.lane)) list.push(item.lane);
            map.set(item.line, list);
        }
        return map;
    }, [trace, index]);
    return (
        <pre className={styles.code} aria-label={`The code of the scenario. ${step ? `Line ${step.line} is active.` : ""}`}>
            <code>
                {scenario.lines.map((tokens, position) => {
                    const line = position + 1;
                    const active = step?.line === line;
                    return (
                        <span key={line} className={styles.line} data-active={active ? "true" : undefined} style={active ? laneStyle(lanes.get(step.lane)) : undefined}>
                            <span className={styles.gutter} aria-hidden="true">{line}</span>
                            <span className={styles.marks} aria-hidden="true">
                                {(visited.get(line) ?? []).map(lane => <i key={lane} style={laneStyle(lanes.get(lane))} />)}
                            </span>
                            <span className={styles.text}>
                                {tokens.length === 0 ? " " : tokens.map(([text, light, dark, italic], key) => (
                                    <span key={key} className={styles.token} data-italic={italic === 1 ? "true" : undefined} style={{ "--l" : light, "--d" : dark } as Vars}>{text}</span>
                                ))}
                            </span>
                            {active && step.kind === "resume" ? <span className={styles.resumed}>after await</span> : null}
                        </span>
                    );
                })}
            </code>
        </pre>
    );
}

/** The reads of the current step, below the code: the variable, the value, and the frame that gave the value. */
export function ReadsBar({ trace, index, lanes } : ViewProps) {
    const step = trace.steps[index];
    const lookups = step?.lookups ?? [];
    return (
        <div className={styles.reads} style={laneStyle(lanes.get(step?.lane ?? "root"))} aria-live="polite">
            <span className={styles.readsLabel}>Reads</span>
            {lookups.length === 0 ? <span className={styles.readsNone}>No read at this step</span> : lookups.map((lookup, key) => (
                <span key={key} className={styles.read}>
                    <code>{lookup.variable}</code>
                    <span aria-hidden="true">→</span>
                    <strong>{lookup.value}</strong>
                    <span className={styles.readFrom}>{lookup.path.length === 0 ? "global" : lookup.holderId === undefined ? "no frame" : `from ${lookup.holderId}`}</span>
                </span>
            ))}
        </div>
    );
}

/** The time of one segment of the search animation, in milliseconds. */
const SEGMENT_MS = 260;

/**
 * The frame graph. Each box is one frame, and each arrow goes from a frame to
 * its parent. The current frame has a ring in the color of its lane. When
 * code reads a variable, a line goes up the arrows from the current frame to
 * the frame that holds the value.
 */
export function FrameGraph({ trace, index, lanes, frames } : ViewProps) {
    const id = useId().replace(/:/g, "");
    const layout = useMemo(() => layoutFrames(trace.frames), [trace]);
    const step = trace.steps[index];
    const pad = 14;
    const top = 30;
    const viewBox = `${-pad} ${-top} ${layout.width + pad * 2} ${layout.height + top + pad}`;

    const lookups = useMemo(() => {
        const segments : { key : string; d : string; lane : string; delay : number }[] = [];
        const holders : { key : string; frameId : string; found : boolean; delay : number }[] = [];
        let delay = 0;
        for (const [number, lookup] of (step?.lookups ?? []).entries()) {
            for (let position = 0; position + 1 < lookup.path.length; position++) {
                const child = layout.boxes.get(lookup.path[position] ?? "");
                const parent = layout.boxes.get(lookup.path[position + 1] ?? "");
                if (child && parent) {
                    segments.push({ key : `${index}-${number}-${position}`, d : edgePath(child, parent), lane : step?.lane ?? "root", delay });
                    delay += SEGMENT_MS;
                }
            }
            const last = lookup.path.at(-1);
            if (last !== undefined) holders.push({ key : `${index}-${number}`, frameId : lookup.holderId ?? last, found : lookup.holderId !== undefined, delay });
            delay += SEGMENT_MS;
        }
        return { segments, holders };
    }, [step, index, layout]);

    const current = step ? frames.get(step.frameId) : undefined;
    return (
        <svg
            className={styles.graph}
            viewBox={viewBox}
            // The graph is never larger than its size in the view box, so a small tree keeps small text.
            style={{ maxWidth : `${Math.round((layout.width + pad * 2) * 1.1)}px` }}
            role="img"
            aria-label={`The frame graph. ${trace.frames.filter(frame => frameState(frame, index) !== "hidden").length} frames. The current frame is ${current?.id ?? "root"}.`}
        >
            <defs>
                <marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" className={styles.arrowHead} />
                </marker>
            </defs>
            {trace.frames.map((frame) => {
                const parent = frame.parentId === undefined ? undefined : layout.boxes.get(frame.parentId);
                const child = layout.boxes.get(frame.id);
                if (!parent || !child) return null;
                return (
                    <path
                        key={`edge-${frame.id}`}
                        className={styles.edge}
                        data-state={frameState(frame, index)}
                        d={edgePath(child, parent)}
                        markerEnd={`url(#${id}-arrow)`}
                    />
                );
            })}
            {lookups.segments.map(segment => (
                <path
                    key={segment.key}
                    className={styles.trail}
                    d={segment.d}
                    pathLength={1}
                    style={{ ...laneStyle(lanes.get(segment.lane)), animationDelay : `${segment.delay}ms` }}
                />
            ))}
            {trace.frames.map((frame) => {
                const box = layout.boxes.get(frame.id);
                if (!box) return null;
                const isCurrent = step?.frameId === frame.id;
                // A snapshot can make a frame current again after its run() call ended. Then the frame is active again.
                const state = isCurrent ? "active" : frameState(frame, index);
                const root = frame.id === "root";
                const lane = lanes.get(frame.lane);
                return (
                    <g key={frame.id} transform={`translate(${box.x} ${box.y})`}>
                        <g className={styles.node} data-state={state} data-current={isCurrent ? "true" : undefined} data-root={root ? "true" : undefined} style={laneStyle(root ? undefined : lane)}>
                            {isCurrent ? <rect className={styles.halo} x={-5} y={-5} width={NODE_WIDTH + 10} height={NODE_HEIGHT + 10} rx={11} /> : null}
                            <rect className={styles.box} width={NODE_WIDTH} height={NODE_HEIGHT} rx={7} />
                            {root ? null : <rect className={styles.stripe} x={9} y={11} width={3} height={NODE_HEIGHT - 22} rx={1.5} />}
                            <text className={styles.nodeId} x={20} y={22}>{root ? "root frame" : frame.id}</text>
                            {state === "ended" ? <text className={styles.nodeNote} x={NODE_WIDTH - 10} y={22} textAnchor="end">ended</text> : null}
                            <text className={styles.nodeValue} x={20} y={43}>
                                {root ? <tspan className={styles.nodeEmpty}>no values</tspan> : (
                                    <>
                                        <tspan className={styles.nodeVar}>{frame.variable ?? "frame"}</tspan>
                                        {frame.value === undefined ? null : <tspan> = </tspan>}
                                        {frame.value === undefined ? null : <tspan className={styles.nodeVal}>{frame.value}</tspan>}
                                    </>
                                )}
                            </text>
                            {isCurrent ? (
                                <g className={styles.chip} transform={`translate(${NODE_WIDTH - 64} -22)`}>
                                    <rect width={64} height={17} rx={8.5} />
                                    <text x={32} y={12.5} textAnchor="middle">current</text>
                                </g>
                            ) : null}
                        </g>
                    </g>
                );
            })}
            {lookups.holders.map((holder) => {
                const box = layout.boxes.get(holder.frameId);
                if (!box) return null;
                return (
                    <g key={holder.key} transform={`translate(${box.x} ${box.y})`} className={styles.found} data-found={holder.found ? "true" : "false"} style={{ ...laneStyle(lanes.get(step?.lane ?? "root")), animationDelay : `${holder.delay}ms` }}>
                        <rect className={styles.foundRing} x={-3} y={-3} width={NODE_WIDTH + 6} height={NODE_HEIGHT + 6} rx={9} />
                        <g transform={`translate(${NODE_WIDTH - (holder.found ? 52 : 64) - 7} 8)`}>
                            <rect width={holder.found ? 52 : 64} height={17} rx={8.5} />
                            <text x={holder.found ? 26 : 32} y={12.5} textAnchor="middle">{holder.found ? "found" : "no value"}</text>
                        </g>
                    </g>
                );
            })}
        </svg>
    );
}

/** The lanes: one row for each context, and one dot for each step in the row of its context. A click moves to a step. */
export function LaneTimeline({ trace, index, lanes, onSeek } : ViewProps & { onSeek(index : number) : void }) {
    const track = useRef<HTMLDivElement>(null);
    const count = trace.steps.length;
    const position = (step : number) : string => `${count <= 1 ? 50 : (step / (count - 1)) * 100}%`;
    const rows = trace.lanes.filter(lane => trace.steps.some(step => step.lane === lane.id));
    const seek = (event : PointerEvent<HTMLDivElement>) => {
        const box = track.current?.getBoundingClientRect();
        if (!box || box.width === 0) return;
        const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
        onSeek(Math.round(ratio * (count - 1)));
    };
    return (
        <div className={styles.timeline} style={{ "--rows" : String(rows.length) } as Vars}>
            {rows.map((lane, row) => {
                const steps = trace.steps.filter(step => step.lane === lane.id);
                const first = steps[0]?.index ?? 0;
                const last = steps.at(-1)?.index ?? 0;
                return (
                    <Fragment key={lane.id}>
                        <span className={styles.laneLabel} style={{ ...laneStyle(lanes.get(lane.id)), gridRow : row + 1 }} title={lane.label}>
                            <i aria-hidden="true" />{lane.id === "root" ? "root frame" : lane.label}
                        </span>
                        <div className={styles.laneTrack} style={{ ...laneStyle(lanes.get(lane.id)), gridRow : row + 1 }}>
                            {lane.id === "root" ? null : <span className={styles.laneLife} style={{ left : position(first), right : `calc(100% - ${position(last)})` }} />}
                            {steps.map(step => (
                                <span
                                    key={step.index}
                                    className={styles.dot}
                                    data-kind={step.kind}
                                    data-past={step.index <= index ? "true" : undefined}
                                    data-current={step.index === index ? "true" : undefined}
                                    style={{ left : position(step.index) }}
                                />
                            ))}
                        </div>
                    </Fragment>
                );
            })}
            <div
                ref={track}
                className={styles.scrub}
                style={{ gridRow : `1 / ${rows.length + 1}` }}
                aria-hidden="true"
                onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    seek(event);
                }}
                onPointerMove={(event) => {
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) seek(event);
                }}
            >
                <span className={styles.playhead} style={{ left : position(index) }} />
            </div>
        </div>
    );
}

/** The console of the scenario. With a second trace, it shows the lines of the two implementations next to each other. */
export function ConsoleView({ trace, index, lanes, compare, compareLabel } : ViewProps & { compare? : Trace | undefined; compareLabel? : string }) {
    const shown = trace.logs.filter(log => log.step <= index);
    if (compare === undefined) {
        return (
            <ol className={styles.console} aria-live="polite">
                {shown.length === 0 ? <li className={styles.consoleEmpty}>No output yet.</li> : null}
                {shown.map((log, position) => (
                    <li key={position} style={laneStyle(lanes.get(log.lane))} data-new={log.step === index ? "true" : undefined}>
                        <i aria-hidden="true" />
                        <code>{log.text}</code>
                    </li>
                ))}
            </ol>
        );
    }
    return (
        <div className={styles.compare}>
            <span className={styles.compareHead}>async-browser-context</span>
            <span className={styles.compareHead}>{compareLabel}</span>
            {shown.length === 0 ? <span className={styles.consoleEmpty}>No output yet.</span> : null}
            {shown.map((log, position) => {
                const other = compare.logs[position];
                const same = other?.text === log.text;
                return (
                    <Fragment key={position}>
                        <span className={styles.compareCell} style={laneStyle(lanes.get(log.lane))} data-new={log.step === index ? "true" : undefined}>
                            <i aria-hidden="true" /><code>{log.text}</code>
                        </span>
                        <span className={styles.compareCell} data-status={same ? "same" : "different"} data-new={log.step === index ? "true" : undefined}>
                            <span className={styles.compareIcon} aria-label={same ? "Same" : "Different"}>{same ? "✓" : "✗"}</span>
                            <code>{other?.text ?? "(no line)"}</code>
                        </span>
                    </Fragment>
                );
            })}
        </div>
    );
}

/** The text of the current step: what happens, the frames that change and the searches of the reads. */
export function StepView({ trace, index, frames, lanes, compare } : ViewProps & { compare? : Trace | undefined }) {
    const step = trace.steps[index];
    if (!step) return null;
    const text = describeStep(trace, step, frames);
    // The reads of the two traces are in the same order, so the position of a read finds the read of the other trace.
    const before = trace.steps.slice(0, index).reduce((sum, item) => sum + item.lookups.length, 0);
    const compareLookups = compare?.steps.flatMap(item => item.lookups) ?? [];
    return (
        <div className={styles.stepText} aria-live="polite" style={laneStyle(lanes.get(step.lane))}>
            <p className={styles.stepTitle}><i aria-hidden="true" />{text.title}</p>
            <ul>
                {text.sentences.map((sentence, key) => <li key={key}>{sentence}</li>)}
                {compare === undefined ? null : step.lookups.map((lookup, key) => {
                    const other = compareLookups[before + key];
                    if (other === undefined || other.value === lookup.value) return null;
                    return <li key={`compare-${key}`} className={styles.stepWarning}>A global variable gives {other.value} here, not {lookup.value}.</li>;
                })}
            </ul>
        </div>
    );
}
