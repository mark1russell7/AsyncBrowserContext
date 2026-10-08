import { Variable } from "async-browser-context";
// The internal store of the library. The frame tree reads the current frame from it.
import { store, type Frame } from "../../../src/core/store";

/** One frame that a scenario made, with the variable value that the frame sets. */
export type FrameNode = {
    id : string;
    parentId : string | undefined;
    /** The value that `run()` set in this frame, for example "requestId = r-1". The root frame sets no value. */
    sets : string;
    depth : number;
};

/** One step of a frame scenario: the current frame and the values of the variables at that point. */
export type FrameStep = {
    label : string;
    note : string;
    currentId : string;
    values : Readonly<Record<string, string>>;
};

export type FrameTrace = {
    frames : readonly FrameNode[];
    steps : readonly FrameStep[];
};

/** The function that a scenario uses at each step. `sets` names the value of a new frame. */
export type Capture = (label : string, note : string, sets? : string) => void;

export type FrameScenario = {
    id : string;
    title : string;
    summary : string;
    code : string;
    start(capture : Capture, variables : { requestId : Variable<string>; userId : Variable<string> }) : Promise<void>;
};

/**
 * This function starts a scenario and records the current frame of the real
 * store at each step. It gives each frame an ID in the order in which the
 * scenario found it: "root", "F1", "F2" and so on.
 */
export async function traceFrames(scenario : FrameScenario) : Promise<FrameTrace> {
    const ids = new Map<Frame, string>([[store.root, "root"]]);
    const frames : FrameNode[] = [{ id : "root", parentId : undefined, sets : "No value", depth : 0 }];
    const steps : FrameStep[] = [];
    const requestId = new Variable<string>({ name : "requestId" });
    const userId = new Variable<string>({ name : "userId" });

    const register = (frame : Frame, sets : string | undefined) : string => {
        const known = ids.get(frame);
        if (known !== undefined) return known;
        const parentId = frame.parent === null ? undefined : register(frame.parent, undefined);
        const id = `F${ids.size}`;
        ids.set(frame, id);
        const parent = frames.find(node => node.id === parentId);
        frames.push({ id, parentId, sets : sets ?? "A value", depth : (parent?.depth ?? 0) + 1 });
        return id;
    };

    const capture : Capture = (label, note, sets) => {
        const currentId = register(store.current, sets);
        steps.push({
            label,
            note,
            currentId,
            values : { requestId : requestId.get() ?? "(no value)", userId : userId.get() ?? "(no value)" },
        });
    };

    await scenario.start(capture, { requestId, userId });
    return { frames, steps };
}

const nestedRuns : FrameScenario = {
    id : "nested",
    title : "Nested run() calls",
    summary : "Each run() makes a frame. The parent of the new frame is the current frame. A variable gets its value from the nearest frame that sets it.",
    code : [
        "await requestId.run(\"r-1\", async () => {",
        "    await userId.run(\"u-7\", async () => {",
        "        await null;",
        "    });",
        "    requestId.run(\"r-2\", () => { /* ... */ });",
        "});",
    ].join("\n"),
    async start(capture, { requestId, userId }) {
        capture("Start", "The root frame is current. The two variables have no value.");
        await requestId.run("r-1", async () => {
            capture("requestId.run(\"r-1\")", "run() makes a frame and makes it current. The parent of the frame is the root frame.", "requestId = r-1");
            await userId.run("u-7", async () => {
                capture("userId.run(\"u-7\")", "A second run() makes a child frame. userId.get() finds u-7 in this frame. requestId.get() finds r-1 in the parent frame.", "userId = u-7");
                await null;
                capture("After await null", "The coroutine sets the frame of the async function again before the next step of the function.");
            });
            capture("After userId.run()", "The promise of userId.run() is settled. The frame of the outer function is current again.");
            requestId.run("r-2", () => {
                capture("requestId.run(\"r-2\")", "A nested run() of the same variable hides the value of the parent frame.", "requestId = r-2");
            });
            capture("After requestId.run(\"r-2\")", "The synchronous run() is complete. Its frame is not current, and no code keeps it.");
        });
        capture("End", "All run() calls are complete. The root frame is current again.");
    },
};

const twoRequests : FrameScenario = {
    id : "two-requests",
    title : "Two requests at the same time",
    summary : "Two async functions continue in turns. Before each step, the coroutine sets the frame of the function. After the step, it sets the previous frame again, so the root frame is current between the steps.",
    code : [
        "const first = requestId.run(\"r-1\", async () => {",
        "    await null;",
        "    await null;",
        "});",
        "const second = requestId.run(\"r-2\", async () => {",
        "    await null;",
        "    await null;",
        "});",
        "await Promise.all([first, second]);",
    ].join("\n"),
    async start(capture, { requestId }) {
        capture("Start", "The root frame is current.");
        const first = requestId.run("r-1", async () => {
            capture("r-1 starts", "run() makes the frame of request r-1.", "requestId = r-1");
            await null;
            capture("r-1 continues", "The coroutine sets the frame of request r-1 again.");
            await null;
            capture("r-1 continues again", "Each step of request r-1 gets the frame of request r-1.");
        });
        capture("Between the two run() calls", "The first function stopped at its first await. The root frame is current again.");
        const second = requestId.run("r-2", async () => {
            capture("r-2 starts", "run() makes the frame of request r-2. Its parent is the root frame, not the frame of r-1.", "requestId = r-2");
            await null;
            capture("r-2 continues", "The steps of the two requests alternate, and each step gets the frame of its own request.");
            await null;
            capture("r-2 continues again", "The frame of request r-1 is not current here.");
        });
        await Promise.all([first, second]);
        capture("End", "The two requests are complete. The root frame is current.");
    },
};

export const FRAME_SCENARIOS : readonly FrameScenario[] = [nestedRuns, twoRequests];
