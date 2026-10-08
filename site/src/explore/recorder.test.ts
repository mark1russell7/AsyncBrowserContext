import { describe, expect, it } from "vitest";
import { ROOT, restoredGlobalImplementation } from "./implementations";
import { classify, createRecorder, summarize } from "./recorder";

describe("recorder", () => {
    it("classifies a read as correct, lost or wrong", () => {
        expect(classify("A", "A")).toBe("correct");
        expect(classify("A", ROOT)).toBe("lost");
        expect(classify("A", "B")).toBe("wrong");
        expect(classify(ROOT, ROOT)).toBe("correct");
    });

    it("records each read in order and gives the value that it read", () => {
        const variable = restoredGlobalImplementation.createVariable("id");
        const recorder = createRecorder(variable);
        const seen = variable.run("A", () => recorder.record("A", "inside", "A"));
        recorder.record("A", "outside", "A");
        expect(seen).toBe("A");
        expect(recorder.reads()).toEqual([
            { order : 1, task : "A", step : "inside", expected : "A", seen : "A", status : "correct" },
            { order : 2, task : "A", step : "outside", expected : "A", seen : ROOT, status : "lost" },
        ]);
        expect(summarize(recorder.reads())).toEqual({ total : 2, correct : 1, lost : 1, wrong : 0 });
    });
});
