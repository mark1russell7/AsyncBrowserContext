import { Background, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps, Handle } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTheme } from "../theme/ThemeProvider";
import { FRAME_SCENARIOS, traceFrames, type FrameNode, type FrameTrace } from "./frames";
import styles from "./Explore.module.css";
import treeStyles from "./FrameTree.module.css";

type FrameData = { node : FrameNode; current : boolean; future : boolean };
type FrameFlowNode = Node<FrameData, "frame">;

function FrameView({ data } : NodeProps<FrameFlowNode>) {
    return (
        <div
            className={treeStyles.node}
            data-current={data.current ? "true" : undefined}
            data-future={data.future ? "true" : undefined}
            data-root={data.node.parentId === undefined ? "true" : undefined}
        >
            <Handle type="target" position={Position.Top} isConnectable={false} className={treeStyles.handle} />
            <span className={treeStyles.id}>{data.node.id === "root" ? "Root frame" : `Frame ${data.node.id}`}</span>
            <span className={treeStyles.sets}>{data.node.sets}</span>
            {data.current ? <span className={treeStyles.badge}>Current</span> : null}
            {data.future ? <span className={treeStyles.later}>Made at a later step</span> : null}
            <Handle type="source" position={Position.Bottom} isConnectable={false} className={treeStyles.handle} />
        </div>
    );
}

// Outside the component: React Flow needs a stable object.
const nodeTypes = { frame : FrameView };

const NODE_WIDTH = 190;
const LEVEL_HEIGHT = 120;

/** This function puts each frame in a row for its depth, with the frames of one depth next to each other. */
function layout(frames : readonly FrameNode[], currentId : string, found : ReadonlySet<string>) : FrameFlowNode[] {
    const columns = new Map<number, number>();
    const widest = Math.max(...frames.map(frame => frames.filter(other => other.depth === frame.depth).length));
    return frames.map((frame) : FrameFlowNode => {
        const column = columns.get(frame.depth) ?? 0;
        columns.set(frame.depth, column + 1);
        const count = frames.filter(other => other.depth === frame.depth).length;
        const offset = ((widest - count) * (NODE_WIDTH + 40)) / 2;
        return {
            id : frame.id,
            type : "frame",
            position : { x : offset + column * (NODE_WIDTH + 40), y : frame.depth * LEVEL_HEIGHT },
            data : { node : frame, current : frame.id === currentId, future : frame.id !== "root" && !found.has(frame.id) },
            draggable : false,
            connectable : false,
            ariaLabel : `${frame.id}: ${frame.sets}${frame.id === currentId ? ", current" : ""}`,
        };
    });
}

function edges(frames : readonly FrameNode[]) : Edge[] {
    return frames.filter(frame => frame.parentId !== undefined).map((frame) : Edge => ({
        id : `${frame.parentId ?? ""}->${frame.id}`,
        source : frame.parentId ?? "",
        target : frame.id,
        type : "smoothstep",
        label : "parent of",
        markerEnd : { type : MarkerType.ArrowClosed, width : 14, height : 14 },
        focusable : false,
    }));
}

export type FrameTreeProps = {
    /** The ID of the first scenario: "nested" or "two-requests". */
    scenario? : string;
};

/**
 * The frame tree. It starts a scenario with the real library, records the
 * current frame of the store at each step, and shows the frames as a graph.
 * The step controls move through the steps.
 */
export function FrameTree({ scenario : initialScenario = "nested" } : FrameTreeProps) {
    const { resolved } = useTheme();
    const [scenarioId, setScenarioId] = useState(initialScenario);
    const [trace, setTrace] = useState<FrameTrace>();
    const [index, setIndex] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [error, setError] = useState<string>();
    const sliderId = useId();
    const generation = useRef(0);
    const scenario = FRAME_SCENARIOS.find(candidate => candidate.id === scenarioId) ?? FRAME_SCENARIOS[0]!;

    useEffect(() => {
        const current = ++generation.current;
        setTrace(undefined);
        setIndex(0);
        setPlaying(false);
        traceFrames(scenario).then(
            (result) => { if (current === generation.current) setTrace(result); },
            (reason : unknown) => { if (current === generation.current) setError(reason instanceof Error ? reason.message : String(reason)); },
        );
    }, [scenario]);

    const last = (trace?.steps.length ?? 1) - 1;
    useEffect(() => {
        if (!playing) return undefined;
        if (index >= last) {
            setPlaying(false);
            return undefined;
        }
        const timer = window.setTimeout(() => setIndex(value => Math.min(value + 1, last)), 1100);
        return () => window.clearTimeout(timer);
    }, [playing, index, last]);

    const step = trace?.steps[index];
    const shown = useMemo(() => {
        if (!trace || !step) return { nodes : [] as FrameFlowNode[], edges : [] as Edge[] };
        // All frames show, so the layout does not move. A frame that a later step makes is dim.
        const found = new Set(trace.steps.slice(0, index + 1).map(item => item.currentId));
        return { nodes : layout(trace.frames, step.currentId, found), edges : edges(trace.frames) };
    }, [trace, step, index]);

    return (
        <div className={styles.widget}>
            <ul className={styles.choices} aria-label="Scenario">
                {FRAME_SCENARIOS.map(candidate => (
                    <li key={candidate.id}>
                        <button type="button" className={styles.choice} aria-pressed={candidate.id === scenarioId} onClick={() => setScenarioId(candidate.id)}>
                            {candidate.title}
                        </button>
                    </li>
                ))}
            </ul>
            <p className={styles.summary}>{scenario.summary}</p>
            <pre className={styles.code}><code>{scenario.code}</code></pre>
            {error ? <p className={styles.error} role="alert">The scenario stopped with an error: {error}</p> : null}
            {trace && step ? (
                <>
                    <div className={styles.steps}>
                        <button type="button" className="button" disabled={index === 0} onClick={() => { setPlaying(false); setIndex(index - 1); }}>Previous step</button>
                        <button type="button" className="button" disabled={index >= last} onClick={() => { setPlaying(false); setIndex(index + 1); }}>Next step</button>
                        <button type="button" className="button" data-variant="primary" onClick={() => {
                            if (index >= last) setIndex(0);
                            setPlaying(value => !value);
                        }}
                        >
                            {playing ? "Stop" : "Show all steps"}
                        </button>
                        <label htmlFor={sliderId} className="visually-hidden">Step</label>
                        <input id={sliderId} type="range" min={0} max={last} value={index} onChange={(event) => { setPlaying(false); setIndex(Number(event.target.value)); }} />
                        <span className={styles.meta}>Step {index + 1} of {last + 1}</span>
                    </div>
                    <div className={treeStyles.layout}>
                        <div className={treeStyles.canvas}>
                            <ReactFlow
                                nodes={shown.nodes}
                                edges={shown.edges}
                                nodeTypes={nodeTypes}
                                colorMode={resolved}
                                fitView
                                fitViewOptions={{ padding : 0.15, maxZoom : 1 }}
                                maxZoom={1.4}
                                nodesDraggable={false}
                                nodesConnectable={false}
                                edgesFocusable={false}
                                zoomOnScroll={false}
                                preventScrolling={false}
                                proOptions={{ hideAttribution : true }}
                            >
                                <Background gap={16} size={1} />
                            </ReactFlow>
                        </div>
                        <aside className={treeStyles.panel} aria-live="polite" aria-label="Current step">
                            <p className={styles.label}>Step {index + 1}</p>
                            <p className={treeStyles.stepTitle}><code>{step.label}</code></p>
                            <p>{step.note}</p>
                            <p className={styles.label}>The current frame</p>
                            <p><code>{step.currentId}</code></p>
                            <p className={styles.label}>The values that get() gives</p>
                            <dl className={treeStyles.values}>
                                {Object.entries(step.values).map(([name, value]) => (
                                    <div key={name}>
                                        <dt><code>{name}.get()</code></dt>
                                        <dd><code>{value}</code></dd>
                                    </div>
                                ))}
                            </dl>
                        </aside>
                    </div>
                    <details className={treeStyles.list}>
                        <summary>Show the steps as a list</summary>
                        <ol>
                            {trace.steps.map((item, position) => (
                                <li key={position}>
                                    <code>{item.label}</code>: the current frame is <code>{item.currentId}</code>. {item.note}
                                </li>
                            ))}
                        </ol>
                    </details>
                </>
            ) : (
                <p aria-busy="true" className={styles.meta}>The scenario starts.</p>
            )}
        </div>
    );
}

export default FrameTree;
