import { describe, expect, it } from "vitest";
import { TRANSFORM_INPUTS, transformExamples } from "./transform-examples";

describe("transformExamples", () => {
    it("gives one output for each input, with the code of the preset", async () => {
        const examples = await transformExamples();
        expect(examples.map(example => example.id)).toEqual(TRANSFORM_INPUTS.map(input => input.id));
        for (const example of examples) {
            expect(example.output).not.toBe("");
            expect(example.output).not.toMatch(/\basync\s+(function|\()/);
        }
    });

    it("imports coroutine for async functions and bindGenerator for generators", async () => {
        const examples = await transformExamples();
        const byId = new Map(examples.map(example => [example.id, example.output]));
        expect(byId.get("await-in-expression")).toContain("from \"async-browser-context/runtime\"");
        expect(byId.get("await-in-expression")).toContain("coroutine");
        expect(byId.get("generator-method")).toContain("bindGenerator");
        expect(byId.get("generator-method")).toContain("items(limit)");
        expect(byId.get("async-generator")).toContain("bindGenerator");
    });
});
