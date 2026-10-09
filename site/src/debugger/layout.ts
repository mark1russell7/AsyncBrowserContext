import type { FrameInfo, Lane, Lookup, Trace, TraceStep } from "./trace";

export const NODE_WIDTH = 168;
export const NODE_HEIGHT = 58;
const H_GAP = 22;
const V_GAP = 50;

/** The position of one frame in the frame graph. `x` and `y` are the top left corner. */
export type NodeBox = { id : string; x : number; y : number };

export type GraphLayout = {
    boxes : ReadonlyMap<string, NodeBox>;
    width : number;
    height : number;
};

/**
 * This function puts the frames in a tree. The root frame is at the top. Each
 * frame is below its parent, and a parent is above the middle of its children. The
 * layout uses all the frames of the trace, so no frame moves when a step
 * shows a new frame.
 */
export function layoutFrames(frames : readonly FrameInfo[]) : GraphLayout {
    const children = new Map<string | undefined, FrameInfo[]>();
    for (const frame of frames) {
        const list = children.get(frame.parentId) ?? [];
        list.push(frame);
        children.set(frame.parentId, list);
    }
    const boxes = new Map<string, NodeBox>();
    let slot = 0;
    let depthMax = 0;
    const place = (frame : FrameInfo, depth : number) : number => {
        depthMax = Math.max(depthMax, depth);
        const kids = children.get(frame.id) ?? [];
        let x : number;
        if (kids.length === 0) {
            x = slot * (NODE_WIDTH + H_GAP);
            slot++;
        } else {
            const positions = kids.map(kid => place(kid, depth + 1));
            x = ((positions[0] ?? 0) + (positions.at(-1) ?? 0)) / 2;
        }
        boxes.set(frame.id, { id : frame.id, x, y : depth * (NODE_HEIGHT + V_GAP) });
        return x;
    };
    for (const top of children.get(undefined) ?? []) place(top, 0);
    return {
        boxes,
        width : Math.max(1, slot) * (NODE_WIDTH + H_GAP) - H_GAP,
        height : (depthMax + 1) * (NODE_HEIGHT + V_GAP) - V_GAP,
    };
}

/** The path of the line from a frame to its parent: from the top of the child to the bottom of the parent. */
export function edgePath(child : NodeBox, parent : NodeBox) : string {
    const x1 = child.x + NODE_WIDTH / 2;
    const y1 = child.y;
    const x2 = parent.x + NODE_WIDTH / 2;
    const y2 = parent.y + NODE_HEIGHT;
    const middle = (y1 + y2) / 2;
    return `M ${x1} ${y1} C ${x1} ${middle} ${x2} ${middle} ${x2} ${y2}`;
}

/** The CSS color of a lane. The colors are the chart series of the site, in a fixed order. */
export function laneColor(lane : Pick<Lane, "color"> | undefined) : string {
    if (lane === undefined || lane.color < 0) return "var(--status-neutral)";
    const series = [1, 2, 3, 7, 5, 4];
    return `var(--series-${series[lane.color % series.length] ?? 1})`;
}

/** The state of a frame at one step. */
export type FrameState = "hidden" | "active" | "ended";

export function frameState(frame : FrameInfo, step : number) : FrameState {
    if (frame.id !== "root" && frame.createdAt > step) return "hidden";
    if (frame.endedAt !== undefined && frame.endedAt < step) return "ended";
    return "active";
}

/** The name of a frame in a sentence. */
export function frameName(frame : FrameInfo | undefined) : string {
    if (frame === undefined || frame.id === "root") return "the root frame";
    return frame.variable === undefined ? `frame ${frame.id}` : `frame ${frame.id} (${frame.variable} = ${frame.value ?? ""})`;
}

/** This function tells in words what the search of one read did. */
export function describeLookup(lookup : Lookup, frames : ReadonlyMap<string, FrameInfo>) : string {
    if (lookup.path.length === 0) return `The global variable ${lookup.variable} gives ${lookup.value}.`;
    const searched = lookup.path.map(id => (id === "root" ? "root" : id)).join(" → ");
    if (lookup.holderId === undefined) return `get() of ${lookup.variable} searched ${searched} and found no value. It gives ${lookup.value}.`;
    if (lookup.path.length === 1) return `get() of ${lookup.variable} found ${lookup.value} in the current frame, ${lookup.holderId}.`;
    const holder = frames.get(lookup.holderId);
    return `get() of ${lookup.variable} searched ${searched} and found ${lookup.value} in ${holder?.id ?? lookup.holderId}.`;
}

/** The text of one step: a title and the sentences that tell what happens. */
export type StepText = { title : string; sentences : string[] };

/** This function tells in words what happens at one step of a trace. */
export function describeStep(trace : Trace, step : TraceStep, frames : ReadonlyMap<string, FrameInfo>) : StepText {
    const current = frames.get(step.frameId);
    const sentences : string[] = [];
    let title : string;
    if (step.kind === "resume") {
        title = `Line ${step.line}: the await is complete`;
        sentences.push(`The runtime makes ${frameName(current)} current again, and the function continues.`);
    } else {
        title = `Line ${step.line}`;
        sentences.push(`The statement starts in ${frameName(current)}.`);
    }
    for (const frame of trace.frames) {
        if (frame.id !== "root" && frame.createdAt === step.index) {
            sentences.push(`run() made ${frameName(frame)}. Its parent is ${frameName(frames.get(frame.parentId ?? "root"))}.`);
        }
        if (frame.endedAt !== undefined && frame.endedAt === step.index - 1) {
            sentences.push(`The run() call of ${frame.id} is complete. No code of that call runs in ${frame.id} after this.`);
        }
    }
    for (const lookup of step.lookups) sentences.push(describeLookup(lookup, frames));
    return { title, sentences };
}
