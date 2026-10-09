// The internal store of the library. The debugger reads the current frame from it.
import { store, type Frame } from "../../../src/core/store";

/** One frame of the trace. The IDs are "root", "F1", "F2" and so on, in the order of creation. */
export type FrameInfo = {
    id : string;
    parentId : string | undefined;
    /** The variable that the frame sets. The root frame and frames from other code set no known variable. */
    variable : string | undefined;
    value : string | undefined;
    /** The first step that shows the frame. */
    createdAt : number;
    /** The last step of the run() call that made the frame. After it, the frame has no more code of that call. */
    endedAt : number | undefined;
    /** The lane of the frame: the context at the top of its chain, below the root frame. */
    lane : string;
};

/** One read of a variable: the frames that the search examined, from the current frame to the frame with the value. */
export type Lookup = {
    variable : string;
    value : string;
    /** The frame that sets the value, or undefined if no frame sets it. */
    holderId : string | undefined;
    /** The frames of the search, from the current frame up. Empty for a global variable. */
    path : readonly string[];
};

export type LogLine = {
    text : string;
    frameId : string;
    lane : string;
    /** The step that wrote the line. */
    step : number;
};

/**
 * One step of the trace:
 * - "line": a statement starts.
 * - "resume": an `await` is complete and the function continues.
 */
export type TraceStep = {
    index : number;
    kind : "line" | "resume";
    line : number;
    frameId : string;
    lane : string;
    lookups : Lookup[];
    logs : LogLine[];
};

/** One context at the top of the frame chains. The debugger shows one lane for each. */
export type Lane = {
    id : string;
    label : string;
    /** The color of the lane: 0 for the first context, 1 for the second, and so on. -1 for the root frame. */
    color : number;
};

export type Trace = {
    frames : readonly FrameInfo[];
    steps : readonly TraceStep[];
    lanes : readonly Lane[];
    logs : readonly LogLine[];
    /** The error of the scenario, if it stopped with an error. */
    error? : string;
};

/** This function gives a short text for a value, as the debugger shows it. */
export function formatValue(value : unknown) : string {
    if (typeof value === "string") return JSON.stringify(value);
    if (value === undefined) return "undefined";
    if (typeof value === "function") return "function";
    try {
        return JSON.stringify(value) ?? String(value);
    } catch {
        return String(value);
    }
}

/**
 * The tracer records the steps of one start of a scenario. The traced
 * library uses it when `run()` makes a frame, when code reads a variable,
 * and when the instrumented code starts a statement.
 */
export class Tracer {
    readonly #frames = new Map<Frame, FrameInfo>();
    readonly #variables = new Map<Frame, object>();
    readonly #list : FrameInfo[] = [];
    readonly #steps : TraceStep[] = [];
    readonly #logs : LogLine[] = [];
    readonly #lanes = new Map<string, Lane>();
    #error : string | undefined;

    constructor() {
        const root : FrameInfo = { id : "root", parentId : undefined, variable : undefined, value : undefined, createdAt : 0, endedAt : undefined, lane : "root" };
        this.#frames.set(store.root, root);
        this.#list.push(root);
        this.#lanes.set("root", { id : "root", label : "Root frame", color : -1 });
    }

    #register(frame : Frame, variable? : { key : object; name : string; value : unknown }) : FrameInfo {
        const known = this.#frames.get(frame);
        if (known !== undefined) return known;
        const parent = frame.parent === null ? undefined : this.#register(frame.parent);
        const info : FrameInfo = {
            id : `F${this.#list.length}`,
            parentId : parent?.id,
            variable : variable?.name,
            value : variable === undefined ? undefined : formatValue(variable.value),
            createdAt : this.#steps.length,
            endedAt : undefined,
            lane : "",
        };
        info.lane = parent === undefined || parent.id === "root" ? info.id : parent.lane;
        if (variable !== undefined) this.#variables.set(frame, variable.key);
        if (!this.#lanes.has(info.lane)) {
            const label = info.variable === undefined ? `Frame ${info.id}` : `${info.variable} = ${info.value ?? ""}`;
            this.#lanes.set(info.lane, { id : info.lane, label, color : this.#lanes.size - 1 });
        }
        this.#frames.set(frame, info);
        this.#list.push(info);
        return info;
    }

    /** `run()` made `frame` for the variable `key`. */
    enterFrame(frame : Frame, key : object, name : string, value : unknown) : void {
        this.#register(frame, { key, name, value });
    }

    /** The `run()` call of `frame` is complete. */
    endFrame(frame : Frame) : void {
        const info = this.#frames.get(frame);
        if (info !== undefined && info.endedAt === undefined) info.endedAt = Math.max(info.createdAt, this.#steps.length - 1);
    }

    #step(kind : TraceStep["kind"], line : number) : void {
        const frame = this.#register(store.current);
        this.#steps.push({ index : this.#steps.length, kind, line, frameId : frame.id, lane : frame.lane, lookups : [], logs : [] });
    }

    /** A statement on `line` starts. */
    at(line : number) : void {
        this.#step("line", line);
    }

    /** An `await` on `line` is complete. */
    after(line : number) : void {
        this.#step("resume", line);
    }

    /** Code read the variable `key` and got `value`. For a global variable, `global` is true: no frame holds the value. */
    lookup(key : object, name : string, value : unknown, global = false) : void {
        const path : string[] = [];
        let holderId : string | undefined;
        if (!global) {
            for (let frame : Frame | null = store.current; frame !== null; frame = frame.parent) {
                const info = this.#register(frame);
                path.push(info.id);
                if (this.#variables.get(frame) === key) {
                    holderId = info.id;
                    break;
                }
            }
        }
        this.#current()?.lookups.push({ variable : name, value : formatValue(value), holderId, path });
    }

    /** The scenario wrote a line with `log()`. */
    log(text : string) : void {
        const frame = this.#register(store.current);
        const line : LogLine = { text, frameId : frame.id, lane : frame.lane, step : Math.max(0, this.#steps.length - 1) };
        this.#logs.push(line);
        this.#current()?.logs.push(line);
    }

    fail(reason : unknown) : void {
        this.#error = reason instanceof Error ? reason.message : String(reason);
    }

    #current() : TraceStep | undefined {
        return this.#steps.at(-1);
    }

    result() : Trace {
        return {
            frames : this.#list.map(frame => ({ ...frame })),
            steps : this.#steps,
            lanes : [...this.#lanes.values()],
            logs : this.#logs,
            ...(this.#error === undefined ? {} : { error : this.#error }),
        };
    }
}
