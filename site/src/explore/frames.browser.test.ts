import { describe, expect, it } from "vitest";
import { FRAME_SCENARIOS, traceFrames } from "./frames";

describe("frame tree", () => {
    it("records the frames of nested run() calls, with each parent", async () => {
        const trace = await traceFrames(FRAME_SCENARIOS[0]!);
        expect(trace.frames.map(frame => [frame.id, frame.parentId, frame.sets])).toEqual([
            ["root", undefined, "No value"],
            ["F1", "root", "requestId = r-1"],
            ["F2", "F1", "userId = u-7"],
            ["F3", "F1", "requestId = r-2"],
        ]);
        expect(trace.steps.map(step => step.currentId)).toEqual(["root", "F1", "F2", "F2", "F1", "F3", "F1", "root"]);
        expect(trace.steps[2]?.values).toEqual({ requestId : "r-1", userId : "u-7" });
        expect(trace.steps[5]?.values).toEqual({ requestId : "r-2", userId : "(no value)" });
    });

    it("gives each of two concurrent requests its own frame, and the root frame between them", async () => {
        const trace = await traceFrames(FRAME_SCENARIOS[1]!);
        expect(trace.frames.map(frame => frame.parentId)).toEqual([undefined, "root", "root"]);
        const sequence = trace.steps.map(step => step.currentId);
        expect(sequence[0]).toBe("root");
        expect(sequence[2]).toBe("root");
        expect(sequence.at(-1)).toBe("root");
        for (const step of trace.steps) {
            if (step.label.startsWith("r-1")) expect(step.currentId).toBe("F1");
            if (step.label.startsWith("r-2")) expect(step.currentId).toBe("F2");
        }
    });
});
